import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { schemas } from "../lib/validation";

export const KINDS = [
  "material",
  "mistake",
  "paper",
  "score",
  "settings",
  "folder",
] as const;
export type LocalKind = (typeof KINDS)[number];
export type LocalAsset = {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt?: string;
  sha256?: string;
};
export const sha256 = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
export const assetIds = (value: any): string[] =>
  [
    value.file?.id,
    value.image?.id,
    ...(value.questions || []).map((q: any) => q.image?.id),
  ].filter(Boolean);
export function validAssetId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  );
}
export class StoreError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export class LocalStore {
  db: DatabaseSync;
  filesDirectory: string;
  databaseFile: string;
  private backupDate = "";
  constructor(public directory: string) {
    fs.mkdirSync(directory, { recursive: true });
    this.filesDirectory = path.join(directory, "files");
    fs.mkdirSync(this.filesDirectory, { recursive: true });
    this.databaseFile = path.join(directory, "study.sqlite");
    this.db = new DatabaseSync(this.databaseFile);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;",
    );
    const version = (this.db.prepare("PRAGMA user_version").get() as any)
      .user_version;
    if (version > 2)
      throw new Error("本机数据库由更新的版本创建，请使用更新的清研程序。");
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS records_kind ON records(kind);
      CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,sha256 TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY,imported_at TEXT NOT NULL,summary TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sync_tombstones(id TEXT PRIMARY KEY,kind TEXT NOT NULL,deleted_at TEXT NOT NULL);
      PRAGMA user_version=2;`);
  }
  all(): Record<LocalKind, any[]> {
    const data: Record<LocalKind, any[]> = {
      material: [],
      mistake: [],
      paper: [],
      score: [],
      settings: [],
      folder: [],
    };
    for (const row of this.db
      .prepare("SELECT * FROM records ORDER BY created_at DESC,id DESC")
      .all() as any[]) {
      if (Object.hasOwn(data, row.kind))
        data[row.kind as LocalKind].push({
          ...JSON.parse(row.data),
          id: row.id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        });
    }
    return data;
  }
  dailyBackup() {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    if (this.backupDate === day) return;
    if (
      (this.db.prepare("SELECT count(*) AS n FROM records").get() as any).n > 0
    ) {
      const folder = path.join(this.directory, "automatic-backups");
      fs.mkdirSync(folder, { recursive: true });
      const destination = path.join(folder, `study-${day}.sqlite`);
      if (!fs.existsSync(destination))
        this.db.prepare("VACUUM INTO ?").run(destination);
    }
    this.backupDate = day;
  }
  asset(id: string): LocalAsset | undefined {
    if (!validAssetId(id)) return undefined;
    const row = this.db
      .prepare("SELECT * FROM assets WHERE id=?")
      .get(id) as any;
    return row
      ? {
          id: row.id,
          name: row.name,
          mime: row.mime,
          size: row.size,
          sha256: row.sha256,
          createdAt: row.created_at,
        }
      : undefined;
  }
  filePath(id: string) {
    if (!validAssetId(id)) throw new StoreError(400, "附件编号无效");
    return path.join(this.filesDirectory, id);
  }
  addAsset(asset: LocalAsset, bytes: Uint8Array) {
    if (
      !validAssetId(asset.id) ||
      !bytes.byteLength ||
      bytes.byteLength > 20 * 1024 * 1024 ||
      asset.size !== bytes.byteLength
    )
      throw new StoreError(400, "附件大小或格式有误");
    const hash = sha256(bytes);
    const existing = this.asset(asset.id);
    if (existing) {
      if (existing.sha256 !== hash)
        throw new StoreError(409, "同名附件内容不同，已保留本机文件");
      return existing;
    }
    const filename = this.filePath(asset.id);
    const temp = filename + ".tmp";
    fs.writeFileSync(temp, bytes);
    fs.renameSync(temp, filename);
    try {
      this.db
        .prepare("INSERT INTO assets VALUES(?,?,?,?,?,?)")
        .run(
          asset.id,
          asset.name,
          asset.mime,
          asset.size,
          hash,
          asset.createdAt || new Date().toISOString(),
        );
    } catch (e) {
      fs.unlinkSync(filename);
      throw e;
    }
    return this.asset(asset.id)!;
  }
  save(kind: string, input: any) {
    if (!Object.hasOwn(schemas, kind))
      throw new StoreError(404, "未知的数据类型");
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new StoreError(400, "数据格式有误");
    if (
      input.id !== undefined &&
      (typeof input.id !== "string" || !input.id || input.id.length > 150)
    )
      throw new StoreError(400, "记录编号无效");
    const parsed = schemas[kind as LocalKind].safeParse(input);
    if (!parsed.success)
      throw new StoreError(
        400,
        parsed.error.issues[0]?.message || "数据格式有误",
      );
    for (const id of new Set(assetIds(parsed.data)))
      if (!this.asset(id) || !fs.existsSync(this.filePath(id)))
        throw new StoreError(400, "附件不存在，请重新上传");
    const existing = input.id
      ? (this.db
          .prepare("SELECT * FROM records WHERE id=? AND kind=?")
          .get(input.id, kind) as any)
      : undefined;
    if (input.id && !existing)
      throw new StoreError(404, "记录已不存在，请刷新");
    const settingsId =
      kind === "settings"
        ? (
            this.db
              .prepare("SELECT id FROM records WHERE kind='settings' LIMIT 1")
              .get() as any
          )?.id
        : undefined;
    const id = input.id || settingsId || crypto.randomUUID();
    const now = new Date().toISOString();
    this.dailyBackup();
    this.db
      .prepare(
        "INSERT INTO records VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at WHERE records.kind=excluded.kind",
      )
      .run(
        id,
        kind,
        JSON.stringify(parsed.data),
        existing?.created_at || now,
        now,
      );
    this.db.prepare("DELETE FROM sync_tombstones WHERE id=?").run(id);
    return {
      ...parsed.data,
      id,
      createdAt: existing?.created_at || now,
      updatedAt: now,
    };
  }
  remove(kind: string, id: string) {
    this.dailyBackup();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = this.db
        .prepare("DELETE FROM records WHERE kind=? AND id=?")
        .run(kind, id);
      if (!result.changes) throw new StoreError(404, "记录已不存在");
      this.db
        .prepare("INSERT OR REPLACE INTO sync_tombstones VALUES(?,?,?)")
        .run(id, kind, new Date().toISOString());
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    // Files stay immutable, preserving saved papers and daily recovery snapshots.
  }
  async exportBackup(): Promise<Buffer> {
    const zip = new JSZip();
    const assets = this.db
      .prepare("SELECT * FROM assets ORDER BY id")
      .all() as any[];
    const manifest = {
      schemaVersion: 2,
      app: "qingyan-local",
      exportedAt: new Date().toISOString(),
      data: this.all(),
      tombstones: this.db
        .prepare(
          "SELECT id,kind,deleted_at AS deletedAt FROM sync_tombstones ORDER BY id",
        )
        .all(),
      assets: assets.map((a) => ({
        id: a.id,
        name: a.name,
        mime: a.mime,
        size: a.size,
        sha256: a.sha256,
        createdAt: a.created_at,
      })),
    };
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    for (const asset of assets) {
      const data = fs.readFileSync(this.filePath(asset.id));
      if (sha256(data) !== asset.sha256)
        throw new StoreError(
          500,
          `附件「${asset.name}」校验失败，请先保留数据文件夹。`,
        );
      zip.file(`files/${asset.id}`, data);
    }
    return zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 5 },
    });
  }
  async importBackup(bytes: Uint8Array, options: { sync?: boolean } = {}) {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(bytes);
    } catch {
      throw new StoreError(400, "不是有效的清研备份文件");
    }
    const file = zip.file("manifest.json");
    if (!file) throw new StoreError(400, "备份缺少资料清单");
    let manifest: any;
    try {
      manifest = JSON.parse(await file.async("string"));
    } catch {
      throw new StoreError(400, "备份清单无法读取");
    }
    if (
      manifest.schemaVersion !== 2 ||
      !manifest.data ||
      !Array.isArray(manifest.assets)
    )
      throw new StoreError(400, "不支持此备份格式");
    const assets: { asset: LocalAsset; bytes: Buffer }[] = [];
    for (const asset of manifest.assets) {
      if (
        !validAssetId(asset.id) ||
        typeof asset.name !== "string" ||
        typeof asset.mime !== "string" ||
        !Number.isInteger(asset.size) ||
        asset.size < 1 ||
        asset.size > 20 * 1024 * 1024
      )
        throw new StoreError(400, "备份附件信息不正确");
      const file = zip.file(`files/${asset.id}`);
      if (!file) throw new StoreError(400, `备份缺少附件「${asset.name}」`);
      const buffer = await file.async("nodebuffer");
      if (
        buffer.length !== asset.size ||
        (asset.sha256 && sha256(buffer) !== asset.sha256)
      )
        throw new StoreError(400, `附件「${asset.name}」校验失败`);
      const old = this.asset(asset.id);
      if (old && old.sha256 !== sha256(buffer))
        throw new StoreError(409, "备份附件与本机文件冲突，未覆盖原数据");
      assets.push({ asset, bytes: buffer });
    }
    const available = new Set([
      ...assets.map((x) => x.asset.id),
      ...(this.db.prepare("SELECT id FROM assets").all() as any[]).map(
        (x) => x.id,
      ),
    ]);
    const records: {
      id: string;
      kind: LocalKind;
      data: any;
      createdAt: string;
      updatedAt: string;
    }[] = [];
    for (const kind of KINDS) {
      if (kind === "folder" && manifest.data.folder === undefined) continue;
      if (!Array.isArray(manifest.data[kind]))
        throw new StoreError(400, "备份记录不完整");
      for (const record of manifest.data[kind]) {
        const parsed = schemas[kind].safeParse(record);
        if (
          !parsed.success ||
          typeof record.id !== "string" ||
          record.id.length > 150
        )
          throw new StoreError(400, "备份包含无效记录");
        for (const id of assetIds(parsed.data))
          if (!available.has(id))
            throw new StoreError(400, "备份中的题目缺少附件");
        records.push({
          id: record.id,
          kind,
          data: parsed.data,
          createdAt: record.createdAt || new Date().toISOString(),
          updatedAt:
            record.updatedAt || record.createdAt || new Date().toISOString(),
        });
      }
    }
    for (const record of records)
      if (
        !Number.isFinite(Date.parse(record.updatedAt)) ||
        !Number.isFinite(Date.parse(record.createdAt))
      )
        throw new StoreError(400, "同步包中的记录时间无效");
    const tombstones = Array.isArray(manifest.tombstones)
      ? manifest.tombstones
      : [];
    for (const t of tombstones)
      if (
        typeof t.id !== "string" ||
        !t.id ||
        t.id.length > 150 ||
        !KINDS.includes(t.kind) ||
        !Number.isFinite(Date.parse(t.deletedAt))
      )
        throw new StoreError(400, "同步包的删除标记无效");
    this.dailyBackup();
    const writtenFiles: string[] = [];
    let added = 0,
      updated = 0,
      deleted = 0,
      conflicts = 0;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const { asset, bytes } of assets) {
        if (!this.asset(asset.id)) {
          this.addAsset(asset, bytes);
          writtenFiles.push(this.filePath(asset.id));
        }
      }
      const insert = this.db.prepare(
        "INSERT OR IGNORE INTO records VALUES(?,?,?,?,?)",
      );
      for (const r of records) {
        const current = this.db
          .prepare("SELECT kind,data,updated_at FROM records WHERE id=?")
          .get(r.id) as any;
        const tomb = this.db
          .prepare("SELECT deleted_at FROM sync_tombstones WHERE id=?")
          .get(r.id) as any;
        if (options.sync && tomb && tomb.deleted_at >= r.updatedAt) continue;
        if (current && current.kind !== r.kind)
          throw new StoreError(409, "同步包的记录编号与本机冲突");
        if (options.sync && current) {
          if (current.updated_at < r.updatedAt) {
            this.db
              .prepare("UPDATE records SET data=?,updated_at=? WHERE id=?")
              .run(JSON.stringify(r.data), r.updatedAt, r.id);
            updated++;
          } else if (
            current.updated_at === r.updatedAt &&
            current.data !== JSON.stringify(r.data)
          )
            conflicts++;
        } else {
          const changed = Number(
            insert.run(
              r.id,
              r.kind,
              JSON.stringify(r.data),
              r.createdAt,
              !options.sync && tomb ? new Date().toISOString() : r.updatedAt,
            ).changes,
          );
          added += changed;
          if (changed)
            this.db.prepare("DELETE FROM sync_tombstones WHERE id=?").run(r.id);
        }
      }
      if (options.sync)
        for (const t of tombstones) {
          const current = this.db
            .prepare("SELECT updated_at FROM records WHERE id=?")
            .get(t.id) as any;
          const old = this.db
            .prepare("SELECT deleted_at FROM sync_tombstones WHERE id=?")
            .get(t.id) as any;
          if (
            (!current || current.updated_at <= t.deletedAt) &&
            (!old || old.deleted_at < t.deletedAt)
          ) {
            deleted += Number(
              this.db.prepare("DELETE FROM records WHERE id=?").run(t.id)
                .changes,
            );
            this.db
              .prepare("INSERT OR REPLACE INTO sync_tombstones VALUES(?,?,?)")
              .run(t.id, t.kind, t.deletedAt);
          }
        }
      const digest = sha256(bytes);
      this.db
        .prepare("INSERT OR IGNORE INTO imports VALUES(?,?,?)")
        .run(
          digest,
          new Date().toISOString(),
          JSON.stringify({ added, assets: assets.length }),
        );
      this.db.exec("COMMIT");
      return {
        added,
        updated,
        deleted,
        conflicts,
        skipped: records.length - added - updated,
        assets: assets.length,
      };
    } catch (e) {
      this.db.exec("ROLLBACK");
      for (const filename of writtenFiles)
        try {
          fs.unlinkSync(filename);
        } catch {}
      throw e;
    }
  }
  close() {
    this.db.close();
  }
}
