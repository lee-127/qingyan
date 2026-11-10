"use client";
import { useState } from "react";
import {
  Search,
  Plus,
  FileText,
  ArrowUpRight,
  MoreHorizontal,
  Download,
  Pencil,
  Trash2,
  BookOpen,
  StickyNote,
  Layers3,
  Folder,
  FolderPlus,
  Crop,
} from "lucide-react";
import { Button, Badge, Empty, Select, Modal } from "./ui";
import { assetUrl } from "@/lib/client";
import {
  MATERIAL_TYPES,
  type StudyData,
  type Entry,
  type Material,
  type ExerciseFolder,
} from "@/lib/models";
import { nativeStudyTools } from "@/lib/study-tools";
export function Library({
  data,
  subjects,
  onAdd,
  onEdit,
  onDelete,
  onFolder,
  onCrop,
}: {
  data: StudyData;
  subjects: string[];
  onAdd: (folderId?: string) => void;
  onEdit: (m: Entry<Material>) => void;
  onDelete: (m: Entry<Material>) => void;
  onFolder: (folder?: Entry<ExerciseFolder>) => void;
  onCrop: (m: Entry<Material>) => void;
}) {
  const [type, setType] = useState("全部资料"),
    [subject, setSubject] = useState("全部科目"),
    [query, setQuery] = useState(""),
    [detail, setDetail] = useState<Entry<Material>>();
  const [folderId, setFolderId] = useState("");
  const folders = data.folder || [];
  const folder = folders.find(item => item.id === folderId);
  const canCrop = (item: Material) => item.type === "习题集" &&
    (item.file.mime.startsWith("image/") || (item.file.mime === "application/pdf" && nativeStudyTools()));
  function selectType(next: string) {
    setType(next);
    setFolderId("");
  }
  const rows = data.material.filter(
    (m) =>
      (type === "全部资料" || m.type === type) &&
      (!folder || m.folderId === folder.id) &&
      (subject === "全部科目" || m.subject === subject) &&
      `${m.title} ${m.note} ${m.year}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MY LIBRARY</span>
          <h1>
            资料库<span className="heading-count">{data.material.length}</span>
          </h1>
          <p>让资料各归其位，让复习有迹可循。</p>
        </div>
        <Button onClick={() => onAdd(folder?.id)}>
          <Plus size={17} />
          {nativeStudyTools() ? "上传 / 扫描资料" : "上传资料"}
        </Button>
      </div>
      <div className="type-tiles">
        {MATERIAL_TYPES.map((t, i) => {
          const Icon = [BookOpen, StickyNote, FileText, Layers3][i];
          return (
            <button
              key={t}
              className={`type-tile ${type === t ? "selected" : ""}`}
              onClick={() => selectType(type === t ? "全部资料" : t)}
            >
              <span className={`tile-icon color-${i}`}>
                <Icon size={21} />
              </span>
              <div>
                <span>{t}</span>
                <strong>
                  {data.material.filter((m) => m.type === t).length}
                  <small>份资料</small>
                </strong>
              </div>
              <ArrowUpRight size={17} />
            </button>
          );
        })}
      </div>
      {(type === "全部资料" || type === "习题集") && (
        <section className="panel exercise-folders">
          <div className="study-tool-heading">
            <h2>习题集文件夹</h2>
            <Button variant="secondary" onClick={() => onFolder()}><FolderPlus size={17} />新建文件夹</Button>
          </div>
          {folders.length ? (
            <div className="exercise-folder-grid">
              {folders.map(item => (
                <div key={item.id} className={`exercise-folder ${folder?.id === item.id ? "selected" : ""}`}>
                  <button type="button" aria-pressed={folder?.id === item.id} onClick={() => {
                    setType("习题集");
                    setFolderId(folder?.id === item.id ? "" : item.id);
                  }}>
                    <Folder size={21} />
                    <span><strong>{item.title}</strong><small>{data.material.filter(m => m.type === "习题集" && m.folderId === item.id).length} 份练习</small></span>
                  </button>
                  <button type="button" className="icon-btn" aria-label={`重命名 ${item.title}`} onClick={() => onFolder(item)}><Pencil size={15} /></button>
                </div>
              ))}
            </div>
          ) : <p className="muted">新建一个文件夹，再把同一习题集的练习归入其中。</p>}
        </section>
      )}
      <div className="panel">
        {folder && <div className="folder-context">
          <Folder size={18} /><strong>{folder.title}</strong>
          <Button variant="ghost" onClick={() => setFolderId("")}>查看全部习题集</Button>
        </div>}
        <div className="toolbar">
          <div className="tabs">
            {["全部资料", ...MATERIAL_TYPES].map((t) => (
              <button
                className={type === t ? "active" : ""}
                onClick={() => selectType(t)}
                key={t}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="toolbar-right">
            <Select
              options={["全部科目", ...subjects]}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <label className="search">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索资料名称、备注"
                aria-label="搜索资料"
              />
            </label>
          </div>
        </div>
        {rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>资料名称</th>
                  <th>科目</th>
                  <th>类型</th>
                  <th>年份</th>
                  <th>上传日期</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <button
                        className="file-title"
                        onClick={() => setDetail(m)}
                      >
                        <span className="file-icon">
                          <FileText size={22} />
                        </span>
                        <span>
                          <strong>{m.title}</strong>
                          <small>
                            {m.file.name} ·{" "}
                            {(m.file.size / 1024 / 1024).toFixed(2)} MB
                          </small>
                        </span>
                      </button>
                    </td>
                    <td>{m.subject}</td>
                    <td>
                      <Badge
                        tone={
                          m.type === "真题卷"
                            ? "green"
                            : m.type === "模拟卷"
                              ? "orange"
                              : "gray"
                        }
                      >
                        {m.type}
                      </Badge>
                    </td>
                    <td>{m.year || "—"}</td>
                    <td className="muted">{m.createdAt.slice(0, 10)}</td>
                    <td>
                      <div className="row-actions">
                        {canCrop(m) && <button className="icon-btn" title="框选错题" aria-label={`从 ${m.title} 框选错题`} onClick={() => onCrop(m)}><Crop size={16} /></button>}
                        <a
                          className="icon-btn"
                          title="下载原文件"
                          aria-label={`下载${m.title}`}
                          href={`${assetUrl(m.file)}?download`}
                        >
                          <Download size={16} />
                        </a>
                        <button
                          className="icon-btn"
                          title="编辑"
                          aria-label={`编辑${m.title}`}
                          onClick={() => onEdit(m)}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-btn danger-text"
                          title="删除"
                          aria-label={`删除${m.title}`}
                          onClick={() => onDelete(m)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              data.material.length
                ? "没有找到相关资料"
                : "建好资料库，复习更从容"
            }
            description={
              data.material.length
                ? "试试其他分类或关键词。"
                : "上传你的第一份习题集、笔记或试卷。"
            }
            action={
              (!data.material.length || folder) && (
                <Button onClick={() => onAdd(folder?.id)}>
                  <Plus size={16} />
                  {folder ? "在此文件夹添加练习" : "上传第一份资料"}
                </Button>
              )
            }
          />
        )}
      </div>
      {detail && (
        <Modal
          title={detail.title}
          onClose={() => setDetail(undefined)}
          footer={
            <>
              {canCrop(detail) && <Button variant="secondary" onClick={() => { onCrop(detail); setDetail(undefined); }}>
                <Crop size={16} />框选错题
              </Button>}
              <Button
                variant="secondary"
                onClick={() => {
                  onEdit(detail);
                  setDetail(undefined);
                }}
              >
                编辑资料
              </Button>
              <a
                className="btn primary"
                href={assetUrl(detail.file)}
                target="_blank"
                rel="noreferrer"
              >
                打开原文件
                <ArrowUpRight size={16} />
              </a>
            </>
          }
        >
          <div className="detail-meta">
            <Badge>{detail.subject}</Badge>
            <Badge tone="gray">{detail.type}</Badge>
            <span>{detail.year}</span>
          </div>
          <p className="pre-wrap">{detail.note || "暂无备注"}</p>
          <div className="subtle-box">
            文件：{detail.file.name}
            <br />
            关联错题：
            {data.mistake.filter((m) => m.sourceId === detail.id).length} 道
          </div>
        </Modal>
      )}
    </>
  );
}
