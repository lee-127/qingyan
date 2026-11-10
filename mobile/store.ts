import JSZip from "jszip";
import hash from "hash.js";
import { schemas } from "../lib/validation";
import { EMPTY, type Kind, type Asset, type StudyData } from "../lib/models";

export const KINDS: Kind[] = ["material", "mistake", "paper", "score", "settings", "folder"];
export const MOBILE_LIMIT = 64 * 1024 * 1024;
export const digest = (bytes: Uint8Array) => {
  const value = hash.sha256();
  for (let i = 0; i < bytes.length; i += 65536) value.update(bytes.subarray(i, i + 65536));
  return value.digest("hex");
};
export const validId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export type SyncedAsset = Asset & { sha256: string; createdAt?: string };
export type Tombstone = { id: string; kind: Kind; deletedAt: string };
export type MobileState = {
  schemaVersion: 2;
  data: StudyData;
  assets: SyncedAsset[];
  tombstones: Tombstone[];
  hashes: Record<string, string>;
};
export const emptyState = (): MobileState => ({ schemaVersion: 2, data: structuredClone(EMPTY), assets: [], tombstones: [], hashes: {} });
export interface StoragePort {
  persist(state: MobileState): Promise<void>;
  readAsset(id: string): Promise<Uint8Array>;
  writeAsset(id: string, bytes: Uint8Array): Promise<void>;
  uuid(): Promise<string>;
}
const assetIds = (x: any): string[] => [x.file?.id, x.image?.id, ...(x.questions || []).map((q: any) => q.image?.id)].filter(Boolean);
const timestamp = (x: unknown) => typeof x === "string" && Number.isFinite(Date.parse(x));
const normalizedTime = (x: string) => new Date(x).toISOString();
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export class MobileStore {
  state: MobileState;
  constructor(private port: StoragePort, state?: MobileState) {
    this.state = state || emptyState();
    if (this.state.schemaVersion !== 2 || !this.state.assets || !this.state.data || !this.state.tombstones)
      throw new Error("手机缓存格式不正确，请先保留备份再恢复。");
    this.state.data.folder ??= [];
  }
  all() { return clone(this.state.data); }
  private async commit(next: MobileState) {
    await this.port.persist(next);
    this.state = next;
  }
  async save(kind: Kind, value: any) {
    if (!KINDS.includes(kind)) throw new Error("记录类型无效");
    const parsed = schemas[kind].safeParse(value);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "记录格式不正确");
    for (const id of assetIds(parsed.data)) if (!this.state.assets.some(a => a.id === id)) throw new Error("记录缺少附件，请重新上传");
    const next = clone(this.state);
    const id = value.id || await this.port.uuid();
    if (typeof id !== "string" || !id || id.length > 150) throw new Error("记录编号无效");
    if (KINDS.some(k => k !== kind && next.data[k].some(r => r.id === id))) throw new Error("记录编号发生冲突");
    const old = next.data[kind].find(r => r.id === id);
    const now = new Date().toISOString();
    const saved = { ...parsed.data, id, createdAt: old?.createdAt || now, updatedAt: now };
    (next.data[kind] as any[]) = [saved, ...next.data[kind].filter(r => r.id !== id)];
    next.tombstones = next.tombstones.filter(t => t.id !== id);
    await this.commit(next);
    return saved;
  }
  async remove(kind: Kind, id: string) {
    if (!KINDS.includes(kind) || !this.state.data[kind].some(r => r.id === id)) throw new Error("记录不存在");
    const next = clone(this.state);
    (next.data[kind] as any[]) = next.data[kind].filter(r => r.id !== id);
    next.tombstones = [...next.tombstones.filter(t => t.id !== id), { id, kind, deletedAt: new Date().toISOString() }];
    await this.commit(next);
  }
  async upload(file: { name: string; type: string; bytes: Uint8Array }) {
    const types: Record<string, string> = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain", md: "text/plain", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", zip: "application/zip" };
    const mime = types[file.name.split(".").pop()?.toLowerCase() || ""];
    if (!mime) throw new Error("支持 PDF、Word、文本、图片及 ZIP 文件");
    if (!file.bytes.length || file.bytes.length > 20 * 1024 * 1024) throw new Error("单个文件需在 20 MB 以内");
    if (this.state.assets.reduce((n, a) => n + a.size, 0) + file.bytes.length > MOBILE_LIMIT) throw new Error("手机运行版附件总量暂限 64 MB，请在电脑版管理较大的资料库。");
    const asset: SyncedAsset = { id: await this.port.uuid(), name: file.name.slice(0, 200), mime, size: file.bytes.length, sha256: digest(file.bytes), createdAt: new Date().toISOString() };
    await this.port.writeAsset(asset.id, file.bytes);
    const next = clone(this.state);
    next.assets.push(asset);
    await this.commit(next);
    return asset;
  }
  async bytes(id: string) {
    const asset = this.state.assets.find(a => a.id === id);
    if (!asset) throw new Error("附件不存在");
    const bytes = await this.port.readAsset(id);
    if (bytes.length !== asset.size || digest(bytes) !== asset.sha256) throw new Error(`附件「${asset.name}」校验失败，请重新同步`);
    return bytes;
  }
  async exportBackup() {
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({ schemaVersion: 2, app: "qingyan-mobile", exportedAt: new Date().toISOString(), data: this.state.data, assets: this.state.assets, tombstones: this.state.tombstones }));
    for (const asset of this.state.assets) zip.file(`files/${asset.id}`, await this.bytes(asset.id));
    return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 3 } });
  }
  async importBackup(bytes: Uint8Array, sync = true, sourceName?: string) {
    if (bytes.length > MOBILE_LIMIT) throw new Error("手机运行版同步包暂限 64 MB，请在电脑版管理较大的资料库。");
    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    const entry = zip.file("manifest.json");
    if (!entry) throw new Error("同步包缺少资料清单");
    if ((entry as any)._data?.uncompressedSize > 10 * 1024 * 1024) throw new Error("同步包清单过大");
    const incoming: any = JSON.parse(await entry.async("string"));
    if (incoming.schemaVersion !== 2 || !incoming.data || !Array.isArray(incoming.assets)) throw new Error("不支持的同步包格式");
    const next = clone(this.state), pendingAssets: { asset: SyncedAsset; bytes: Uint8Array }[] = [];
    let total = this.state.assets.reduce((n, a) => n + a.size, 0);
    const ids = new Set<string>();
    for (const a of incoming.assets) {
      if (!validId(a.id) || ids.has(a.id) || typeof a.name !== "string" || !a.name || a.name.length > 200 || typeof a.mime !== "string" || a.mime.length > 200 || !Number.isInteger(a.size) || a.size < 1 || a.size > 20 * 1024 * 1024) throw new Error("附件信息不正确");
      ids.add(a.id);
      const old = next.assets.find(x => x.id === a.id);
      if (!old) total += a.size;
      if (total > MOBILE_LIMIT) throw new Error("手机运行版附件总量暂限 64 MB，请在电脑版管理较大的资料库。");
      const file = zip.file(`files/${a.id}`);
      if (!file || ((file as any)._data?.uncompressedSize ?? a.size) !== a.size) throw new Error("附件缺失或大小不正确");
      const data = await file.async("uint8array");
      const sha256 = digest(data);
      if (data.length !== a.size || (a.sha256 && a.sha256 !== sha256)) throw new Error(`附件「${a.name}」校验失败`);
      if (old && old.sha256 !== sha256) throw new Error("附件编号冲突，已保留手机原数据");
      if (!old) {
        const asset: SyncedAsset = { id: a.id, name: a.name, mime: a.mime, size: a.size, sha256, createdAt: a.createdAt };
        next.assets.push(asset);
        pendingAssets.push({ asset, bytes: data });
      }
    }
    let added = 0, updated = 0, deleted = 0, conflicts = 0, skipped = 0;
    const seen = new Set<string>();
    for (const kind of KINDS) {
      if (kind === "folder" && incoming.data.folder === undefined) continue;
      if (!Array.isArray(incoming.data[kind]) || incoming.data[kind].length > 50000) throw new Error("同步包记录不完整或过多");
      for (const r of incoming.data[kind]) {
        const parsed = schemas[kind].safeParse(r);
        if (!parsed.success || typeof r.id !== "string" || !r.id || r.id.length > 150 || seen.has(r.id) || !timestamp(r.createdAt) || !timestamp(r.updatedAt)) throw new Error("同步包含有无效记录");
        seen.add(r.id);
        if (assetIds(parsed.data).some(id => !next.assets.some(a => a.id === id))) throw new Error("题目缺少附件");
        if (KINDS.some(k => k !== kind && next.data[k].some(x => x.id === r.id))) throw new Error("记录编号冲突，已保留手机原数据");
        const old = next.data[kind].find(x => x.id === r.id);
        const tomb = next.tombstones.find(t => t.id === r.id);
        const updatedAt = normalizedTime(r.updatedAt);
        if (sync && tomb && tomb.deletedAt >= updatedAt) { skipped++; continue; }
        if (old && (!sync || old.updatedAt > updatedAt)) { skipped++; continue; }
        if (old?.updatedAt === updatedAt) {
          if (JSON.stringify(schemas[kind].parse(old)) !== JSON.stringify(parsed.data)) conflicts++;
          skipped++; continue;
        }
        const record = { ...parsed.data, id: r.id, createdAt: normalizedTime(r.createdAt), updatedAt: !sync && tomb ? new Date().toISOString() : updatedAt };
        (next.data[kind] as any[]) = [record, ...next.data[kind].filter(x => x.id !== r.id)];
        next.tombstones = next.tombstones.filter(t => t.id !== r.id);
        if (old) updated++; else added++;
      }
    }
    if (incoming.tombstones !== undefined && !Array.isArray(incoming.tombstones)) throw new Error("删除标记格式无效");
    for (const t of incoming.tombstones || []) {
      if (!KINDS.includes(t.kind) || typeof t.id !== "string" || !t.id || t.id.length > 150 || !timestamp(t.deletedAt)) throw new Error("删除标记无效");
      if (!sync) continue;
      const old = next.data[t.kind as Kind].find(x => x.id === t.id), tomb = next.tombstones.find(x => x.id === t.id);
      if (KINDS.some(k => k !== t.kind && next.data[k].some(x => x.id === t.id))) throw new Error("删除标记编号冲突");
      const deletedAt = normalizedTime(t.deletedAt);
      if ((!old || old.updatedAt <= deletedAt) && (!tomb || tomb.deletedAt < deletedAt)) {
        (next.data[t.kind as Kind] as any[]) = next.data[t.kind as Kind].filter(x => x.id !== t.id);
        next.tombstones = [...next.tombstones.filter(x => x.id !== t.id), { ...t, deletedAt }];
        if (old) deleted++;
      }
    }
    // Validate the entire package before publishing any records. Orphan files are harmless on a failed write.
    for (const item of pendingAssets) await this.port.writeAsset(item.asset.id, item.bytes);
    if (sourceName) next.hashes[sourceName] = digest(bytes);
    await this.commit(next);
    return { added, updated, deleted, conflicts, skipped, assets: pendingAssets.length };
  }
}
