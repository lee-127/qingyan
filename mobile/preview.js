// Browser-only native bridge simulator. Never included in the iPhone package.
(() => {
  const files = new Map();
  let state = null;
  const handlers = {
    boot: () => ({ state, deviceId: crypto.randomUUID(), folder: "" }),
    uuid: () => crypto.randomUUID(),
    persist: x => { state = JSON.parse(JSON.stringify(x.state)); return true; },
    writeAsset: x => { files.set(x.id, x.base64); return true; },
    readAsset: x => { if (!files.has(x.id)) throw new Error("预览附件不存在"); return files.get(x.id); },
    connect: () => { throw new Error("电脑验证预览：请在 iPhone 的 Scriptable 中连接 iCloud。"); },
    exportFile: x => {
      const link = document.createElement("a");
      link.href = "data:application/octet-stream;base64," + x.base64;
      link.download = x.name;
      link.click();
      return true;
    },
    openAsset: () => true,
  };
  async function take() {
    const messages = JSON.parse(window.__qyDrain());
    for (const message of messages) {
      let response;
      try { response = { id: message.id, value: await handlers[message.method](message.params) }; }
      catch (e) { response = { id: message.id, error: e.message }; }
      window.__qyReply(response);
    }
    setTimeout(take, 50);
  }
  take();
  const label = document.createElement("div");
  label.textContent = "手机运行版 · 电脑验证预览（数据不保存）";
  label.style.cssText = "position:fixed;bottom:0;left:0;right:0;padding:5px;text-align:center;background:#275d4b;color:white;font:12px sans-serif;z-index:9999;pointer-events:none";
  document.body.appendChild(label);
})();
