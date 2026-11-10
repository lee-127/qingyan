"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Crop } from "lucide-react";
import { assetUrl } from "@/lib/client";
import type { Entry, Material, StudyData } from "@/lib/models";
import { nativeStudyTools, renderPDFPage } from "@/lib/study-tools";
import { Busy, Button, Field, Select } from "./ui";

type Point = { x: number; y: number };
type Rect = { left: number; top: number; right: number; bottom: number };
type Corner = "tl" | "tr" | "bl" | "br";
const full: Rect = { left: 0, top: 0, right: 1, bottom: 1 };
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const minSide = 0.015;

export function CropFrame({ source, onUse }: { source: Blob; onUse: (file: File) => void }) {
  const [url, setURL] = useState("");
  const [rect, setRect] = useState(full);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const image = useRef<HTMLImageElement>(null);
  const drag = useRef<{ id: number; origin: Point; initial: Rect; corner?: Corner } | null>(null);
  useEffect(() => {
    const next = URL.createObjectURL(source);
    setURL(next);
    return () => URL.revokeObjectURL(next);
  }, [source]);

  function point(event: PointerEvent): Point {
    const bounds = image.current!.getBoundingClientRect();
    return { x: clamp((event.clientX - bounds.left) / bounds.width), y: clamp((event.clientY - bounds.top) / bounds.height) };
  }
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (!ready || saving || drag.current || event.button !== 0) return;
    event.preventDefault();
    const corner = (event.target as HTMLElement).dataset.corner as Corner | undefined;
    drag.current = { id: event.pointerId, origin: point(event), initial: rect, corner };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function resize(initial: Rect, corner: Corner, at: Point): Rect {
    return {
      left: corner.endsWith("l") ? clamp(at.x, 0, initial.right - minSide) : initial.left,
      top: corner.startsWith("t") ? clamp(at.y, 0, initial.bottom - minSide) : initial.top,
      right: corner.endsWith("r") ? clamp(at.x, initial.left + minSide) : initial.right,
      bottom: corner.startsWith("b") ? clamp(at.y, initial.top + minSide) : initial.bottom,
    };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    const at = point(event);
    if (active.corner) {
      setRect(resize(active.initial, active.corner, at));
    } else if (Math.abs(at.x - active.origin.x) >= minSide && Math.abs(at.y - active.origin.y) >= minSide) {
      setRect({ left: Math.min(at.x, active.origin.x), right: Math.max(at.x, active.origin.x),
        top: Math.min(at.y, active.origin.y), bottom: Math.max(at.y, active.origin.y) });
    }
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== event.pointerId) return;
    if (event.type === "pointercancel") setRect(drag.current.initial);
    drag.current = null;
  }
  async function useCrop() {
    const img = image.current;
    if (!img?.naturalWidth) return;
    setSaving(true);
    setError("");
    try {
      const left = Math.floor(rect.left * img.naturalWidth), top = Math.floor(rect.top * img.naturalHeight);
      const width = Math.ceil(rect.right * img.naturalWidth) - left;
      const height = Math.ceil(rect.bottom * img.naturalHeight) - top;
      const scale = Math.min(1, 2400 / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("无法裁剪图片");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, left, top, width, height, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.92));
      if (!blob) throw new Error("无法保存裁剪后的题图");
      onUse(new File([blob], "错题框选.jpg", { type: "image/jpeg" }));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="crop-preview">
      <small className="muted">在预览上拖出题目范围，也可以拖动四角微调。</small>
      {url && (
        <div className="crop-stage" style={ready && image.current ? { width: `min(100%, ${62 * image.current.naturalWidth / image.current.naturalHeight}svh)` } : undefined}
          onPointerDown={begin} onPointerMove={move}
          onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
          <img ref={image} src={url} alt="待裁剪题目" draggable={false}
            onLoad={() => setReady(true)} onError={() => setError("无法读取预览图片")} />
          {ready && (
            <div className="crop-box" style={{ left: `${rect.left * 100}%`, top: `${rect.top * 100}%`,
              width: `${(rect.right - rect.left) * 100}%`, height: `${(rect.bottom - rect.top) * 100}%` }}>
              {(["tl", "tr", "bl", "br"] as const).map((corner, index) => (
                <button key={corner} type="button" data-corner={corner} className={`crop-handle ${corner}`}
                  aria-label={`调整${["左上", "右上", "左下", "右下"][index]}裁剪角`}
                  onKeyDown={event => {
                    const dx = event.key === "ArrowLeft" ? -0.01 : event.key === "ArrowRight" ? 0.01 : 0;
                    const dy = event.key === "ArrowUp" ? -0.01 : event.key === "ArrowDown" ? 0.01 : 0;
                    if (!dx && !dy) return;
                    event.preventDefault();
                    setRect(previous => resize(previous, corner, {
                      x: (corner.endsWith("l") ? previous.left : previous.right) + dx,
                      y: (corner.startsWith("t") ? previous.top : previous.bottom) + dy,
                    }));
                  }} />
              ))}
            </div>
          )}
        </div>
      )}
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="study-actions">
        <Button type="button" variant="secondary" disabled={!ready || saving} onClick={() => setRect(full)}>全图</Button>
        <Button type="button" disabled={!ready || saving} onClick={() => void useCrop()}><Crop size={16} />使用裁剪图</Button>
      </div>
    </div>
  );
}

export function ExerciseCrop({ data, initial, upload, onUse, onClose }: {
  data: StudyData;
  initial?: Entry<Material>;
  upload?: Blob;
  onUse: (file: File, source?: Entry<Material>, page?: number) => void;
  onClose: () => void;
}) {
  const [folder, setFolder] = useState(initial?.folderId || "");
  const [id, setId] = useState(initial?.id || "");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState<number>();
  const [preview, setPreview] = useState<{ blob: Blob; source?: Entry<Material>; page?: number }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const materials = data.material.filter(item => item.type === "习题集" &&
    (!folder || item.folderId === folder) &&
    (item.file.mime.startsWith("image/") || (item.file.mime === "application/pdf" && nativeStudyTools())));
  const source = materials.find(item => item.id === id);
  const pdf = source?.file.mime === "application/pdf";
  async function load(nextPage = page) {
    if (!source || busy) return;
    setBusy(true);
    setError("");
    setPreview(undefined);
    try {
      if (pdf) {
        const result = await renderPDFPage(source.file, nextPage);
        setPages(result.pages);
        setPage(nextPage);
        setPreview({ blob: result.image, source, page: nextPage });
      } else {
        const response = await fetch(assetUrl(source.file));
        if (!response.ok) throw new Error("无法读取练习图片，请重新同步附件");
        setPreview({ blob: await response.blob(), source });
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selection = preview || (upload ? { blob: upload, source: undefined, page: undefined } : undefined);
  return (
    <section className="study-tool">
      <div className="study-tool-heading"><strong>{upload ? "裁剪上传题图" : "从习题集中框选"}</strong>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>关闭</Button>
      </div>
      {!upload && (
        <>
          <div className="crop-source-grid">
            <Field label="习题集文件夹">
              <Select value={folder} disabled={busy} options={[{ value: "", label: "全部文件夹" },
                ...(data.folder || []).map(item => ({ value: item.id, label: item.title }))]}
                onChange={event => { setFolder(event.target.value); setId(""); setPreview(undefined); setPages(undefined); setPage(1); }} />
            </Field>
            <Field label="选择练习">
              <Select value={id} disabled={busy} options={[{ value: "", label: "选择一份 PDF 或图片练习" },
                ...materials.map(item => ({ value: item.id, label: item.title }))]}
                onChange={event => { setId(event.target.value); setPreview(undefined); setPages(undefined); setPage(1); }} />
            </Field>
          </div>
          {!materials.length && <small className="muted">这个范围内没有可框选的练习。请先上传习题集 PDF 或图片。</small>}
          <div className="study-actions">
            {pdf && (
              <>
                <label className="crop-page-input">页码 <input aria-label="PDF 页码" type="number" min={1} max={pages}
                  value={page || ""} disabled={busy} onChange={event => setPage(Number(event.target.value))}
                  onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (Number.isInteger(page) && page > 0) void load(); } }} /></label>
                {pages && <small>共 {pages} 页</small>}
              </>
            )}
            <Button type="button" variant="secondary" disabled={busy || !source || (!!pdf && (!Number.isInteger(page) || page < 1 || !!pages && page > pages))} onClick={() => void load()}>
              {busy && <Busy />}{pdf ? "打开这一页" : "打开练习"}
            </Button>
            {preview?.page !== undefined && pages && (
              <>
                <Button type="button" variant="ghost" disabled={busy || preview.page <= 1} onClick={() => void load(preview.page! - 1)}>上一页</Button>
                <Button type="button" variant="ghost" disabled={busy || preview.page >= pages} onClick={() => void load(preview.page! + 1)}>下一页</Button>
                <small className="muted">当前预览第 {preview.page} 页</small>
              </>
            )}
          </div>
        </>
      )}
      {error && <div className="form-error" role="alert">{error}</div>}
      {selection && <CropFrame key={`${selection.source?.id || "upload"}-${selection.page || 0}`} source={selection.blob}
        onUse={file => onUse(file, selection.source, selection.page)} />}
    </section>
  );
}
