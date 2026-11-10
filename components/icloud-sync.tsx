"use client";
import { useEffect, useRef, useState } from "react";
import {
  Cloud,
  RefreshCw,
  UploadCloud,
  DownloadCloud,
  FolderSync,
  FileUp,
} from "lucide-react";
import { Badge, Button, Busy, Field } from "./ui";
type Status = {
  enabled: boolean;
  folder: string;
  availableRoots: string[];
  lastWritten?: string;
  lastPulled?: string;
  lastApplied?: string;
  lastError: string;
  pending: boolean;
};
export function ICloudSyncCard({
  disabled,
  onUpdated,
}: {
  disabled: boolean;
  onUpdated: () => void;
}) {
  const [status, setStatus] = useState<Status>(),
    [folder, setFolder] = useState(""),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null),
    updated = useRef(onUpdated),
    lastApplied = useRef(""),
    receivedStatus = useRef(false);
  updated.current = onUpdated;
  async function refresh(force = false) {
    try {
      const r = await fetch(
        `/api/v1/local/icloud/status${force ? "?refresh=1" : ""}`,
      );
      const data = (await r.json()) as Status & { error?: string };
      if (!r.ok) throw new Error(data.error || "状态暂不可用");
      setStatus(data);
      setFolder((current) => current || data.availableRoots[0] || "");
      if (!receivedStatus.current) {
        receivedStatus.current = true;
        lastApplied.current = data.lastApplied || "";
      } else if (data.lastApplied && data.lastApplied !== lastApplied.current) {
        lastApplied.current = data.lastApplied;
        updated.current();
      }
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, []);
  async function action(name: string) {
    setBusy(name);
    setMessage("");
    try {
      const r = await fetch(`/api/v1/local/icloud/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          name === "connect" ? { folder: folder.trim() || undefined } : {},
        ),
      });
      const result: any = await r.json();
      if (!r.ok) throw new Error(result.error || "同步暂未完成");
      setMessage(
        name === "pull"
          ? `更新完成：新增 ${result.added}，更新 ${result.updated}，删除 ${result.deleted}。`
          : name === "disconnect"
            ? "已停止自动同步，云盘中的原文件已保留。"
            : "同步包已写入云盘文件夹，请等待 iCloud 客户端完成上传。",
      );
      await refresh();
      if (name === "pull" || name === "connect") updated.current();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    setBusy("import");
    try {
      if (file.size > 512 * 1024 * 1024)
        throw new Error("同步包不能超过 512 MB");
      const r = await fetch("/api/v1/local/icloud/import", {
        method: "POST",
        headers: { "Content-Type": "application/zip" },
        body: file,
      });
      const result: any = await r.json();
      if (!r.ok) throw new Error(result.error || "更新未完成");
      setMessage(
        `更新完成：新增 ${result.added}，更新 ${result.updated}，删除 ${result.deleted}，保留冲突 ${result.conflicts}。`,
      );
      updated.current();
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  const time = (s?: string) =>
    s
      ? new Intl.DateTimeFormat("zh-CN", {
          timeZone: "Asia/Shanghai",
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(s))
      : "尚未执行";
  return (
    <section className="panel icloud-panel">
      <div className="panel-heading">
        <h2>
          <Cloud size={18} />
          iCloud 文件同步
        </h2>
        <Badge tone={status?.enabled ? "green" : "gray"}>
          {status?.enabled ? "目录已连接" : "未连接"}
        </Badge>
      </div>
      <div className="settings-content">
        <p>
          用普通 iCloud
          云盘保存同步包和资料附件，无需开发者账号。连接后，电脑会在保存后自动写入，并在读取记录时检查其他设备的更新。
        </p>
        {status?.enabled ? (
          <>
            <p className="data-location">同步目录：{status.folder}</p>
            <dl className="sync-times">
              <dt>写入同步包</dt>
              <dd>{time(status.lastWritten)}</dd>
              <dt>读取同步包</dt>
              <dd>{time(status.lastPulled)}</dd>
            </dl>
            <p className="muted">
              {status.pending ? "有本机更改等待写入。" : "本机同步包已更新。"}
              上传和下载由 Apple 的 iCloud
              客户端完成，此处不能确认云端上传进度。
            </p>
            <div className="sync-actions">
              <Button
                variant="secondary"
                disabled={!!busy || disabled}
                onClick={() => action("push")}
              >
                {busy === "push" ? <Busy /> : <UploadCloud size={16} />}
                立即写入云盘
              </Button>
              <Button
                variant="secondary"
                disabled={!!busy || disabled}
                onClick={() => action("pull")}
              >
                {busy === "pull" ? <Busy /> : <DownloadCloud size={16} />}
                从云盘更新
              </Button>
              <button
                className="text-btn"
                disabled={!!busy || disabled}
                onClick={() => action("disconnect")}
              >
                停止自动同步
              </button>
            </div>
          </>
        ) : (
          <>
            <Field
              label="iCloud 云盘目录"
              hint="在 Windows 版 iCloud 中查看云盘位置。请先开启云盘，不要填写“iCloud 照片”目录。"
            >
              <input
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="开启云盘后可自动检测，也可填写自定义位置"
              />
            </Field>
            <div className="sync-actions">
              <Button
                variant="secondary"
                disabled={!!busy || disabled}
                onClick={() => action("connect")}
              >
                {busy === "connect" ? <Busy /> : <FolderSync size={16} />}
                连接并启用同步
              </Button>
              <Button
                variant="ghost"
                disabled={!!busy}
                onClick={() => refresh(true)}
              >
                <RefreshCw size={15} />
                重新检测
              </Button>
            </div>
            {status && !status.availableRoots.length && (
              <p className="muted">
                尚未检测到 iCloud 云盘。打开 Windows 版 iCloud → iCloud 云盘 →
                开启，完成后点击“重新检测”。
              </p>
            )}
          </>
        )}
        <div className="icloud-phone-note">
          <strong>手机独立使用</strong>
          <p>
            iPhone“文件”→ iCloud 云盘 → 清研复习 →
            资料附件，可直接打开原始资料。同步数据中的 ZIP
            可通过下方入口更新学习记录。
          </p>
          <p>
            电脑关机后使用完整界面，请安装免费的 Scriptable，再从「清研复习 → 手机安装」复制「清研.js」到 Scriptable 文件夹。运行后连接同一个「清研复习」文件夹。首版附件累计限 64 MB，尚需 iPhone 真机验证。
          </p>
          <p><a href="/mobile-install/安装说明.html" target="_blank" rel="noreferrer">查看 iPhone 安装步骤</a>　<a href="/mobile-install/清研.js" download="清研.js">下载手机运行文件</a></p>
        </div>
        <input
          type="file"
          ref={fileInput}
          hidden
          accept=".zip"
          onChange={(e) => void importFile(e.target.files?.[0])}
        />
        <Button
          variant="ghost"
          disabled={!!busy || disabled}
          onClick={() => fileInput.current?.click()}
        >
          <FileUp size={16} />
          选择同步包更新
        </Button>
        {(message || status?.lastError) && (
          <p className="sync-message" role="status">
            {message || status?.lastError}
          </p>
        )}
      </div>
    </section>
  );
}
