import { MobileStore, digest, type MobileState, type StoragePort } from "./store";
import type { Asset, Kind } from "../lib/models";
import { createTransport, createWebKitTransport, type BridgeReply, type BridgeMessage } from "./transport";

declare global {
  interface Window {
    __qyDrain: () => string;
    __qyReply: (message: BridgeReply) => string;
    __qyTransportFailed: (message: string) => string;
    __qyInitial?: { state: MobileState | null; deviceId: string; folder: string | null };
    __qyReady?: boolean;
    __qyShowError?: (message: string) => void;
    __qyNativeApp?: boolean;
    webkit?: { messageHandlers?: { qingyanNative?: { postMessage: (message: BridgeMessage) => void } } };
    __qingyanMobile?: MobileController;
  }
}
export function base64(bytes: Uint8Array) {
  let raw = "";
  for (let i = 0; i < bytes.length; i += 32768) raw += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(raw);
}
export function unbase64(value: string) {
  const raw = atob(value), bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
type Call = (method: string, params?: any) => Promise<any>;
export function createBridge(): Call {
  const handler = window.webkit?.messageHandlers?.qingyanNative;
  if (window.__qyNativeApp && handler) return createWebKitTransport(window, message => handler.postMessage(message));
  return createTransport(window);
}
export type MobileStatus = { folder: string; syncing: boolean; pending: boolean; lastWritten: string; lastPulled: string; error: string; conflicts: number };
export class MobileController {
  store!: MobileStore;
  status: MobileStatus = { folder: "", syncing: false, pending: false, lastWritten: "", lastPulled: "", error: "", conflicts: 0 };
  private deviceId = "";
  private queue: Promise<unknown> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;
  private imageUrls = new Map<string, string>();
  private lastRefresh = 0;
  private revision = 0;
  private exchange?: Promise<{ conflicts: number; changes: number }>;
  constructor(private call: Call) {}
  private emit() { window.dispatchEvent(new Event("qingyan-mobile-status")); }
  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.catch(() => {});
    return result;
  }
  async boot() {
    const boot = window.__qyInitial || await this.call("boot");
    this.deviceId = boot.deviceId;
    this.status.folder = boot.folder || "";
    const port: StoragePort = {
      persist: (state: MobileState) => this.call("persist", { state }),
      readAsset: async id => unbase64(await this.call("readAsset", { id })),
      writeAsset: (id, bytes) => this.call("writeAsset", { id, base64: base64(bytes) }),
      uuid: () => this.call("uuid"),
    };
    this.store = new MobileStore(port, boot.state || undefined);
    await this.hydrateImages();
    this.installFetch();
    document.addEventListener("click", e => {
      const link = (e.target as Element).closest?.("a");
      if (!link) return;
      const raw = link.getAttribute("href") || "";
      const id = raw.startsWith("qyasset:") ? raw.slice(8).split("?")[0] : [...this.imageUrls].find(([, url]) => raw.startsWith(url))?.[0];
      if (id) {
        e.preventDefault();
        const asset = this.store.state.assets.find(a => a.id === id);
        void this.call("openAsset", { id, name: asset?.name }).catch(e => alert(e.message));
      }
    }, true);
    return this;
  }
  assetUrl(asset: Asset) { return this.imageUrls.get(asset.id) || `qyasset:${asset.id}`; }
  studyTool(method: "scanPDF" | "renderPDFPage" | "pickQuestionPhoto" | "aiStatus" | "aiKey" | "aiSolve" | "aiVariant", params?: Record<string, unknown>) {
    if (!window.__qyNativeApp) return Promise.reject(new Error("请在清研 iPhone 或 iPad App 中使用此功能"));
    return this.call(method, params);
  }
  async download(blob: Blob, name: string) {
    return this.call("exportFile", { name, base64: base64(new Uint8Array(await blob.arrayBuffer())) });
  }
  private async hydrateImages() {
    for (const asset of this.store.state.assets) {
      if (!asset.mime.startsWith("image/") || this.imageUrls.has(asset.id)) continue;
      const data = await this.store.bytes(asset.id);
      this.imageUrls.set(asset.id, URL.createObjectURL(new Blob([new Uint8Array(data)], { type: asset.mime })));
    }
  }
  private dirty() {
    this.revision++;
    this.status.pending = true;
    this.emit();
    if (this.timer) clearTimeout(this.timer);
    if (this.status.folder) this.timer = setTimeout(() => { void this.sync().catch(() => {}); }, 2500);
  }
  async connect() {
    const result = await this.call("connect");
    this.status.folder = result.folder;
    this.emit();
    return this.sync();
  }
  sync(): Promise<{ conflicts: number; changes: number }> {
    if (this.exchange) return this.exchange;
    this.exchange = this.exchangeFiles().finally(() => {
      this.exchange = undefined;
      if (this.status.pending && this.status.folder && !this.status.error) {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => { void this.sync().catch(() => {}); }, 2500);
      }
    });
    return this.exchange;
  }
  private async exchangeFiles() {
      this.status.syncing = true;
      this.status.error = "";
      this.emit();
      try {
        const packages: string[] = await this.call("listPackages");
        let conflicts = 0, changes = 0;
        for (const name of packages) {
          if (name === `device-${this.deviceId}.zip`) continue;
          const bytes = unbase64(await this.call("readPackage", { name }));
          if (this.store.state.hashes[name] === digest(bytes)) continue;
          const result = await this.run(() => this.store.importBackup(bytes, true, name));
          conflicts += result.conflicts;
          changes += result.added + result.updated + result.deleted;
        }
        await this.run(() => this.hydrateImages());
        this.status.lastPulled = new Date().toISOString();
        const snapshot = await this.run(async () => ({
          bytes: await this.store.exportBackup(), revision: this.revision,
          attachments: this.store.state.assets.map(a => ({ id: a.id, name: a.name })),
        }));
        const result = await this.call("publish", { base64: base64(snapshot.bytes), attachments: snapshot.attachments });
        this.status.lastWritten = result.writtenAt;
        this.status.pending = this.revision !== snapshot.revision;
        this.status.conflicts = conflicts;
        if (conflicts) this.status.error = `有 ${conflicts} 条同时间的不同版本，已保留手机记录，原同步包仍保留。`;
        if (changes) window.dispatchEvent(new Event("qingyan-mobile-updated"));
        return { conflicts, changes };
      } catch (e) {
        this.status.pending = true;
        this.status.error = (e as Error).message;
        throw e;
      } finally { this.status.syncing = false; this.emit(); }
  }
  refresh() {
    if (!this.status.folder || this.status.syncing || Date.now() - this.lastRefresh < 60000) return;
    this.lastRefresh = Date.now();
    void this.sync().catch(() => {});
  }
  private installFetch() {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (resource: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof resource === "string" ? resource : resource instanceof URL ? resource.href : resource.url;
      if (!url.startsWith("/api/")) {
        if (/^(blob:|data:)/.test(url)) return nativeFetch(resource, init);
        throw new Error("手机本地版无需网页服务器");
      }
      // Render the cache immediately even when an iCloud download is still pending.
      if (url.split("?")[0] === "/api/v1/records" && (!init?.method || init.method === "GET"))
        return new Response(JSON.stringify(this.store.all()), { headers: { "Content-Type": "application/json" } });
      try {
        const value = await this.run(async () => {
          const method = init?.method || "GET", path = url.split("?")[0];
          const match = /^\/api\/v1\/records\/([a-z]+)(?:\/(.+))?$/.exec(path);
          if (match && method === "POST") { const result = await this.store.save(match[1] as Kind, JSON.parse(String(init?.body))); this.dirty(); return result; }
          if (match && match[2] && method === "DELETE") { await this.store.remove(match[1] as Kind, decodeURIComponent(match[2])); this.dirty(); return { ok: true }; }
          if (path === "/api/v1/assets" && method === "POST") {
            const file = (init?.body as FormData).get("file") as File;
            const result = await this.store.upload({ name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
            await this.hydrateImages(); this.dirty(); return result;
          }
          if (path === "/api/v1/local/info") return { dataDirectory: window.__qyNativeApp ? "此设备的清研 App 数据目录（本地缓存）" : "此 iPhone 的 Scriptable / QingyanMobile（本地缓存）" };
          if (path === "/api/v1/local/backup") return new Blob([new Uint8Array(await this.store.exportBackup())], { type: "application/zip" });
          if (path === "/api/v1/local/restore" && method === "POST") {
            const result = await this.store.importBackup(new Uint8Array(await (init!.body as Blob).arrayBuffer()), false);
            await this.hydrateImages(); this.dirty(); return result;
          }
          throw new Error("手机端不支持此操作");
        });
        return value instanceof Blob ? new Response(value) : new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
      } catch (e) { return new Response(JSON.stringify({ error: (e as Error).message }), { status: 400, headers: { "Content-Type": "application/json" } }); }
    };
  }
}
