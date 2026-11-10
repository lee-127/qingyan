"use client";
import { useState } from "react";
import { UploadCloud, FileCheck2, ScanLine, Crop, FolderOpen } from "lucide-react";
import { Button, Field, Select, Modal, Busy } from "./ui";
import {
  SUBJECTS,
  MATERIAL_TYPES,
  REASONS,
  dateISO,
  type StudyData,
  type Kind,
} from "@/lib/models";
import { api, assetUrl } from "@/lib/client";
import { nativeStudyTools, scanPDF } from "@/lib/study-tools";
import { ExerciseCrop } from "./exercise-crop";
import { AISolver } from "./ai-solver";
import { AnswerContent } from "./answer-content";
export function RecordForm({
  kind,
  initial,
  startCrop = false,
  data,
  subjects = SUBJECTS,
  onClose,
  onSave,
}: {
  kind: Kind;
  initial?: any;
  startCrop?: boolean;
  data: StudyData;
  subjects?: string[];
  onClose: () => void;
  onSave: (kind: Kind, value: any) => Promise<void>;
}) {
  const [value, setValue] = useState<any>(
    () => ({
      ...(kind === "material"
        ? {
            title: "",
            subject: subjects[0],
            type: "习题集",
            year: "",
            note: "",
          }
        : kind === "mistake"
          ? {
              title: "",
              subject: subjects[0],
              topic: "",
              reason: REASONS[0],
              status: "待复习",
              difficulty: "中等",
              question: "",
              answer: "",
              reflection: "",
              sourceId: "",
              source: "",
              tags: [],
            }
          : kind === "score"
            ? {
                title: "",
                subject: subjects[0],
                type: "模拟卷",
                score: "",
                total: 150,
                date: dateISO(),
                duration: 180,
                sourceId: "",
                note: "",
              }
            : kind === "folder" ? { title: "" } : { examDate: "", target: "", subjects }),
      ...initial,
    }),
  );
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [crop, setCrop] = useState<"exercise" | "image" | undefined>(startCrop ? "exercise" : undefined);
  const [cropImage, setCropImage] = useState<Blob>();
  const [error, setError] = useState("");
  const [previewAnswer, setPreviewAnswer] = useState(!!initial?.answer?.trim());
  const [tagsText, setTagsText] = useState(initial?.tags?.join(", ") || "");
  const [subjectText, setSubjectText] = useState(
    (initial?.subjects || subjects).join("，"),
  );
  const set = (key: string, v: any) =>
    setValue((old: any) => ({ ...old, [key]: v }));
  const select = (key: string, options: any[]) => (
    <Select
      value={value[key]}
      options={options}
      onChange={(e) => set(key, e.target.value)}
    />
  );
  const text = (key: string, required = false, placeholder = "") => (
    <input
      value={value[key]}
      required={required}
      maxLength={200}
      placeholder={placeholder}
      onChange={(e) => set(key, e.target.value)}
    />
  );
  const area = (key: string, placeholder = "", rows = 3) => (
    <textarea
      value={value[key]}
      placeholder={placeholder}
      rows={rows}
      maxLength={20000}
      onChange={(e) => set(key, e.target.value)}
    />
  );
  function chooseFile(f?: File) {
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) {
      setError("单个文件不能超过 20 MB");
      return;
    }
    if (kind === "mistake" && !/\.(png|jpe?g|webp)$/i.test(f.name)) {
      setError("题目图片支持 PNG、JPG、WebP");
      return;
    }
    setFile(f);
    setError("");
    if (kind === "material" && !value.title)
      set("title", f.name.replace(/\.[^.]+$/, ""));
  }
  async function scan() {
    setScanning(true);
    setError("");
    try {
      const result = await scanPDF();
      if (result) chooseFile(result);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setScanning(false);
    }
  }
  async function openImageCrop() {
    setError("");
    try {
      let blob: Blob | undefined = file;
      if (!blob && value.image) {
        const response = await fetch(assetUrl(value.image));
        if (!response.ok) throw new Error("无法读取题图");
        blob = await response.blob();
      }
      if (blob) {
        setCropImage(blob);
        setCrop("image");
      }
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      let next = { ...value };
      if (kind === "material" && next.type !== "习题集") delete next.folderId;
      if (kind === "mistake")
        next.tags = tagsText
          .split(/[,，]/)
          .map((x: string) => x.trim())
          .filter(Boolean)
          .slice(0, 20);
      if (kind === "settings") {
        next.subjects = [
          ...new Set(
            subjectText
              .split(/[,，]/)
              .map((x: string) => x.trim())
              .filter(Boolean),
          ),
        ];
        if (!next.subjects.length) throw new Error("请至少填写一个科目");
      }
      if (file) {
        const asset = await api.upload(file);
        next[kind === "material" ? "file" : "image"] = asset;
        setValue(next);
        setFile(undefined);
      }
      if (kind === "material" && !next.file)
        throw new Error("请先上传资料文件");
      if (kind === "mistake" && !next.question.trim() && !next.image)
        throw new Error("请填写题干或上传题目图片");
      if (kind === "score") {
        if (next.score === "") throw new Error("请填写得分");
        next.score = Number(next.score);
        next.total = Number(next.total);
        next.duration = Number(next.duration);
        if (next.score > next.total) throw new Error("得分不能超过满分");
      }
      await onSave(kind, next);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const label = {
    material: "资料",
    mistake: "错题",
    score: "成绩",
    settings: "复习设置",
    paper: "练习卷",
    folder: "习题集文件夹",
  }[kind];
  return (
    <Modal
      title={
        kind === "settings"
          ? "复习设置"
          : `${initial?.id ? "编辑" : "新增"}${label}`
      }
      subtitle={
        kind === "mistake"
          ? "把出错的原因留下，让下一次练习更有方向。"
          : kind === "material"
            ? "上传原文件，建立自己的复习资料库。"
            : kind === "score"
              ? "记录一次练习，看见每一小步进步。"
              : kind === "settings" ? "考试日期由你自行设定，可随时调整。" : undefined
      }
      onClose={() => {
        if (!busy && !scanning) onClose();
      }}
      wide={kind === "mistake"}
      footer={
        <>
          <Button variant="secondary" disabled={busy || scanning} onClick={onClose}>
            取消
          </Button>
          <Button type="submit" form="record-form" disabled={busy || scanning}>
            {busy && <Busy />}
            {busy ? "正在保存…" : "保存"}
          </Button>
        </>
      }
    >
      <form id="record-form" onSubmit={submit} className="form-grid">
        {error && (
          <div className="form-error wide" role="alert">
            {error}
          </div>
        )}
        {kind !== "settings" && (
          <>
            <Field label={`${label}名称 *`} wide>
              {text(
                "title",
                true,
                kind === "mistake"
                  ? "例如：泰勒展开求极限"
                  : "给这条记录起个名字",
              )}
            </Field>
            {kind !== "folder" && (
              <Field label="科目 *">
                {select("subject", [...new Set([...subjects, value.subject])])}
              </Field>
            )}
          </>
        )}
        {kind === "material" && (
          <>
            <Field label="资料类型 *">{select("type", MATERIAL_TYPES)}</Field>
            {value.type === "习题集" && (
              <Field label="习题集文件夹" wide>
                <Select value={value.folderId || ""} options={[
                  { value: "", label: "未归入文件夹" },
                  ...(data.folder || []).map(folder => ({ value: folder.id, label: folder.title })),
                ]} onChange={event => set("folderId", event.target.value)} />
              </Field>
            )}
            <Field label="年份（可选）">
              {text("year", false, "例如：2025")}
            </Field>
            <Field label="备注" wide>
              {area("note", "资料内容、章节或使用计划")}
            </Field>
          </>
        )}
        {kind === "mistake" && (
          <>
            <Field label="知识点 *">
              {text("topic", true, "例如：高等数学 · 极限")}
            </Field>
            <Field label="错因 *">{select("reason", REASONS)}</Field>
            <Field label="难度">
              {select("difficulty", ["基础", "中等", "进阶"])}
            </Field>
            <Field label="掌握程度">
              {select("status", ["待复习", "巩固中", "已掌握"])}
            </Field>
            <Field label="关联资料">
              {" "}
              <Select
                value={value.sourceId}
                options={[
                  { value: "", label: "不关联资料" },
                  ...data.material.map((m) => ({
                    value: m.id,
                    label: m.title,
                  })),
                ]}
                onChange={(e) => {
                  const m = data.material.find((x) => x.id === e.target.value);
                  setValue((old: any) => ({ ...old, sourceId: e.target.value, source: m?.title || "", sourcePage: undefined }));
                }}
              />
            </Field>
            <Field label="来源说明">
              {text("source", false, "例如：第 3 章 · 第 12 题")}
            </Field>
            <div className="wide study-actions">
              <Button type="button" variant="secondary" onClick={() => setCrop(crop === "exercise" ? undefined : "exercise")}>
                <FolderOpen size={16} />从习题集中框选
              </Button>
              {(file || value.image) && (
                <Button type="button" variant="secondary" onClick={() => void openImageCrop()}><Crop size={16} />裁剪题图</Button>
              )}
            </div>
            {crop && (
              <div className="wide">
                <ExerciseCrop key={crop} data={data}
                  initial={data.material.find(item => item.id === value.sourceId)}
                  upload={crop === "image" ? cropImage : undefined}
                  onClose={() => setCrop(undefined)}
                  onUse={(cropped, source, page) => {
                    chooseFile(cropped);
                    if (source) setValue((old: any) => ({
                      ...old,
                      title: old.title || (page ? `${source.title} · 第 ${page} 页` : source.title).slice(0, 200),
                      subject: source.subject,
                      sourceId: source.id,
                      sourcePage: page,
                      source: (page ? `${source.title} · 第 ${page} 页` : source.title).slice(0, 200),
                    }));
                    setCrop(undefined);
                    setCropImage(undefined);
                  }} />
              </div>
            )}
            <Field label="题干（文字与图片至少填写一项）" wide>
              {area(
                "question",
                "可以直接粘贴题干，数学公式支持纯文本与 Unicode 符号。",
                4,
              )}
            </Field>
            <div className="wide answer-editor">
              {value.answer?.trim() && (
                <div className="study-tool-heading">
                  <span>{previewAnswer ? "参考答案 / 解析" : "编辑解析原文"}</span>
                  <Button type="button" variant="ghost" onClick={() => setPreviewAnswer(!previewAnswer)}>
                    {previewAnswer ? "编辑原文" : "预览排版"}
                  </Button>
                </div>
              )}
              {previewAnswer && value.answer?.trim() ? (
                <div className="ai-answer"><AnswerContent answer={value.answer} /></div>
              ) : (
                <Field label="参考答案 / 解析" wide>
                  {area("answer", "写下正确解法，组卷时可附在文末。", 4)}
                </Field>
              )}
            </div>
            {nativeStudyTools() && (
              <div className="wide">
                <AISolver question={value.question || ""} image={file || value.image} onUse={answer => {
                  set("answer", answer);
                  setPreviewAnswer(true);
                }} />
              </div>
            )}
            <Field label="错因复盘" wide>
              {area("reflection", "哪里出错？下次应该如何判断？")}
            </Field>
            <Field label="标签" wide hint="多个标签用中文或英文逗号分隔。">
              <input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="如：泰勒公式, 高频考点"
              />
            </Field>
          </>
        )}
        {(kind === "material" || kind === "mistake") && (
          <div className="wide">
            {kind === "material" && nativeStudyTools() && (
              <Button type="button" className="scan-button" variant="secondary" disabled={scanning || busy} onClick={() => void scan()}>
                {scanning ? <Busy /> : <ScanLine size={17} />}{scanning ? "正在扫描…" : "智能扫描 PDF"}
              </Button>
            )}
            <label
              className="upload-zone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                chooseFile(e.dataTransfer.files[0]);
              }}
            >
              <input
                type="file"
                accept={
                  kind === "material"
                    ? ".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.zip"
                    : ".png,.jpg,.jpeg,.webp"
                }
                onChange={(e) => chooseFile(e.target.files?.[0])}
              />
              {file || value.file || value.image ? (
                <FileCheck2 size={28} />
              ) : (
                <UploadCloud size={28} />
              )}
              <strong>
                {file?.name ||
                  value.file?.name ||
                  value.image?.name ||
                  `点击或拖拽上传${kind === "material" ? "资料" : "题目图片"}`}
              </strong>
              <span>
                {kind === "material"
                  ? "PDF、Word、文本、图片、ZIP"
                  : "PNG、JPG、WebP，可选"}{" "}
                · 单个文件不超过 20 MB
              </span>
            </label>
            {kind === "mistake" && (file || value.image) && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setFile(undefined);
                  set("image", undefined);
                }}
              >
                移除题图
              </Button>
            )}
          </div>
        )}
        {kind === "score" && (
          <>
            <Field label="试卷类型 *">
              {select("type", ["模拟卷", "真题卷"])}
            </Field>
            <Field label="得分 *">
              <input
                type="number"
                min="0"
                max={value.total}
                step="0.5"
                required
                value={value.score}
                onChange={(e) => set("score", e.target.value)}
              />
            </Field>
            <Field label="满分 *">
              <input
                type="number"
                min="1"
                max="1000"
                required
                value={value.total}
                onChange={(e) => set("total", e.target.value)}
              />
            </Field>
            <Field label="考试日期 *">
              <input
                type="date"
                required
                value={value.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </Field>
            <Field label="用时（分钟）">
              <input
                type="number"
                min="0"
                max="1440"
                step="1"
                value={value.duration}
                onChange={(e) => set("duration", e.target.value)}
              />
            </Field>
            <Field label="关联试卷资料" wide>
              <Select
                value={value.sourceId}
                options={[
                  { value: "", label: "不关联资料" },
                  ...data.material
                    .filter((m) => m.type === "真题卷" || m.type === "模拟卷")
                    .map((m) => ({ value: m.id, label: m.title })),
                ]}
                onChange={(e) => {
                  const m = data.material.find((x) => x.id === e.target.value);
                  setValue({
                    ...value,
                    sourceId: e.target.value,
                    ...(m
                      ? { title: m.title, subject: m.subject, type: m.type }
                      : {}),
                  });
                }}
              />
            </Field>
            <Field label="复盘备注" wide>
              {area("note", "例如：选择题用时偏长，下一次先完成基础题。")}
            </Field>
          </>
        )}
        {kind === "settings" && (
          <>
            <Field label="备考目标" wide>
              {text("target", false, "例如：2027 考研 · 全力以赴")}
            </Field>
            <Field
              label="目标考试日期（可选）"
              wide
              hint="用于显示倒计时，请以官方公布的日期为准。"
            >
              <input
                type="date"
                value={value.examDate}
                onChange={(e) => set("examDate", e.target.value)}
              />
            </Field>
            <Field
              label="科目设置"
              wide
              hint="用中文或英文逗号分隔，至少保留一个科目。"
            >
              <input
                required
                value={subjectText}
                onChange={(e) => setSubjectText(e.target.value)}
              />
            </Field>
          </>
        )}
      </form>
    </Modal>
  );
}
