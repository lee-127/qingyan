import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import JSZip from "jszip";
import { MobileStore, digest } from "../outputs/mobile-app/store.mjs";
import { LocalStore } from "../outputs/desktop-app/store.mjs";
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "qingyan-phone-test-"));
const files = new Map();
let persisted, failWrite = false, checks = 0;
const phone = new MobileStore({
  persist: async state => { if (failWrite) throw new Error("disk full"); persisted = structuredClone(state); },
  readAsset: async id => new Uint8Array(files.get(id)),
  writeAsset: async (id, data) => { files.set(id, new Uint8Array(data)); },
  uuid: async () => randomUUID(),
});
const desktop = new LocalStore(path.join(temporary, "desktop"));
const score = { title: "手机独立练习", subject: "数学", type: "模拟卷", score: 100, total: 150, date: "2026-11-06", duration: 180, sourceId: "", note: "" };
try {
  for (const size of [0, 1, 55, 56, 64, 129, 65539]) {
    const data = new Uint8Array(size).map((_, i) => i % 251);
    assert.equal(digest(data), createHash("sha256").update(data).digest("hex"));
  }
  checks++;
  const initial = desktop.save("score", score);
  const oldBackup = await JSZip.loadAsync(await desktop.exportBackup());
  const oldManifest = JSON.parse(await oldBackup.file("manifest.json").async("string"));
  delete oldManifest.data.folder;
  oldBackup.file("manifest.json", JSON.stringify(oldManifest));
  await phone.importBackup(await oldBackup.generateAsync({ type: "uint8array" }));
  assert.deepEqual(phone.all().folder, []);
  assert.equal(phone.all().score[0].score, 100); checks++;
  const changed = await phone.save("score", { ...phone.all().score[0], score: 123 });
  assert.equal(persisted.data.score[0].score, 123);
  const imported = await desktop.importBackup(await phone.exportBackup(), { sync: true });
  assert.equal(imported.updated, 1);
  assert.equal(desktop.all().score[0].score, 123); checks++;
  const staleZip = await desktop.exportBackup();
  await phone.remove("score", changed.id);
  await phone.importBackup(staleZip);
  assert.equal(phone.all().score.length, 0);
  await desktop.importBackup(await phone.exportBackup(), { sync: true });
  assert.equal(desktop.all().score.length, 0); checks++;
  await phone.importBackup(staleZip, false);
  assert.equal(phone.all().score.length, 1);
  await desktop.importBackup(await phone.exportBackup(), { sync: true });
  assert.equal(desktop.all().score[0].id, initial.id); checks++;
  const bytes = new TextEncoder().encode("离线也能读取的笔记");
  const asset = await phone.upload({ name: "复习笔记.txt", type: "text/plain", bytes });
  await phone.save("material", { title: "手机上传笔记", subject: "数学", type: "笔记", year: "", note: "", file: asset });
  await desktop.importBackup(await phone.exportBackup(), { sync: true });
  assert.deepEqual(await fs.readFile(desktop.filePath(asset.id)), Buffer.from(bytes)); checks++;
  const revived = new MobileStore({ persist: async () => {}, readAsset: async id => files.get(id), writeAsset: async () => {}, uuid: async () => randomUUID() }, structuredClone(persisted));
  assert.equal(revived.all().material.length, 1);
  assert.deepEqual(await revived.bytes(asset.id), bytes); checks++;
  const mistake = await phone.save("mistake", { title: "极限", subject: "数学", topic: "极限", reason: "计算失误", status: "待复习", difficulty: "基础", question: "求极限", answer: "1", reflection: "", sourceId: "", source: "", tags: [] });
  await phone.save("paper", { title: "离线组卷", questionIds: [mistake.id], questions: [mistake], points: [10], space: 3, includeAnswers: true, note: "" });
  await desktop.importBackup(await phone.exportBackup(), { sync: true });
  assert.equal(desktop.all().paper[0].questions[0].question, "求极限"); checks++;
  const folder = await phone.save("folder", { title: "高数习题集" });
  const exercise = await phone.save("material", { title: "第一章练习", subject: "数学", type: "习题集", file: asset, folderId: folder.id });
  await phone.save("mistake", { ...mistake, sourceId: exercise.id, sourcePage: 2 });
  await desktop.importBackup(await phone.exportBackup(), { sync: true });
  assert.equal(desktop.all().folder[0].title, "高数习题集");
  assert.equal(desktop.all().material.find(item => item.id === exercise.id).folderId, folder.id);
  assert.equal(desktop.all().mistake[0].sourcePage, 2);
  await revived.importBackup(await desktop.exportBackup());
  assert.equal(revived.all().material.find(item => item.id === exercise.id).folderId, folder.id);
  assert.equal(revived.all().mistake[0].sourceId, exercise.id); checks++;
  const zip = await JSZip.loadAsync(await phone.exportBackup());
  const manifest = JSON.parse(await zip.file("manifest.json").async("string"));
  manifest.data.score[0].score = 124;
  zip.file("manifest.json", JSON.stringify(manifest));
  const conflict = await phone.importBackup(await zip.generateAsync({ type: "uint8array" }));
  assert.equal(conflict.conflicts, 1); assert.equal(phone.all().score[0].score, 123); checks++;
  manifest.data.score[0].updatedAt = "invalid";
  zip.file("manifest.json", JSON.stringify(manifest));
  const before = phone.all();
  await assert.rejects(phone.importBackup(await zip.generateAsync({ type: "uint8array" })));
  assert.deepEqual(phone.all(), before); checks++;
  failWrite = true;
  await assert.rejects(phone.save("score", { ...score, score: 140 }));
  assert.deepEqual(phone.all(), before); failWrite = false; checks++;
  const corrupt = await JSZip.loadAsync(await phone.exportBackup());
  corrupt.file(`files/${asset.id}`, new Uint8Array(bytes.length).fill(1));
  await assert.rejects(phone.importBackup(await corrupt.generateAsync({ type: "uint8array" })), /校验失败/);
  assert.deepEqual(phone.all(), before); checks++;
  const script = await fs.readFile(new URL("../outputs/mobile-app/清研.js", import.meta.url), "utf8");
  assert(!script.includes("__QINGYAN_HTML__"));
  assert(!script.includes('src="http'));
  assert(script.includes("window.__qyDrain()"));
  assert(!script.includes("window.__qyTake(completion)"));
  assert(script.includes("FileManager.local()")); checks++;
  console.log(JSON.stringify({ passed: checks, desktopRoundTrip: true, offlineCache: true, realIPhoneVerified: false }));
} finally { desktop.close(); await fs.rm(temporary, { recursive: true, force: true }); }
