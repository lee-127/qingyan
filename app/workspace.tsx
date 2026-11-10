"use client";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  LayoutDashboard,
  FolderOpen,
  NotebookPen,
  Files,
  ChartNoAxesCombined,
  Settings2,
  Plus,
  ChevronRight,
  CircleCheck,
  AlertCircle,
  X,
  Menu,
  Download,
  ShieldCheck,
  ArrowLeft,
  Sprout,
  Upload,
  HardDrive,
  ScanSearch,
} from "lucide-react";
import {
  EMPTY,
  SUBJECTS,
  type StudyData,
  type Kind,
  type Paper,
  dateISO,
} from "@/lib/models";
import { api, download } from "@/lib/client";
import { demoData } from "@/lib/demo";
import { Button, Modal, Busy, Badge } from "@/components/ui";
import { RecordForm } from "@/components/record-form";
import { Dashboard } from "@/components/dashboard";
import { Library } from "@/components/library";
import { Mistakes } from "@/components/mistakes";
import { Builder } from "@/components/builder";
import { Scores } from "@/components/scores";
import { ICloudSyncCard } from "@/components/icloud-sync";
import { MobileSyncCard } from "@/components/mobile-sync";
import { DeepSeekSettings } from "@/components/ai-solver";
import { PhotoSearch } from "@/components/photo-search";
import { nativeStudyTools } from "@/lib/study-tools";

const NAV = [
  { id: "dashboard", label: "复习概览", icon: LayoutDashboard },
  { id: "photo-search", label: "AI 拍照搜题", icon: ScanSearch, native: true },
  { id: "library", label: "资料库", icon: FolderOpen },
  { id: "mistakes", label: "错题本", icon: NotebookPen },
  { id: "builder", label: "错题组卷", icon: Files },
  { id: "scores", label: "成绩分析", icon: ChartNoAxesCombined },
  { id: "settings", label: "数据与设置", icon: Settings2 },
];
export default function Workspace({
  mode = "cloud",
}: { mode?: "cloud" | "local" | "mobile" } = {}) {
  const phone = mode === "mobile";
  const local = mode === "local" || phone;
  const native = nativeStudyTools();
  const restoreInput = useRef<HTMLInputElement>(null);
  const [localTransfer, setLocalTransfer] = useState(false);
  const [dataDirectory, setDataDirectory] = useState("");
  const [page, setPage] = useState("dashboard"),
    [data, setData] = useState<StudyData>(EMPTY),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [demo, setDemo] = useState(false),
    [mobile, setMobile] = useState(false),
    [selected, setSelected] = useState<string[]>([]);
  const [form, setForm] = useState<{ kind: Kind; initial?: any; startCrop?: boolean }>(),
    [confirm, setConfirm] = useState<{ kind: Kind; item: any }>(),
    [toast, setToast] = useState<{ text: string; error?: boolean }>(),
    [deleting, setDeleting] = useState(false),
    [exporting, setExporting] = useState(false);
  const shown = demo ? demoDataMemo() : data;
  const subjects = [
    ...new Set([
      ...(shown.settings[0]?.subjects || SUBJECTS),
      ...shown.material.map((m) => m.subject),
      ...shown.mistake.map((m) => m.subject),
      ...shown.score.map((s) => s.subject),
    ]),
  ];
  function demoDataMemo() {
    return demoData();
  }
  function notify(text: string, error = false) {
    setToast({ text, error });
  }
  async function reload() {
    setLoading(true);
    setLoadError("");
    try {
      setData(await api.all());
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    reload();
    if (local)
      fetch("/api/v1/local/info")
        .then((r) => r.json())
        .then((r: any) => setDataDirectory(r.dataDirectory || ""))
        .catch(() => {});
    const sync = () => {
      const p = location.hash.slice(1);
      if (NAV.some((n) => n.id === p && (!n.native || native))) setPage(p);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!phone) return;
    const updated = () => { void reload(); };
    const focus = () => { window.__qingyanMobile?.refresh(); };
    window.addEventListener("qingyan-mobile-updated", updated);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      window.removeEventListener("qingyan-mobile-updated", updated);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [phone]);
  useEffect(() => { if (phone) window.__qingyanMobile?.refresh(); }, [page, phone]);
  function nav(p: string) {
    setPage(p);
    location.hash = p;
    setMobile(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function writable() {
    if (demo) {
      notify("当前为示例预览，请先退出示例，再添加自己的记录。");
      return false;
    }
    if (loadError) {
      notify("请先重新连接资料库，再进行编辑。", true);
      return false;
    }
    return true;
  }
  function add(kind: Kind, initial?: any) {
    if (writable()) setForm({ kind, initial });
  }
  async function save(kind: Kind, value: any) {
    if (!writable()) throw new Error("请退出示例预览后操作");
    await api.save(kind, value);
    const latest = await api.all();
    setData(latest);
    notify("已保存，今天又积累了一点。");
  }
  async function remove() {
    if (!confirm) return;
    setDeleting(true);
    try {
      await api.remove(confirm.kind, confirm.item.id);
      setData(await api.all());
      setSelected((v) => v.filter((id) => id !== confirm.item.id));
      setConfirm(undefined);
      notify("记录已删除。");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setDeleting(false);
    }
  }
  function askDelete(kind: Kind, item: any) {
    if (writable()) setConfirm({ kind, item });
  }
  async function exportPaper(paper: Paper) {
    setExporting(true);
    try {
      const { exportDocx } = await import("@/lib/export");
      await exportDocx(paper);
      notify("Word 文档已生成。");
    } catch (e) {
      notify((e as Error).message || "导出失败，请重试。", true);
    } finally {
      setExporting(false);
    }
  }
  async function backup() {
    if (local && !demo) {
      setLocalTransfer(true);
      try {
        const response = await fetch("/api/v1/local/backup");
        if (!response.ok)
          throw new Error(
            ((await response.json()) as any).error || "备份未完成",
          );
        await download(await response.blob(), `清研完整备份-${dateISO()}.zip`);
        notify("完整备份已导出，包含学习记录、原始文件和题图。");
      } catch (e) {
        notify((e as Error).message, true);
      } finally {
        setLocalTransfer(false);
      }
      return;
    }
    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      data: shown,
    };
    await download(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
      `清研-学习记录-${new Date().toISOString().slice(0, 10)}.json`,
    );
    notify("记录已导出，原始附件请在资料库单独下载。");
  }
  async function restore(file?: File) {
    if (!file) return;
    setLocalTransfer(true);
    try {
      if (file.size > 512 * 1024 * 1024)
        throw new Error("备份文件不能超过 512 MB");
      const response = await fetch("/api/v1/local/restore", {
        method: "POST",
        headers: { "Content-Type": "application/zip" },
        body: file,
      });
      const result: any = await response.json();
      if (!response.ok) throw new Error(result.error || "导入未完成");
      setData(await api.all());
      notify(
        `已导入 ${result.added} 条记录，保留本机已有的 ${result.skipped} 条重复记录。`,
      );
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setLocalTransfer(false);
      if (restoreInput.current) restoreInput.current.value = "";
    }
  }
  const active = NAV.find((n) => n.id === page)!;
  return (
    <div className={`app-shell${nativeStudyTools() ? " native-shell" : ""}`}>
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <a className="brand" href="#dashboard" onClick={() => nav("dashboard")}>
          <span className="brand-mark">
            <BookOpen size={25} />
          </span>
          <div>
            <strong>
              清研<span>STUDY SPACE</span>
            </strong>
            <p>让每一份努力，都有回响</p>
          </div>
        </a>
        <div className="nav-caption">我的复习空间</div>
        <nav>
          {NAV.filter((n) => n.id !== "settings" && (!n.native || native)).map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "active" : ""}
              onClick={() => nav(n.id)}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.id === "mistakes" && shown.mistake.length > 0 && (
                <small>{shown.mistake.length}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-quote">
            <Sprout size={23} />
            <p>
              日拱一卒
              <br />
              <strong>功不唐捐</strong>
            </p>
            <span>ONE STEP AT A TIME</span>
          </div>
          <button
            className={page === "settings" ? "active" : ""}
            onClick={() => nav("settings")}
          >
            <Settings2 size={18} />
            数据与设置
          </button>
          <div className="profile">
            <div className="avatar">研</div>
            <div>
              <strong>我的备考空间</strong>
              <span>
                <i />
                持续积累中
              </span>
            </div>
            <span
              className="icon-btn"
              title={
                local ? "本机专属空间 · 无需联网" : "专属空间 · 免登录使用"
              }
              aria-label="免登录使用"
            >
              <ShieldCheck size={16} />
            </span>
          </div>
        </div>
      </aside>
      {mobile && (
        <div className="sidebar-shade" onClick={() => setMobile(false)} />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-menu"
              aria-label="打开导航"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>我的复习空间</span>
            <ChevronRight size={13} />
            <strong>{active.label}</strong>
          </div>
          <div className="topbar-right">
            {local && (
              <span className="local-indicator">
                <HardDrive size={13} />
                {phone ? typeof window !== "undefined" && window.__qyNativeApp ? "iPhone / iPad App" : "手机独立版" : "本地版 · 无需联网"}
              </span>
            )}
            <span className="save-status">
              <i />
              {loading
                ? "正在连接"
                : loadError
                  ? "连接待恢复"
                  : demo
                    ? "示例预览"
                    : local
                      ? phone ? "已保存到手机" : "已保存到本机"
                      : "记录已同步"}
            </span>
            {page !== "photo-search" && <button
              className="topbar-add"
              onClick={() =>
                add(
                  page === "scores"
                    ? "score"
                    : page === "mistakes"
                      ? "mistake"
                      : "material",
                )
              }
            >
              <Plus size={16} />
              新建记录
            </button>}
            <span className="avatar avatar-small">研</span>
          </div>
        </header>
        <main className="main-content">
          {demo && (
            <div className="demo-banner">
              <span>
                <Badge tone="orange">示例预览</Badge>
                这里的数据仅用于体验，不会写入你的资料库。
              </span>
              <button
                onClick={() => {
                  setDemo(false);
                  setSelected([]);
                }}
              >
                退出示例
                <ArrowLeft size={15} />
              </button>
            </div>
          )}
          {loadError && (
            <div className="error-banner" role="alert">
              <AlertCircle size={18} />
              <span>{loadError}</span>
              <Button variant="secondary" onClick={reload}>
                重新连接
              </Button>
            </div>
          )}
          {loading ? (
            <div className="loading-screen">
              <Busy />
              <h2>正在打开你的复习空间</h2>
              <p>把每一份努力，好好收起来。</p>
            </div>
          ) : (
            <>
              {page === "dashboard" && (
                <Dashboard
                  data={shown}
                  subjects={subjects}
                  onNav={nav}
                  onAdd={add}
                  onDemo={() => {
                    setDemo(true);
                    setSelected([]);
                  }}
                  onSettings={() => add("settings", data.settings[0])}
                />
              )}
              {page === "library" && (
                <Library
                  data={shown}
                  subjects={subjects}
                  onAdd={folderId => add("material", folderId ? { folderId } : undefined)}
                  onEdit={(m) => add("material", m)}
                  onDelete={(m) => askDelete("material", m)}
                  onFolder={folder => add("folder", folder)}
                  onCrop={m => {
                    if (writable()) setForm({ kind: "mistake", initial: { sourceId: m.id, source: m.title, subject: m.subject }, startCrop: true });
                  }}
                />
              )}
              {native && (
                <div hidden={page !== "photo-search"}>
                  <PhotoSearch onSettings={() => nav("settings")} />
                </div>
              )}
              {page === "mistakes" && (
                <Mistakes
                  data={shown}
                  subjects={subjects}
                  selected={selected}
                  setSelected={setSelected}
                  onAdd={() => add("mistake")}
                  onEdit={(m) => add("mistake", m)}
                  onDelete={(m) => askDelete("mistake", m)}
                  onStatus={async (m, s) => {
                    try {
                      if (writable())
                        await save("mistake", { ...m, status: s });
                    } catch (e) {
                      notify((e as Error).message, true);
                    }
                  }}
                  onBuild={() => nav("builder")}
                />
              )}
              {
                <div hidden={page !== "builder"}>
                  <Builder
                    data={shown}
                    selected={selected}
                    setSelected={setSelected}
                    onPick={() => nav("mistakes")}
                    onSave={(p) => save("paper", p)}
                    onExport={exportPaper}
                    onDelete={(p) => askDelete("paper", p)}
                  />
                </div>
              }
              {page === "scores" && (
                <Scores
                  data={shown}
                  subjects={subjects}
                  onAdd={() => add("score")}
                  onEdit={(s) => add("score", s)}
                  onDelete={(s) => askDelete("score", s)}
                />
              )}
              {page === "settings" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">MAKE IT YOURS</span>
                      <h1>数据与设置</h1>
                      <p>照顾好你的复习记录，也留一点空间给未来。</p>
                    </div>
                  </div>
                  <div className="settings-grid">
                    {phone && <MobileSyncCard disabled={demo} onUpdated={() => void reload()} />}
                    {nativeStudyTools() && !demo && <DeepSeekSettings />}
                    {local && !phone && (
                      <ICloudSyncCard
                        disabled={demo}
                        onUpdated={() => void reload()}
                      />
                    )}
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>我的复习目标</h2>
                        <Button
                          variant="secondary"
                          onClick={() => add("settings", data.settings[0])}
                        >
                          编辑设置
                        </Button>
                      </div>
                      <div className="settings-content">
                        <dl>
                          <dt>备考目标</dt>
                          <dd>{shown.settings[0]?.target || "尚未设置"}</dd>
                          <dt>目标考试日期</dt>
                          <dd>{shown.settings[0]?.examDate || "尚未设置"}</dd>
                          <dt>科目</dt>
                          <dd className="tag-row">
                            {subjects.map((s) => (
                              <Badge key={s} tone="gray">
                                {s}
                              </Badge>
                            ))}
                          </dd>
                        </dl>
                      </div>
                    </section>
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>数据备份</h2>
                        <Download size={18} />
                      </div>
                      <div className="settings-content">
                        <p>
                          导出资料信息、错题、练习卷、成绩和复习设置，留存一份自己的记录。
                        </p>
                        {local ? (
                          <>
                            <p className="muted">
                              {phone
                                ? "完整备份包含原始资料、题目图片和全部记录，可保存到“文件”App。导入时保留手机已有的同编号记录。手机缓存保留上一份可恢复状态；请定期导出备份。"
                                : "完整备份包含原始资料、题目图片和全部记录，可导入本地版。导入时保留本机已有的同编号记录。每天首次修改前自动保留数据库快照。"}
                            </p>
                            {dataDirectory && (
                              <p className="data-location">
                                数据文件夹：{dataDirectory}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="muted">
                            JSON
                            备份包含记录和附件引用；原始文件与题目图片请单独下载保存。暂不支持从备份恢复。
                          </p>
                        )}
                        <Button
                          variant="secondary"
                          onClick={backup}
                          disabled={localTransfer || (local && demo)}
                        >
                          {localTransfer ? <Busy /> : <Download size={16} />}
                          {local ? "导出完整备份" : "导出学习记录"}
                        </Button>
                        {local && (
                          <>
                            <input
                              ref={restoreInput}
                              type="file"
                              accept=".zip"
                              hidden
                              onChange={(e) => restore(e.target.files?.[0])}
                            />
                            <Button
                              className="restore-backup-btn"
                              variant="secondary"
                              disabled={localTransfer || demo}
                              onClick={() => restoreInput.current?.click()}
                            >
                              <Upload size={16} />
                              导入备份
                            </Button>
                          </>
                        )}
                      </div>
                    </section>
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>关于这个空间</h2>
                        <Badge tone="gray">
                          {phone ? window.__qyNativeApp ? "清研 App v1.4.0" : "iPhone 运行版 v1.0.1" : local ? "本地版 v2.0" : "v1.0"}
                        </Badge>
                      </div>
                      <div className="settings-content">
                        <p>
                          清研，陪你整理资料、复盘错题、专项练习和回看进步。
                        </p>
                        <div className="about-feature">
                          <ShieldCheck size={18} />
                          <span>
                            {local
                              ? "资料、题图与成绩均保存在本机，断网也可使用。"
                              : "专属链接免登录，记录与文件持续保存在你的空间。"}
                          </span>
                        </div>
                        <div className="about-feature">
                          <Files size={18} />
                          <span>{phone ? "支持导出 Word 到“文件”App，可在 WPS 或 Word 中打印。" : "支持 Word 导出与浏览器打印为 PDF。"}</span>
                        </div>
                        <div className="about-feature">
                          <NotebookPen size={18} />
                          <span>
                            题目支持手动录入与图片，不自动识别扫描件。
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setDemo(true);
                            setSelected([]);
                            nav("dashboard");
                          }}
                        >
                          进入示例工作台
                          <ChevronRight size={15} />
                        </Button>
                      </div>
                    </section>
                  </div>
                </>
              )}
            </>
          )}
          <footer className="app-footer">
            <span>
              {phone ? "清研手机版 · 记录存于此设备" : local ? "清研本地版 · 资料存于本机" : "清研 · 让复习更有条理"}
            </span>
            <span>
              积累有迹，进步可见 <Sprout size={13} />
            </span>
          </footer>
        </main>
      </div>
      {form && (
        <RecordForm
          key={`${form.kind}-${form.initial?.id || "new"}`}
          kind={form.kind}
          initial={form.initial}
          startCrop={form.startCrop}
          data={data}
          subjects={subjects}
          onClose={() => setForm(undefined)}
          onSave={save}
        />
      )}
      {confirm && (
        <Modal
          title="删除这条记录？"
          onClose={() => {
            if (!deleting) setConfirm(undefined);
          }}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={deleting}
                onClick={() => setConfirm(undefined)}
              >
                取消
              </Button>
              <Button variant="danger" disabled={deleting} onClick={remove}>
                {deleting && <Busy />}确认删除
              </Button>
            </>
          }
        >
          <p>将删除「{confirm.item.title}」，此操作无法撤销。</p>
          <p className="muted">已保存练习卷中的题目快照会保留。</p>
        </Modal>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? "toast-error" : ""}`}
          role="status"
        >
          {toast.error ? <AlertCircle size={18} /> : <CircleCheck size={18} />}
          <span>{toast.text}</span>
          <button
            className="icon-btn"
            aria-label="关闭提示"
            onClick={() => setToast(undefined)}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {exporting && (
        <div className="export-notice">
          <Busy />
          正在生成 Word 文档，请稍候…
        </div>
      )}
    </div>
  );
}
