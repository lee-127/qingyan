import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { LocalStore, StoreError, sha256 } from "./store";

export function detectICloudRoots(): string[] {
  if (process.platform !== "win32") return [];
  const script = `[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); $found=@(); foreach($base in @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\SyncRootManager','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\SyncRootManager')){if(Test-Path $base){Get-ChildItem -LiteralPath $base | Where-Object {$_.PSChildName -match 'iCloud|Apple' -and $_.PSChildName -notmatch 'Photo'} | ForEach-Object {$child=Join-Path $_.PSPath 'UserSyncRoots';if(Test-Path $child){$p=Get-ItemProperty -LiteralPath $child;$p.PSObject.Properties | Where-Object {$_.Name -notmatch '^PS' -and $_.Value -is [string]} | ForEach-Object {if(Test-Path -LiteralPath $_.Value){$found+=$_.Value}}}}}}; ConvertTo-Json -InputObject @($found | Select-Object -Unique) -Compress`;
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { encoding: "utf8", windowsHide: true, timeout: 10000 },
  );
  try {
    const roots = JSON.parse(result.stdout.trim());
    return (Array.isArray(roots) ? roots : []).filter(
      (x) => typeof x === "string" && fs.existsSync(x),
    );
  } catch {
    return [];
  }
}
type Config = {
  deviceId: string;
  enabled: boolean;
  root?: string;
  folder?: string;
  publishedFingerprint?: string;
  lastWritten?: string;
  lastPulled?: string;
  lastApplied?: string;
  lastError?: string;
  hashes: Record<string, string>;
};
export class ICloudFileSync {
  config: Config;
  private configFile: string;
  private queue: Promise<any> = Promise.resolve();
  private debounce?: ReturnType<typeof setTimeout>;
  private lastRefresh = 0;
  private roots: string[] = [];
  private rootsChecked = 0;
  constructor(
    private store: LocalStore,
    private rootsProvider = detectICloudRoots,
  ) {
    this.configFile = path.join(
      path.dirname(store.directory),
      "icloud-sync.json",
    );
    let saved: any = {};
    try {
      saved = JSON.parse(fs.readFileSync(this.configFile, "utf8"));
    } catch {}
    this.config = {
      deviceId: crypto.randomUUID(),
      enabled: false,
      hashes: {},
      ...saved,
    };
    this.persist();
  }
  private persist() {
    fs.writeFileSync(
      this.configFile + ".tmp",
      JSON.stringify(this.config, null, 2),
    );
    fs.renameSync(this.configFile + ".tmp", this.configFile);
  }
  private run<T>(action: () => Promise<T>): Promise<T> {
    const next = this.queue.catch(() => {}).then(action);
    this.queue = next;
    return next.catch((e) => {
      this.config.lastError = e instanceof Error ? e.message : "同步暂未完成";
      this.persist();
      throw e;
    });
  }
  private available() {
    if (Date.now() - this.rootsChecked > 60000) {
      this.roots = this.rootsProvider();
      this.rootsChecked = Date.now();
    }
    return this.roots;
  }
  status(refresh = false) {
    if (refresh) this.rootsChecked = 0;
    const availableRoots = this.available();
    return {
      enabled: this.config.enabled,
      folder: this.config.folder || "",
      availableRoots,
      lastWritten: this.config.lastWritten,
      lastPulled: this.config.lastPulled,
      lastApplied: this.config.lastApplied,
      lastError: this.config.lastError || "",
      pending:
        this.config.enabled &&
        this.fingerprint() !== this.config.publishedFingerprint,
      uploadVerified: false,
    };
  }
  private fingerprint() {
    return sha256(
      Buffer.from(
        JSON.stringify({
          data: this.store.all(),
          tombstones: this.store.db
            .prepare("SELECT * FROM sync_tombstones ORDER BY id")
            .all(),
          assets: this.store.db
            .prepare("SELECT id,sha256 FROM assets ORDER BY id")
            .all(),
        }),
      ),
    );
  }
  private ready() {
    if (!this.config.enabled || !this.config.root || !this.config.folder)
      throw new StoreError(409, "请先连接 iCloud 云盘同步目录");
    if (!fs.existsSync(this.config.root))
      throw new StoreError(409, "iCloud 云盘目录不可用，本机资料仍可正常使用");
  }
  async connect(root?: string) {
    this.rootsChecked = 0;
    const selected = root?.trim() || this.available()[0];
    if (!selected)
      throw new StoreError(
        409,
        "尚未检测到 iCloud 云盘。请在 Windows 版 iCloud 中打开“iCloud 云盘”，再重新检测。",
      );
    if (/icloud\s*photos|icloud\s*照片/i.test(selected))
      throw new StoreError(400, "这是 iCloud 照片目录，请选择 iCloud 云盘目录");
    if (
      !path.isAbsolute(selected) ||
      !fs.existsSync(selected) ||
      !fs.statSync(selected).isDirectory()
    )
      throw new StoreError(
        400,
        "同步目录不存在，请填写 iCloud 云盘中显示的完整路径",
      );
    const resolved = fs.realpathSync(selected),
      data = fs.realpathSync(this.store.directory);
    if (
      data === resolved ||
      data.startsWith(resolved + path.sep) ||
      resolved.startsWith(data + path.sep)
    )
      throw new StoreError(
        400,
        "请勿选择程序数据目录，请使用独立的 iCloud 云盘目录",
      );
    const folder = path.join(resolved, "清研复习");
    fs.mkdirSync(folder, { recursive: true });
    fs.mkdirSync(path.join(folder, "同步数据"), { recursive: true });
    fs.mkdirSync(path.join(folder, "资料附件"), { recursive: true });
    this.config = {
      ...this.config,
      root: resolved,
      folder,
      enabled: true,
      hashes: {},
      lastError: "",
      publishedFingerprint: undefined,
    };
    this.persist();
    await this.pull();
    await this.push();
    return this.status();
  }
  disconnect() {
    this.config.enabled = false;
    this.persist();
    return this.status();
  }
  markDirty() {
    if (!this.config.enabled) return;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      void this.push().catch(() => {});
    }, 2500);
    this.debounce.unref();
  }
  async push() {
    return this.run(async () => {
      this.ready();
      const fingerprint = this.fingerprint();
      if (
        fingerprint === this.config.publishedFingerprint &&
        this.config.lastWritten
      )
        return { unchanged: true, ...this.status() };
      const bytes = await this.store.exportBackup();
      const folder = this.config.folder!;
      // Originals are separate from the sync ZIP so the iPhone Files app can read them.
      for (const asset of this.store.db
        .prepare("SELECT id,name,sha256 FROM assets")
        .all() as any[]) {
        const attachmentFolder = path.join(folder, "资料附件", asset.id);
        await fsp.mkdir(attachmentFolder, { recursive: true });
        const name =
          (asset.name as string)
            .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
            .replace(/[. ]+$/, "") || "资料文件";
        const destination = path.join(attachmentFolder, name);
        if (!fs.existsSync(destination)) {
          const data = await fsp.readFile(this.store.filePath(asset.id));
          if (sha256(data) !== asset.sha256)
            throw new StoreError(500, "本机附件校验失败，未覆盖同步包");
          await fsp.writeFile(destination, data, { flag: "wx" });
        }
      }
      const destination = path.join(
        folder,
        "同步数据",
        `device-${this.config.deviceId}.zip`,
      );
      const temporary = destination + ".writing";
      try {
        await fsp.writeFile(temporary, bytes);
        await fsp.rename(temporary, destination);
      } catch (e) {
        try {
          await fsp.unlink(temporary);
        } catch {}
        throw e;
      }
      await fsp.writeFile(
        path.join(folder, "手机查看说明.txt"),
        "清研复习 iCloud 文件同步\r\n\r\n资料附件：可在 iPhone 的“文件”App → iCloud 云盘中直接打开原始 PDF、Word、笔记和图片。\r\n手机安装：提供 Scriptable 手机运行文件及安装说明，可在电脑关机后独立使用已下载的记录和附件。\r\n同步数据：完整学习记录与附件的同步包，可在清研“数据与设置”中导入；它不是手机应用。\r\n云盘上传、下载由 Apple 的 iCloud 客户端完成，写入本机云盘文件夹不等于已完成上传。\r\n请等待文件显示已同步后，再在其他设备使用；不要同时编辑同一道题。\r\n",
        "utf8",
      );
      this.config.publishedFingerprint = fingerprint;
      this.config.lastWritten = new Date().toISOString();
      this.config.lastError = "";
      this.persist();
      return this.status();
    });
  }
  async pull() {
    return this.run(async () => {
      this.ready();
      const folder = path.join(this.config.folder!, "同步数据");
      if (!fs.existsSync(folder))
        return { added: 0, updated: 0, deleted: 0, conflicts: 0 };
      const names = (await fsp.readdir(folder))
        .filter(
          (n) =>
            /^device-[0-9a-f-]{36}\.zip$/i.test(n) &&
            n !== `device-${this.config.deviceId}.zip`,
        )
        .sort();
      const totals = { added: 0, updated: 0, deleted: 0, conflicts: 0 };
      for (const name of names) {
        const filename = path.join(folder, name);
        const stat = await fsp.stat(filename);
        if (stat.size > 512 * 1024 * 1024)
          throw new StoreError(
            413,
            "同步包超过 512 MB，请使用完整备份方式传输",
          );
        const bytes = await fsp.readFile(filename);
        const hash = sha256(bytes);
        if (this.config.hashes[name] === hash) continue;
        const safety = path.join(this.store.directory, "automatic-backups");
        await fsp.mkdir(safety, { recursive: true });
        await fsp.writeFile(
          path.join(
            safety,
            `before-icloud-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`,
          ),
          await this.store.exportBackup(),
        );
        const result = await this.store.importBackup(bytes, { sync: true });
        for (const key of Object.keys(totals) as (keyof typeof totals)[])
          totals[key] += result[key];
        this.config.hashes[name] = hash;
      }
      this.config.lastPulled = new Date().toISOString();
      if (totals.added || totals.updated || totals.deleted) {
        this.config.lastApplied = this.config.lastPulled;
        this.markDirty();
      }
      this.config.lastError = totals.conflicts
        ? `有 ${totals.conflicts} 条同时间的不同版本，本机记录已保留；原同步包未改动。`
        : "";
      this.persist();
      return totals;
    });
  }
  async refreshIfDue() {
    if (!this.config.enabled || Date.now() - this.lastRefresh < 30000) return;
    this.lastRefresh = Date.now();
    const operation = this.pull().catch(() => {});
    await Promise.race([
      operation,
      new Promise((resolve) => {
        const timer = setTimeout(resolve, 3500);
        timer.unref();
      }),
    ]);
  }
  start() {
    if (this.config.enabled) {
      void this.refreshIfDue();
      this.markDirty();
    }
    const timer = setInterval(() => {
      void this.refreshIfDue();
      if (
        this.config.enabled &&
        this.fingerprint() !== this.config.publishedFingerprint
      )
        this.markDirty();
    }, 60000);
    timer.unref();
  }
}
