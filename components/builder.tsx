"use client";
import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Plus,
  X,
  Download,
  Printer,
  FileText,
  Save,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { Button, Badge, Empty, Field, Select, Modal, Busy } from "./ui";
import { assetUrl } from "@/lib/client";
import { AnswerContent } from "./answer-content";
import type { Entry, Paper, StudyData } from "@/lib/models";
export function PaperPreview({
  paper,
  onClose,
  onExport,
}: {
  paper: Paper;
  onClose: () => void;
  onExport: (p: Paper) => void;
}) {
  return (
    <Modal
      wide
      title="练习卷预览"
      subtitle={typeof window !== "undefined" && window.__qingyanMobile ? "可导出 Word 到“文件”App，在 WPS 或 Word 中练习和打印。" : "打印时仅输出练习卷，可在打印对话框中另存为 PDF。"}
      onClose={onClose}
      footer={
        <>
          {!(typeof window !== "undefined" && window.__qingyanMobile) && <Button variant="secondary" onClick={() => window.print()}>
            <Printer size={16} />
            打印 / PDF
          </Button>}
          <Button onClick={() => onExport(paper)}>
            <Download size={16} />
            导出 Word
          </Button>
        </>
      }
    >
      <div className="print-paper" id="print-paper">
        <div className="paper-header">
          <span>清研 · 专项练习</span>
          <h1>{paper.title}</h1>
          <p>
            共 {paper.questions.length} 题 · 满分{" "}
            {paper.points.reduce((a, b) => a + b, 0)} 分
          </p>
          <p className="student-line">
            姓名：____________　 日期：____________　 得分：____________
          </p>
          {paper.note && <p>{paper.note}</p>}
        </div>
        {paper.questions.map((q, i) => (
          <section key={i} className="print-question">
            <h3>
              {i + 1}. {q.title} <small>（{paper.points[i]} 分）</small>
            </h3>
            <p className="pre-wrap">{q.question}</p>
            {q.image && (
              <img src={assetUrl(q.image)} alt={`第 ${i + 1} 题题目图片`} />
            )}
            <div
              className="answer-space"
              style={{ height: paper.space * 24 }}
            />
          </section>
        ))}
        {paper.includeAnswers && (
          <section className="paper-answers">
            <h2>参考答案与解析</h2>
            {paper.questions.map((q, i) => (
              <div key={i}>
                <h3>
                  {i + 1}. {q.title}
                </h3>
                <AnswerContent answer={q.answer || "未填写参考答案"} />
                {q.reflection && (
                  <p className="pre-wrap">复盘：{q.reflection}</p>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
    </Modal>
  );
}
export function Builder({
  data,
  selected,
  setSelected,
  onPick,
  onSave,
  onExport,
  onDelete,
}: {
  data: StudyData;
  selected: string[];
  setSelected: (v: string[]) => void;
  onPick: () => void;
  onSave: (paper: Paper) => Promise<void>;
  onExport: (paper: Paper) => void;
  onDelete: (paper: Entry<Paper>) => void;
}) {
  const [title, setTitle] = useState("我的错题专项练习"),
    [space, setSpace] = useState(5),
    [answers, setAnswers] = useState(false),
    [points, setPoints] = useState<Record<string, number>>({}),
    [note, setNote] = useState(""),
    [preview, setPreview] = useState<Paper>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const questions = selected
    .map((id) => data.mistake.find((m) => m.id === id))
    .filter((x): x is NonNullable<typeof x> => !!x);
  const paper: Paper = {
    title: title.trim(),
    questionIds: questions.map((q) => q.id),
    questions: questions.map(({ id, createdAt, updatedAt, ...q }) => q),
    points: questions.map((q) => points[q.id] ?? 10),
    space,
    includeAnswers: answers,
    note,
  };
  const move = (i: number, d: number) => {
    const ids = [...selected];
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    setSelected(ids);
  };
  async function save() {
    if (!paper.title) {
      setError("请填写练习卷名称");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave(paper);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MAKE PRACTICE PERSONAL</span>
          <h1>错题组卷</h1>
          <p>把薄弱点组合成一份练习，练到真正掌握。</p>
        </div>
        <Button variant="secondary" onClick={onPick}>
          <Plus size={17} />
          从错题本选题
        </Button>
      </div>
      <div className="builder-layout">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                已选题目 <span className="count">{questions.length}</span>
              </h2>
              <p>通过上下箭头调整题目顺序</p>
            </div>
            {questions.length > 0 && (
              <button className="text-btn" onClick={() => setSelected([])}>
                清空
              </button>
            )}
          </div>
          {questions.length ? (
            <div className="selected-list">
              {questions.map((q, i) => (
                <div className="selected-question" key={q.id}>
                  <span className="question-index">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="selected-content">
                    <Badge tone="gray">{q.subject}</Badge>
                    <h3>{q.title}</h3>
                    <p>
                      {q.topic} · {q.reason}
                    </p>
                  </div>
                  <label className="points-input">
                    <input
                      type="number"
                      min="0"
                      max="1000"
                      step="0.5"
                      aria-label={`第${i + 1}题分值`}
                      value={points[q.id] ?? 10}
                      onChange={(e) =>
                        setPoints({
                          ...points,
                          [q.id]: Math.min(
                            1000,
                            Math.max(0, Number(e.target.value)),
                          ),
                        })
                      }
                    />
                    分
                  </label>
                  <div className="reorder">
                    <button
                      className="icon-btn"
                      disabled={i === 0}
                      aria-label={`上移第${i + 1}题`}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      className="icon-btn"
                      disabled={i === questions.length - 1}
                      aria-label={`下移第${i + 1}题`}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown size={15} />
                    </button>
                  </div>
                  <button
                    className="icon-btn"
                    aria-label={`移除${q.title}`}
                    onClick={() =>
                      setSelected(selected.filter((id) => id !== q.id))
                    }
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="一份好练习，从选题开始"
              description="可以跨知识点、跨科目自由组合错题。"
              action={
                <Button onClick={onPick}>
                  <Plus size={16} />
                  去错题本选题
                </Button>
              }
            />
          )}
        </div>
        <aside className="panel builder-settings">
          <div className="panel-heading">
            <h2>练习卷设置</h2>
            <FileText size={18} />
          </div>
          <div className="settings-fields">
            <Field label="练习卷名称 *">
              <input
                value={title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label="每题答题留白">
              <Select
                value={String(space)}
                options={[0, 3, 5, 8, 12].map((n) => ({
                  value: String(n),
                  label: n ? `${n} 行` : "不留白",
                }))}
                onChange={(e) => setSpace(Number(e.target.value))}
              />
            </Field>
            <Field label="卷首说明">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="例如：限时 60 分钟，独立完成"
              />
            </Field>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={answers}
                onChange={(e) => setAnswers(e.target.checked)}
              />
              <span>
                在文末附上参考答案<small>答案与题目分页，方便自测</small>
              </span>
            </label>
            <div className="paper-total">
              <span>{questions.length} 道题目</span>
              <strong>
                {paper.points.reduce((a, b) => a + b, 0)} <small>分</small>
              </strong>
            </div>
            {error && <p className="form-error">{error}</p>}
            <Button
              disabled={!questions.length || !title.trim()}
              onClick={() => setPreview(paper)}
            >
              <FileText size={16} />
              预览与导出
            </Button>
            <Button
              variant="secondary"
              disabled={!questions.length || busy}
              onClick={save}
            >
              {busy ? <Busy /> : <Save size={16} />}保存练习卷
            </Button>
            <p className="settings-hint">
              保存时会保留题目快照，之后编辑或删除错题不会改变已保存的练习卷。
            </p>
          </div>
        </aside>
      </div>
      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>已保存的练习卷</h2>
            <p>随时回来，检验是否真正学会</p>
          </div>
        </div>
        {data.paper.length ? (
          <div className="saved-papers">
            {data.paper.map((p) => (
              <div key={p.id}>
                <span className="file-icon">
                  <FileText size={22} />
                </span>
                <div>
                  <strong>{p.title}</strong>
                  <small>
                    {p.questions.length} 道题 ·{" "}
                    {p.points.reduce((a, b) => a + b, 0)} 分 ·{" "}
                    {p.createdAt.slice(0, 10)}
                  </small>
                </div>
                <button className="text-btn" onClick={() => setPreview(p)}>
                  预览
                </button>
                <button
                  className="icon-btn"
                  aria-label={`导出${p.title}`}
                  title="导出 Word"
                  onClick={() => onExport(p)}
                >
                  <Download size={16} />
                </button>
                <button
                  className="icon-btn danger-text"
                  aria-label={`删除${p.title}`}
                  title="删除"
                  onClick={() => onDelete(p)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="还没有保存的练习卷"
            description="选好题目后保存，下次可以直接重新导出。"
          />
        )}
      </div>
      {preview && (
        <PaperPreview
          paper={preview}
          onClose={() => setPreview(undefined)}
          onExport={onExport}
        />
      )}
    </>
  );
}
