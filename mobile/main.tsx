import React from "react";
import { createRoot } from "react-dom/client";
import Workspace from "../app/workspace";
import { createBridge, MobileController } from "./bridge";
import "../app/globals.css";

const root = document.getElementById("root")!;
class StartupBoundary extends React.Component<React.PropsWithChildren, { error: string }> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() {
    if (this.state.error) return <main style={{ padding: 24 }}><h1>清研{window.__qyNativeApp ? " App" : " v1.0.1"}启动失败</h1><p>{this.state.error}</p><p>本地缓存仍保留，请将这段错误文字反馈给我。</p></main>;
    return this.props.children;
  }
}
void (async () => {
  try {
    window.__qingyanMobile = await new MobileController(createBridge()).boot();
    createRoot(root).render(<StartupBoundary><Workspace mode="mobile" /></StartupBoundary>);
    window.__qyReady = true;
    window.__qingyanMobile.refresh();
  } catch (e) {
    root.replaceChildren();
    const title = document.createElement("h1"), text = document.createElement("p");
    title.textContent = window.__qyNativeApp ? "清研 App 暂时没能打开" : "清研 v1.0.1 暂时没能打开";
    text.textContent = (e as Error).message + (window.__qyNativeApp ? "。原缓存仍保留，请先保留完整备份。" : "。原缓存仍保留，请勿卸载 Scriptable。");
    root.appendChild(title);
    root.appendChild(text);
  }
})();
