"use client";
import { useState } from "react";
import {
  Search,
  Plus,
  Check,
  ArrowRight,
  Pencil,
  Trash2,
  Bookmark,
  ImageIcon,
} from "lucide-react";
import { Button, Badge, Empty, Select, Modal } from "./ui";
import {
  REASONS,
  type StudyData,
  type Entry,
  type Mistake,
} from "@/lib/models";
import { assetUrl } from "@/lib/client";
import { AnswerContent } from "./answer-content";
import { MistakeVariant } from "./mistake-variant";
import { nativeStudyTools } from "@/lib/study-tools";
export function Mistakes({
  data,
  subjects,
  selected,
  setSelected,
  onAdd,
  onEdit,
  onDelete,
  onStatus,
  onBuild,
}: {
  data: StudyData;
  subjects: string[];
  selected: string[];
  setSelected: (v: string[]) => void;
  onAdd: () => void;
  onEdit: (m: Entry<Mistake>) => void;
  onDelete: (m: Entry<Mistake>) => void;
  onStatus: (m: Entry<Mistake>, s: string) => void;
  onBuild: () => void;
}) {
  const [subject, setSubject] = useState("全部科目"),
    [reason, setReason] = useState("全部错因"),
    [status, setStatus] = useState("全部状态"),
    [topic, setTopic] = useState("全部知识点"),
    [query, setQuery] = useState(""),
    [detail, setDetail] = useState<Entry<Mistake>>();
  const rows = data.mistake.filter(
    (m) =>
      (subject === "全部科目" || m.subject === subject) &&
      (reason === "全部错因" || m.reason === reason) &&
      (status === "全部状态" || m.status === status) &&
      (topic === "全部知识点" || m.topic === topic) &&
      `${m.title} ${m.question} ${m.topic} ${m.tags.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const toggle = (id: string) =>
    setSelected(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  const all = rows.length > 0 && rows.every((x) => selected.includes(x.id));
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">LEARN FROM MISTAKES</span>
          <h1>
            错题本<span className="heading-count">{data.mistake.length}</span>
          </h1>
          <p>每一道错题，都是下一次进步的起点。</p>
        </div>
        <Button onClick={onAdd}>
          <Plus size={17} />
          录入错题
        </Button>
      </div>
      <div className="mistake-summary">
        {["待复习", "巩固中", "已掌握"].map((s, i) => (
          <button
            key={s}
            className={status === s ? "selected" : ""}
            onClick={() => setStatus(status === s ? "全部状态" : s)}
          >
            <span className={`dot dot-${i}`} />
            {s}
            <strong>{data.mistake.filter((m) => m.status === s).length}</strong>
          </button>
        ))}
        <span className="muted">按知识点与错因，建立自己的提分地图</span>
      </div>
      <div className="filter-bar">
        <label className="search">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索题目、知识点或标签"
            aria-label="搜索错题"
          />
        </label>
        <Select
          options={["全部科目", ...subjects]}
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            setTopic("全部知识点");
          }}
        />
        <Select
          options={[
            "全部知识点",
            ...new Set(
              data.mistake
                .filter((m) => subject === "全部科目" || m.subject === subject)
                .map((m) => m.topic),
            ),
          ]}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <Select
          options={["全部错因", ...REASONS]}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Select
          options={["全部状态", "待复习", "巩固中", "已掌握"]}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        />
      </div>
      <div className="list-count">
        <label>
          <input
            type="checkbox"
            checked={all}
            onChange={() =>
              setSelected(
                all
                  ? selected.filter((id) => !rows.some((r) => r.id === id))
                  : [...new Set([...selected, ...rows.map((r) => r.id)])],
              )
            }
          />
          全选当前结果
        </label>
        <span>共 {rows.length} 道错题</span>
      </div>
      {rows.length ? (
        <div className="mistake-grid">
          {rows.map((m) => (
            <article
              key={m.id}
              className={`mistake-card ${selected.includes(m.id) ? "is-selected" : ""}`}
            >
              <div className="mistake-top">
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(m.id)}
                    onChange={() => toggle(m.id)}
                    aria-label={`选择${m.title}`}
                  />
                  <Badge tone="gray">{m.subject}</Badge>
                </label>
                <Badge
                  tone={
                    m.status === "已掌握"
                      ? "green"
                      : m.status === "待复习"
                        ? "orange"
                        : "blue"
                  }
                >
                  {m.status}
                </Badge>
              </div>
              <button className="question-open" onClick={() => setDetail(m)}>
                <span className="topic">{m.topic}</span>
                <h3>{m.title}</h3>
                <p>
                  {m.question || (
                    <>
                      <ImageIcon size={14} /> 图片题目，点击查看
                    </>
                  )}
                </p>
              </button>
              <div className="tag-row">
                <Badge tone="orange">{m.reason}</Badge>
                <span>{m.difficulty}</span>
                {m.tags.slice(0, 2).map((t) => (
                  <span key={t}>#{t}</span>
                ))}
              </div>
              <div className="mistake-bottom">
                <span>{m.source || "未标注来源"}</span>
                <div className="row-actions">
                  <button
                    className="icon-btn"
                    aria-label={`编辑${m.title}`}
                    title="编辑"
                    onClick={() => onEdit(m)}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="icon-btn danger-text"
                    aria-label={`删除${m.title}`}
                    title="删除"
                    onClick={() => onDelete(m)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel">
          <Empty
            title={
              data.mistake.length
                ? "没有符合条件的错题"
                : "把第一道错题，变成下一次的得分"
            }
            description={
              data.mistake.length
                ? "调整筛选条件，或搜索其他关键词。"
                : "录入题干或上传题目图片，记录知识点与错因。"
            }
            action={
              !data.mistake.length && (
                <Button onClick={onAdd}>
                  <Plus size={16} />
                  录入第一道错题
                </Button>
              )
            }
          />
        </div>
      )}
      {selected.length > 0 && (
        <div className="selection-bar">
          <span>
            <Check size={18} />
            已选 <strong>{selected.length}</strong> 道错题
          </span>
          <button onClick={() => setSelected([])}>清空选择</button>
          <Button onClick={onBuild}>
            去组卷
            <ArrowRight size={16} />
          </Button>
        </div>
      )}
      {detail && (
        <Modal
          wide
          title={detail.title}
          subtitle={detail.topic}
          onClose={() => setDetail(undefined)}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  onEdit(detail);
                  setDetail(undefined);
                }}
              >
                编辑错题
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  toggle(detail.id);
                }}
              >
                {selected.includes(detail.id) ? "移出组卷" : "加入组卷"}
              </Button>
              <Button
                onClick={() => {
                  const s = detail.status === "已掌握" ? "待复习" : "已掌握";
                  onStatus(detail, s);
                  setDetail(undefined);
                }}
              >
                <Check size={16} />
                {detail.status === "已掌握" ? "重新复习" : "标记已掌握"}
              </Button>
            </>
          }
        >
          <div className="detail-meta">
            <Badge>{detail.subject}</Badge>
            <Badge tone="orange">{detail.reason}</Badge>
            <Badge tone="gray">{detail.difficulty}</Badge>
          </div>
          <h4>题目</h4>
          <p className="pre-wrap">{detail.question}</p>
          {detail.image && (
            <img
              className="question-image"
              src={assetUrl(detail.image)}
              alt="错题题干"
            />
          )}
          <details className="answer-details">
            <summary>查看参考答案与解析</summary>
            <AnswerContent answer={detail.answer || "尚未填写答案"} />
          </details>
          <h4>错因复盘</h4>
          <p className="pre-wrap muted">
            {detail.reflection || "尚未填写复盘"}
          </p>
          <small className="muted">来源：{detail.source || "未标注"}</small>
          {nativeStudyTools() && <MistakeVariant key={detail.id} mistake={detail} />}
        </Modal>
      )}
    </>
  );
}
