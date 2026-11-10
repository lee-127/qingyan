import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import JSZip from "jszip";
import { createWebKitTransport } from "../outputs/ios-tests/transport.mjs";
import { MobileController } from "../outputs/ios-tests/bridge.mjs";

let checks = 0;
const target = {}, messages = [];
const direct = createWebKitTransport(target, message => messages.push(message));
const request = direct("uuid");
assert.equal(messages[0].method, "uuid");
assert.equal(target.__qyDrain, undefined);
assert.equal(target.__qyReply({ id: messages[0].id, value: "native-id" }), "ok");
assert.equal(await request, "native-id"); checks++;
const throwing = createWebKitTransport({}, () => { throw new Error("host unavailable"); });
await assert.rejects(throwing("boot"), /host unavailable/); checks++;

let releaseList, releasePublish, publishing, persistent, published;
let holdList = true, holdPublish = true;
const enteredPublish = new Promise(resolve => { publishing = resolve; });
const list = new Promise(resolve => { releaseList = resolve; });
const publish = new Promise(resolve => { releasePublish = resolve; });
const eventTarget = new EventTarget();
globalThis.window = {
  fetch: globalThis.fetch, __qyNativeApp: true,
  __qyInitial: { state: null, deviceId: randomUUID(), folder: "清研复习" },
  dispatchEvent: event => eventTarget.dispatchEvent(event),
};
globalThis.document = { addEventListener() {} };
const native = async (method, parameters) => {
  if (method === "uuid") return randomUUID();
  if (method === "persist") { persistent = structuredClone(parameters.state); return true; }
  if (method === "listPackages") return holdList ? list : [];
  if (method === "publish") {
    published = parameters.base64;
    publishing();
    if (holdPublish) await publish;
    return { writtenAt: new Date().toISOString() };
  }
  throw new Error("unexpected native operation " + method);
};
const controller = await new MobileController(native).boot();
const score = { title: "独立 App 本地练习", subject: "数学", type: "模拟卷", score: 120, total: 150, date: "2026-11-06", duration: 180, sourceId: "", note: "" };
const within = async promise => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("local cache waited for cloud IO")), 1000); })]); }
  finally { clearTimeout(timer); }
};
try {
  const exchange = controller.sync();
  const all = await within(window.fetch("/api/v1/records").then(r => r.json()));
  assert.equal(all.score.length, 0); checks++;
  const save = await within(window.fetch("/api/v1/records/score", { method: "POST", body: JSON.stringify(score) }));
  assert(save.ok); assert.equal(persistent.data.score.length, 1); checks++;
  holdList = false; releaseList([]);
  await enteredPublish;
  const second = await within(window.fetch("/api/v1/records/score", { method: "POST", body: JSON.stringify({ ...score, title: "云盘写入时继续练习" }) }));
  assert(second.ok); checks++;
  holdPublish = false; releasePublish();
  await exchange;
  assert.equal(controller.status.pending, true); checks++;
  await controller.sync();
  assert.equal(controller.status.pending, false);
  const zip = await JSZip.loadAsync(Buffer.from(published, "base64"));
  const manifest = JSON.parse(await zip.file("manifest.json").async("string"));
  assert.equal(manifest.data.score.length, 2); checks++;
  const archive = await JSZip.loadAsync(await fs.readFile(new URL("../outputs/清研-iPhone-iPad-私人App工程.zip", import.meta.url)));
  const packaging = JSON.parse(await archive.file("package-manifest.json").async("string"));
  for (const entry of packaging.files) {
    assert(!entry.path.includes(".."));
    const bytes = await archive.file(entry.path).async("nodebuffer");
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
    assert(!/\.(sqlite|mobileprovision|p12|pem)$/.test(entry.path));
  }
  assert(archive.file(".github/workflows/build-private-ipa.yml"));
  assert.equal(packaging.appleSDKBuildVerified, false); checks++;
  const html = await archive.file("QingyanApp/Web/index.html").async("string");
  assert(!/https?:\/\//.test(html));
  assert(html.includes('src="app.js"'));
  assert(html.includes('src="startup.js"'));
  assert(!html.includes("Scriptable")); checks++;
  console.log(JSON.stringify({ passed: checks, directWebKitBridge: true, localEditingDuringCloudIO: true, appleSDKBuildVerified: false }));
} finally {
  clearTimeout(controller.timer);
  delete globalThis.window;
  delete globalThis.document;
}
