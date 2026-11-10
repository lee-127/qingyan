import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import JSZip from "jszip";
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const output = path.join(project, "outputs", "desktop-app");
const { LocalStore } = await import(
  pathToFileURL(path.join(output, "store.mjs")).href
);
const { ICloudFileSync } = await import(
  pathToFileURL(path.join(output, "icloud-sync.mjs")).href
);
const temporary = await fs.mkdtemp(
  path.join(os.tmpdir(), "qingyan-icloud-test-"),
);
const root = path.join(temporary, "icloud-root");
await fs.mkdir(root);
let a, b, c;
let checks = 0;
const score = {
  title: "模拟卷原始记录",
  subject: "数学",
  type: "模拟卷",
  score: 100,
  total: 150,
  date: "2026-11-05",
  duration: 180,
  sourceId: "",
  note: "同步验证",
};
try {
  a = new LocalStore(path.join(temporary, "device-a", "data"));
  b = new LocalStore(path.join(temporary, "device-b", "data"));
  c = new LocalStore(path.join(temporary, "device-c", "data"));
  const syncA = new ICloudFileSync(a, () => [root]),
    syncB = new ICloudFileSync(b, () => [root]),
    syncC = new ICloudFileSync(c, () => []);
  await assert.rejects(syncC.connect(), (e) => e.status === 409);
  assert.equal(syncC.status().enabled, false);
  checks++;
  const bytes = Buffer.from("手机可读取的笔记内容。", "utf8");
  const asset = a.addAsset(
    {
      id: crypto.randomUUID(),
      name: "复习笔记.txt",
      mime: "text/plain",
      size: bytes.length,
    },
    bytes,
  );
  a.save("material", {
    title: "复习笔记",
    subject: "数学",
    type: "笔记",
    year: "",
    note: "",
    file: asset,
  });
  const record = a.save("score", score);
  const originalBackup = await a.exportBackup();
  await syncA.connect();
  assert.equal(syncA.status().enabled, true);
  assert.equal(syncA.status().uploadVerified, false);
  assert.deepEqual(
    await fs.readFile(
      path.join(root, "清研复习", "资料附件", asset.id, asset.name),
    ),
    bytes,
  );
  checks++;
  await syncB.connect();
  assert.equal(b.all().score[0].score, 100);
  assert.deepEqual(await fs.readFile(b.filePath(asset.id)), bytes);
  checks++;
  b.save("score", {
    ...b.all().score[0],
    title: "手机或另一设备更新的模拟卷",
    score: 125,
  });
  await syncB.push();
  const updated = await syncA.pull();
  assert.equal(updated.updated, 1);
  assert.equal(a.all().score[0].score, 125);
  checks++;
  const syncFolder = path.join(root, "清研复习", "同步数据");
  const staleFile = path.join(syncFolder, `device-${crypto.randomUUID()}.zip`);
  await fs.writeFile(staleFile, originalBackup);
  await syncA.pull();
  assert.equal(a.all().score[0].score, 125);
  checks++;
  b.remove("score", record.id);
  await syncB.push();
  const deleted = await syncA.pull();
  assert.equal(deleted.deleted, 1);
  assert.equal(a.all().score.length, 0);
  checks++;
  await fs.writeFile(staleFile, originalBackup);
  syncA.config.hashes = {};
  await syncA.pull();
  assert.equal(a.all().score.length, 0);
  checks++;
  const restored = await a.importBackup(originalBackup);
  assert.equal(restored.added, 1);
  assert.equal(a.all().score.length, 1);
  await syncA.push();
  await syncB.pull();
  assert.equal(b.all().score.length, 1);
  checks++;
  const current = a.all().score[0];
  const conflict = await JSZip.loadAsync(await a.exportBackup());
  const manifest = JSON.parse(
    await conflict.file("manifest.json").async("string"),
  );
  manifest.data.score[0].score = 149;
  conflict.file("manifest.json", JSON.stringify(manifest));
  const result = await a.importBackup(
    await conflict.generateAsync({ type: "uint8array" }),
    { sync: true },
  );
  assert.equal(result.conflicts, 1);
  assert.equal(a.all().score[0].score, current.score);
  checks++;
  a.save("score", { ...a.all().score[0], note: "自动写入测试" });
  const before = syncA.config.lastWritten;
  syncA.markDirty();
  for (let i = 0; i < 70 && syncA.config.lastWritten === before; i++)
    await new Promise((r) => setTimeout(r, 100));
  assert.notEqual(syncA.config.lastWritten, before);
  assert.equal(syncA.status().pending, false);
  checks++;
  const safety = await fs.readdir(path.join(a.directory, "automatic-backups"));
  assert.ok(
    safety.some((n) => n.startsWith("before-icloud-") && n.endsWith(".zip")),
  );
  checks++;
  syncA.disconnect();
  a.save("score", { ...a.all().score[0], note: "断开后仍可本地使用" });
  syncA.markDirty();
  assert.equal(syncA.status().enabled, false);
  assert.equal(a.all().score[0].note, "断开后仍可本地使用");
  checks++;
  const restarted = new ICloudFileSync(a, () => [root]);
  assert.equal(restarted.config.deviceId, syncA.config.deviceId);
  assert.equal(restarted.status().enabled, false);
  checks++;
  console.log(
    `PASS: ${checks} iCloud file-sync checks: no folder/no write, complete package and readable originals, two-device updates, stale revision protection, deletion propagation, manual restore, equal-time conflict retention, automatic publish, safety backup, disconnect durability and stable device identity.`,
  );
} finally {
  a?.close();
  b?.close();
  c?.close();
  if (
    path.dirname(temporary) !== path.resolve(os.tmpdir()) ||
    !path.basename(temporary).startsWith("qingyan-icloud-test-")
  )
    throw new Error("Unsafe test cleanup");
  await fs.rm(temporary, { recursive: true, force: true });
}
