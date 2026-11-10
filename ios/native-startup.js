(() => {
  const show = message => {
    let panel = document.getElementById("qingyan-app-error");
    if (!panel) {
      panel = document.createElement("section"); panel.id = "qingyan-app-error"; panel.setAttribute("role", "alert");
      panel.style.cssText = "position:fixed;top:12px;left:12px;right:12px;padding:20px;background:#fff9f2;color:#482e22;border:1px solid #cda28f;border-radius:14px;z-index:99999;font:15px/1.7 system-ui;white-space:pre-wrap";
      document.body.appendChild(panel);
    }
    panel.textContent = "清研 App 启动提示\n" + message + "\n本地记录仍保留，请先保留备份，再反馈错误文字。";
  };
  window.__qyShowError = show;
  window.addEventListener("error", event => show(String(event.message || "界面文件加载失败")));
  window.addEventListener("unhandledrejection", event => show(String(event.reason?.message || event.reason || "启动未完成")));
  setTimeout(() => { if (!window.__qyReady) show("启动超过 20 秒。请关闭 App 后重新打开；若反复出现，请反馈此提示。"); }, 20000);
})();
