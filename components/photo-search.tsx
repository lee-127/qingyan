"use client";
import { useEffect, useState } from "react";
import { Camera, Crop, ImagePlus, ScanSearch, X } from "lucide-react";
import { pickQuestionPhoto } from "@/lib/study-tools";
import { AISolver } from "./ai-solver";
import { CropFrame } from "./exercise-crop";
import { Busy, Button, Field } from "./ui";

const photoPrompt = "请识别并解答题图中的题目。先简短说明你识别到的题号或题意，再给出解析。若图中有多题，按补充说明选题，未指定时只解第一道完整的题。";

export function PhotoSearch({ onSettings }: { onSettings: () => void }) {
  const [photo, setPhoto] = useState<File>();
  const [original, setOriginal] = useState<File>();
  const [preview, setPreview] = useState("");
  const [note, setNote] = useState("");
  const [cropping, setCropping] = useState(false);
  const [picking, setPicking] = useState<"camera" | "library">();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!photo) { setPreview(""); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function choose(source: "camera" | "library") {
    setPicking(source);
    setError("");
    try {
      const image = await pickQuestionPhoto(source);
      if (image) {
        setPhoto(image);
        setOriginal(image);
        setCropping(false);
        setNote("");
      }
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPicking(undefined);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DEEPSEEK</span>
          <h1>AI 拍照搜题</h1>
          <p>在相机里框住题目，拍下并确认选区后，让 DeepSeek 解答。</p>
        </div>
      </div>
      <div className="photo-search">
        <section className="panel">
          <div className="panel-heading"><h2>选择题图</h2><ScanSearch size={18} /></div>
          <div className="settings-content photo-search-input">
            <div className="study-actions">
              <Button type="button" disabled={!!picking} onClick={() => void choose("camera")}>
                {picking === "camera" ? <Busy /> : <Camera size={17} />}拍照
              </Button>
              <Button type="button" variant="secondary" disabled={!!picking} onClick={() => void choose("library")}>
                {picking === "library" ? <Busy /> : <ImagePlus size={17} />}从相册选择
              </Button>
            </div>
            {error && <div className="form-error" role="alert">{error}</div>}
            {photo ? (
              <>
                {cropping ? (
                  <CropFrame source={original || photo} onUse={file => { setPhoto(file); setCropping(false); }} />
                ) : (
                  <div className="photo-search-preview"><img src={preview || undefined} alt="待解答的题图" /></div>
                )}
                <div className="study-actions">
                  <Button type="button" variant="secondary" disabled={!!picking} onClick={() => setCropping(!cropping)}>
                    {cropping ? "取消裁剪" : <><Crop size={16} />框选题目</>}
                  </Button>
                  <Button type="button" variant="ghost" disabled={!!picking} onClick={() => {
                    setPhoto(undefined);
                    setOriginal(undefined);
                    setCropping(false);
                    setNote("");
                  }}><X size={16} />移除题图</Button>
                </div>
                <Field label="补充说明（选填）">
                  <textarea value={note} onChange={event => setNote(event.target.value)} maxLength={1000}
                    rows={2} placeholder="例如：只解第 3 题，重点解释第二步" />
                </Field>
              </>
            ) : (
              <div className="photo-search-empty">
                <ScanSearch size={28} aria-hidden="true" />
                <p>拍清题干、选项和图表，尽量让一题完整入镜。</p>
              </div>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading"><h2>解题解析</h2></div>
          <div className="settings-content">
            <AISolver
              photoSearch
              blocked={cropping || !!picking}
              question={note.trim() ? photoPrompt + "\n补充说明：" + note.trim() : photoPrompt}
              image={photo}
            />
            <Button type="button" variant="ghost" onClick={onSettings}>DeepSeek 设置</Button>
          </div>
        </section>
      </div>
    </>
  );
}
