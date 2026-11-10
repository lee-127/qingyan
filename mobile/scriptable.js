// Variables used by Scriptable.
// icon-color: deep-green; icon-glyph: graduation-cap;
// 清研 iPhone 本地运行版 v1.0.1。所有界面资源随此文件提供，不访问网页服务器。
const fm = FileManager.local();
let cloud;
try { cloud = FileManager.iCloud(); } catch (_) {}
const home = fm.joinPath(fm.documentsDirectory(), "QingyanMobile");
fm.createDirectory(home, true);
const assets = fm.joinPath(home, "files");
fm.createDirectory(assets, true);
const stateFile = fm.joinPath(home, "state.json");
const idFile = fm.joinPath(home, "device-id.txt");
if (!fm.fileExists(idFile)) fm.writeString(idFile, UUID.string().toLowerCase());
const deviceId = fm.readString(idFile);
const maxPackage = 64 * 1024 * 1024;
let root = null;
try { if (fm.bookmarkExists("清研复习")) root = fm.bookmarkedPath("清研复习"); } catch (_) {}
const validId = id => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const validPackage = name => typeof name === "string" && /^device-[0-9a-f-]{36}\.zip$/i.test(name);
function filename(name) { return String(name || "清研文件").replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 200); }
function assetPath(id) { if (!validId(id)) throw new Error("附件编号无效"); return fm.joinPath(assets, id); }
function atomicText(file, text) {
  const temporary = file + ".writing";
  fm.writeString(temporary, text);
  // Preserve a recovery copy before replacing the state. Raw attachments are immutable.
  if (fm.fileExists(file)) {
    const previous = file + ".previous";
    if (fm.fileExists(previous)) fm.remove(previous);
    fm.copy(file, previous);
    fm.remove(file);
  }
  fm.move(temporary, file);
}
function recoverState() {
  for (const candidate of [stateFile, stateFile + ".writing", stateFile + ".previous"]) {
    if (!fm.fileExists(candidate)) continue;
    try {
      const state = JSON.parse(fm.readString(candidate));
      if (state.schemaVersion === 2 && state.data && Array.isArray(state.assets) && Array.isArray(state.tombstones)) return state;
    } catch (_) {}
  }
  if ([stateFile, stateFile + ".writing", stateFile + ".previous"].some(p => fm.fileExists(p))) throw new Error("手机缓存无法读取。已保留原文件，请勿卸载 Scriptable，可从 iCloud 同步包恢复。");
  return null;
}
async function downloaded(file) { if (cloud) await cloud.downloadFileFromiCloud(file); }
function requireRoot() {
  if (!root) throw new Error("请先连接 iCloud 云盘中的“清研复习”文件夹");
  return root;
}
function syncDirectory() { return fm.joinPath(requireRoot(), "同步数据"); }
function decode(value, limit) {
  if (typeof value !== "string" || value.length > Math.ceil(limit / 3) * 4 + 4) throw new Error("文件超过手机运行版容量限制");
  const data = Data.fromBase64String(value);
  if (!data) throw new Error("文件内容无效");
  return data;
}
const handlers = {
  boot: () => ({ state: recoverState(), deviceId, folder: root }),
  uuid: () => UUID.string().toLowerCase(),
  persist: ({ state }) => {
    if (!state || state.schemaVersion !== 2 || !state.data || !Array.isArray(state.assets) || !Array.isArray(state.tombstones)) throw new Error("缓存格式无效");
    atomicText(stateFile, JSON.stringify(state));
    return true;
  },
  readAsset: ({ id }) => {
    const file = assetPath(id);
    if (!fm.fileExists(file)) throw new Error("手机缺少附件，请同步更新");
    return fm.read(file).toBase64String();
  },
  writeAsset: ({ id, base64 }) => {
    const file = assetPath(id);
    const data = decode(base64, 20 * 1024 * 1024);
    if (!fm.fileExists(file)) fm.write(file, data);
    return true;
  },
  connect: async () => {
    if (fm.bookmarkExists("清研复习")) root = fm.bookmarkedPath("清研复习");
    else {
      const chosen = await DocumentPicker.openFolder();
      const selected = Array.isArray(chosen) ? chosen[0] : chosen;
      if (!selected) throw new Error("没有选择文件夹，手机记录仍保存在本机");
      if (!fm.fileExists(fm.joinPath(selected, "同步数据"))) throw new Error("请选择已有的“清研复习”文件夹，其中应有“同步数据”子文件夹");
      root = selected;
    }
    return { folder: root };
  },
  listPackages: () => {
    const folder = syncDirectory();
    if (!fm.fileExists(folder)) return [];
    return fm.listContents(folder).filter(name => validPackage(name) && name !== `device-${deviceId}.zip`).sort();
  },
  readPackage: async ({ name }) => {
    if (!validPackage(name)) throw new Error("同步包名称无效");
    const file = fm.joinPath(syncDirectory(), name);
    await downloaded(file);
    if (fm.fileSize(file) * 1024 > maxPackage) throw new Error("手机运行版同步包暂限 64 MB，请在电脑版管理较大的资料库。");
    return fm.read(file).toBase64String();
  },
  publish: async ({ base64, attachments }) => {
    const directory = syncDirectory();
    const data = decode(base64, maxPackage);
    // Keep a local outbox even when iCloud is temporarily offline.
    fm.write(fm.joinPath(home, "pending-sync.zip"), data);
    fm.createDirectory(directory, true);
    // Save originals separately for the Files app. The sync ZIP remains the authoritative snapshot.
    for (const a of attachments || []) {
      const source = assetPath(a.id);
      const targetFolder = fm.joinPath(fm.joinPath(root, "资料附件"), a.id);
      fm.createDirectory(targetFolder, true);
      const target = fm.joinPath(targetFolder, filename(a.name));
      if (!fm.fileExists(target)) fm.copy(source, target);
    }
    const target = fm.joinPath(directory, `device-${deviceId}.zip`);
    const writing = target + ".writing";
    fm.write(writing, data);
    if (fm.fileExists(target)) {
      // Keep the previous cloud package until replacement succeeds; readers ignore .previous files.
      const previous = target + ".previous";
      if (fm.fileExists(previous)) fm.remove(previous);
      fm.move(target, previous);
    }
    fm.move(writing, target);
    return { writtenAt: new Date().toISOString(), uploadVerified: false };
  },
  openAsset: async ({ id, name }) => {
    const source = assetPath(id);
    const directory = fm.joinPath(fm.temporaryDirectory(), "qingyan-" + id);
    fm.createDirectory(directory, true);
    const copy = fm.joinPath(directory, filename(name));
    if (fm.fileExists(copy)) fm.remove(copy);
    fm.copy(source, copy);
    await QuickLook.present(copy, false);
    return true;
  },
  exportFile: async ({ base64, name }) => {
    await DocumentPicker.exportData(decode(base64, maxPackage), filename(name));
    return true;
  },
};
const view = new WebView();
const initial = JSON.stringify(handlers.boot()).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const page = __QINGYAN_HTML__.replace("<!--QINGYAN_BOOT-->", `<script>window.__qyInitial=${initial};</script>`);
// The entire page is inline. No synthetic HTTPS origin or navigation filter is needed.
await view.loadHTML(page);
let closed = false;
const dismissed = view.present(false).then(() => { closed = true; return null; });
const pause = () => new Promise(resolve => Timer.schedule(150, false, resolve));
while (!closed) {
  try {
    const encoded = await Promise.race([
      view.evaluateJavaScript("typeof window.__qyDrain === 'function' ? window.__qyDrain() : '[]'", false),
      dismissed,
    ]);
    if (closed) break;
    const messages = JSON.parse(encoded || "[]");
    for (const message of messages) {
      if (closed) break;
      let response;
      try {
        const handler = handlers[message.method];
        if (!handler) throw new Error("不支持此手机操作");
        response = { id: message.id, value: await handler(message.params || {}) };
      } catch (e) { response = { id: message.id, error: String(e.message || e) }; }
      // A literal string return avoids WKWebView's unsupported-result error for undefined.
      if (!closed) await view.evaluateJavaScript(`window.__qyReply(${JSON.stringify(response)}); 'ok';`, false);
    }
    if (!closed) await Promise.race([pause(), dismissed]);
  } catch (e) {
    if (!closed) {
      const message = "手机连接中断：" + String(e.message || e) + "。请关闭此界面后重新运行清研。";
      fm.writeString(fm.joinPath(home, "last-startup-error.txt"), new Date().toISOString() + "\n" + message);
      try { await view.evaluateJavaScript(`window.__qyTransportFailed && window.__qyTransportFailed(${JSON.stringify(message)}); window.__qyShowError && window.__qyShowError(${JSON.stringify(message)}); 'ok';`, false); } catch (_) {}
      await dismissed;
    }
    break;
  }
}
Script.complete();
