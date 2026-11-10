"use client";
import { useEffect, useState } from "react";
import { Cloud, RefreshCw, FolderOpen } from "lucide-react";
import { Badge, Button, Busy } from "./ui";
import type { MobileStatus } from "../mobile/bridge";

export function MobileSyncCard({ disabled, onUpdated }: { disabled: boolean; onUpdated: () => void }) {
  const native = Boolean(window.__qyNativeApp);
  const [status, setStatus] = useState<MobileStatus>(() => ({ ...window.__qingyanMobile!.status }));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const update = () => setStatus({ ...window.__qingyanMobile!.status });
    window.addEventListener("qingyan-mobile-status", update);
    return () => window.removeEventListener("qingyan-mobile-status", update);
  }, []);
  async function action(connect: boolean) {
    setBusy(true); setError("");
    try {
      const mobile = window.__qingyanMobile!;
      if (connect) await mobile.connect(); else await mobile.sync();
      onUpdated();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="panel icloud-sync-card">
    <div className="panel-heading"><h2><Cloud size={19} /> iCloud 文件同步</h2><Badge tone={status.folder ? "green" : "gray"}>{status.folder ? "目录已连接" : "尚未连接"}</Badge></div>
    <div className="settings-content">
      <p>界面与记录运行在此设备上，电脑关机后也可使用。联网时可从 iCloud 读取其他设备的更新。</p>
      <p className="muted">{native ? "首次连接请选择「iCloud 云盘 → 清研复习」。App 会记住你选择的文件夹；iPhone、iPad 和电脑连接同一个文件夹即可交换更新。" : "首次连接请选择「iCloud 云盘 → 清研复习」。在 Scriptable 设置的 File Bookmarks 中把这个文件夹命名为「清研复习」，以后打开可自动连接。"}</p>
      <div className="icloud-actions">
        <Button variant="secondary" disabled={disabled || busy || status.syncing} onClick={() => void action(true)}><FolderOpen size={16} />{status.folder ? "重新选择文件夹" : "连接 iCloud 文件夹"}</Button>
        <Button variant="secondary" disabled={disabled || busy || status.syncing || !status.folder} onClick={() => void action(false)}>{busy || status.syncing ? <Busy /> : <RefreshCw size={16} />}同步更新</Button>
      </div>
      <p className="muted">{status.syncing ? "正在读取和写入同步包…" : status.pending ? "手机已保存，等待写入 iCloud 文件夹。" : status.lastWritten ? "已写入本地 iCloud 文件夹；上传进度以“文件”App 为准。" : "记录保存在手机本地。"}</p>
      {status.lastWritten && <p className="muted">最近写入：{new Date(status.lastWritten).toLocaleString("zh-CN")}</p>}
      {(error || status.error) && <p role="alert" className="error-text">{error || status.error}</p>}
      <p className="muted">手机运行版暂限附件总量 64 MB、单文件 20 MB。首次同步后，请在“文件”App 中将常用资料设为保留下载。离线时使用已下载的缓存；请勿同时修改两端的同一条记录，切换设备前先等待 iCloud 同步完成。</p>
    </div>
  </section>;
}
