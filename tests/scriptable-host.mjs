import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import { createTransport } from "../outputs/mobile-app/transport.mjs";
const temp = await fsp.mkdtemp(path.join(os.tmpdir(), "qingyan-ios-host-"));
const documents = path.join(temp, "phone"), cloudRoot = path.join(temp, "cloud", "清研复习");
fs.mkdirSync(documents, { recursive: true }); fs.mkdirSync(path.join(cloudRoot, "同步数据"), { recursive: true });
let oversize = false, previewed = "", exported;
const data = bytes => ({ bytes: Buffer.from(bytes), toBase64String() { return this.bytes.toString("base64"); } });
const fm = {
  documentsDirectory: () => documents, temporaryDirectory: () => temp,
  joinPath: path.join, createDirectory: (p, recursive) => fs.mkdirSync(p, { recursive }),
  fileExists: fs.existsSync, readString: p => fs.readFileSync(p, "utf8"), writeString: (p, s) => fs.writeFileSync(p, s),
  read: p => data(fs.readFileSync(p)), write: (p, d) => fs.writeFileSync(p, d.bytes),
  remove: p => fs.unlinkSync(p), copy: fs.copyFileSync, move: fs.renameSync,
  listContents: fs.readdirSync, fileSize: p => (oversize ? 65 * 1024 * 1024 : fs.statSync(p).size) / 1024,
  bookmarkExists: name => name === "清研复习", bookmarkedPath: () => cloudRoot,
  downloadFileFromiCloud: async () => {},
};
const source = await fsp.readFile(new URL("../mobile/scriptable.js", import.meta.url), "utf8");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const compiled = new AsyncFunction("FileManager", "Data", "UUID", "DocumentPicker", "QuickLook", source.split("const view = new WebView();")[0] + "\nreturn { handlers, stateFile, home };\n");
const host = await compiled({ local: () => fm, iCloud: () => fm }, { fromBase64String: s => data(Buffer.from(s, "base64")) }, { string: randomUUID }, { exportData: async (d, name) => { exported = { name, bytes: d.bytes }; } }, { present: async p => { previewed = p; } });
let checks = 0;
try {
  const boot = host.handlers.boot();
  assert.equal(boot.state, null); assert.equal(boot.folder, cloudRoot); checks++;
  const valid = { schemaVersion: 2, data: { score: [{ id: "first" }] }, assets: [], tombstones: [] };
  host.handlers.persist({ state: valid });
  host.handlers.persist({ state: { ...valid, data: { score: [{ id: "second" }] } } });
  fs.writeFileSync(host.stateFile, "corrupt");
  assert.deepEqual(host.handlers.boot().state.data.score, valid.data.score); checks++;
  const id = randomUUID(), bytes = Buffer.from("手机原始附件");
  host.handlers.writeAsset({ id, base64: bytes.toString("base64") });
  assert.equal(host.handlers.readAsset({ id }), bytes.toString("base64"));
  assert.throws(() => host.handlers.readAsset({ id: "../../escape" })); checks++;
  const packageBytes = Buffer.from("sync ZIP supplied by the validated web store");
  await host.handlers.publish({ base64: packageBytes.toString("base64"), attachments: [{ id, name: "笔记.txt" }] });
  assert.deepEqual(fs.readFileSync(path.join(cloudRoot, "同步数据", `device-${boot.deviceId}.zip`)), packageBytes);
  assert.deepEqual(fs.readFileSync(path.join(cloudRoot, "资料附件", id, "笔记.txt")), bytes);
  assert(fs.existsSync(path.join(host.home, "pending-sync.zip"))); checks++;
  const otherName = `device-${randomUUID()}.zip`;
  fs.writeFileSync(path.join(cloudRoot, "同步数据", otherName), packageBytes);
  assert.deepEqual(host.handlers.listPackages(), [otherName]);
  assert.equal(await host.handlers.readPackage({ name: otherName }), packageBytes.toString("base64"));
  oversize = true;
  await assert.rejects(host.handlers.readPackage({ name: otherName }), /64 MB/); oversize = false; checks++;
  await host.handlers.openAsset({ id, name: "笔记.txt" });
  assert(previewed.endsWith("笔记.txt"));
  assert.deepEqual(fs.readFileSync(previewed), bytes); checks++;
  await host.handlers.exportFile({ base64: bytes.toString("base64"), name: "练习.docx" });
  assert.equal(exported.name, "练习.docx"); assert.deepEqual(exported.bytes, bytes); checks++;
  const generated = await fsp.readFile(new URL("../outputs/mobile-app/清研.js", import.meta.url), "utf8");
  new AsyncFunction(generated); checks++;
  // Execute the entire generated launcher. Match WKWebView's strict scalar-result
  // behavior; an undefined evaluateJavaScript result must fail this regression test.
  const browser = {}, nativeCall = createTransport(browser);
  let dismiss, scenario, finished = false, evaluations = 0;
  const dismissed = new Promise(resolve => { dismiss = resolve; });
  class WebViewMock {
    async loadHTML(page, base) {
      assert.equal(base, undefined);
      assert(page.includes("清研 v1.0.1"));
      const boot = /<script>window\.__qyInitial=([\s\S]*?);<\/script>/.exec(page);
      assert(boot, "initial state must be injected before presenting the app");
      browser.__qyInitial = JSON.parse(boot[1]);
    }
    present() {
      scenario = (async () => {
        assert.equal(browser.__qyInitial.deviceId, boot.deviceId);
        const newId = await nativeCall("uuid");
        assert.match(newId, /^[0-9a-f-]{36}$/);
        await nativeCall("persist", { state: valid });
        assert.equal(await nativeCall("readAsset", { id }), bytes.toString("base64"));
        await nativeCall("exportFile", { name: "启动回归.txt", base64: bytes.toString("base64") });
        dismiss();
      })();
      scenario.catch(() => dismiss());
      return dismissed;
    }
    async evaluateJavaScript(code, useCallback) {
      assert.equal(useCallback, false, "the launcher must not retain completion callbacks");
      const value = vm.runInNewContext(code, { window: browser });
      assert.equal(typeof value, "string", "WKWebView receives only explicit scalar results");
      evaluations++;
      return value;
    }
  }
  const run = new AsyncFunction("FileManager", "Data", "UUID", "DocumentPicker", "QuickLook", "WebView", "Timer", "Script", generated);
  let timeout;
  try {
    await Promise.race([
      run({ local: () => fm, iCloud: () => fm }, { fromBase64String: s => data(Buffer.from(s, "base64")) }, { string: randomUUID }, { exportData: async () => {} }, { present: async () => {} }, WebViewMock, { schedule: (_ms, repeat, fn) => { assert.equal(repeat, false); setImmediate(fn); } }, { complete: () => { finished = true; } }),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("launcher did not finish native round trips")), 3000); }),
    ]);
  } finally { clearTimeout(timeout); }
  await scenario;
  assert(finished); assert(evaluations >= 4); checks++;
  console.log(JSON.stringify({ passed: checks, nativeHostSimulated: true, realIPhoneVerified: false }));
} finally { await fsp.rm(temp, { recursive: true, force: true }); }
