// This small script runs before the app bundle, including when that bundle fails to parse.
(() => {
  window.__qyVersion = "1.0.1";
  window.__qyShowError = message => {
    let panel = document.getElementById("qingyan-startup-error");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "qingyan-startup-error";
      panel.setAttribute("role", "alert");
      panel.style.cssText = "position:fixed;top:12px;left:12px;right:12px;z-index:99999;padding:20px;border:1px solid #cda28f;border-radius:14px;background:#fff9f2;color:#482e22;font:15px/1.7 system-ui,sans-serif;white-space:pre-wrap;max-height:75vh;overflow:auto";
      document.body.appendChild(panel);
    }
    panel.textContent = "清研 v1.0.1 启动提示\n" + message + "\n手机记录仍保留。请把上面的错误文字反馈给我。";
  };
  window.addEventListener("error", event => {
    window.__qyShowError(String(event.message || "界面资源加载失败"));
  });
  window.addEventListener("unhandledrejection", event => {
    window.__qyShowError(String(event.reason?.message || event.reason || "启动未完成"));
  });
  setTimeout(() => {
    if (!window.__qyReady) window.__qyShowError("启动超过 20 秒仍未完成。请关闭此页面，在 Scriptable 中重新运行更新后的“清研”。");
  }, 20000);
})();
