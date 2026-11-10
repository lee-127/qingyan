import type { Asset } from "./models";
import { assetUrl } from "./client";

export const nativeStudyTools = () =>
  typeof window !== "undefined" && !!window.__qyNativeApp && !!window.__qingyanMobile;

function call(method: Parameters<NonNullable<Window["__qingyanMobile"]>["studyTool"]>[0], params?: Record<string, unknown>) {
  if (!window.__qingyanMobile) return Promise.reject(new Error("此功能需要在清研 App 中使用"));
  return window.__qingyanMobile.studyTool(method, params);
}

function fromBase64(base64: string, mime: string) {
  return new Blob([Uint8Array.from(atob(base64), char => char.charCodeAt(0))], { type: mime });
}

export async function scanPDF() {
  const scan: { base64: string } | null = await call("scanPDF");
  if (!scan) return null;
  const stamp = new Date().toLocaleString("sv-SE").replace(/[: ]/g, "-");
  return new File([fromBase64(scan.base64, "application/pdf")], `扫描-${stamp}.pdf`, { type: "application/pdf" });
}

export async function renderPDFPage(asset: Asset, page: number) {
  const result: { base64: string; pages: number } = await call("renderPDFPage", { id: asset.id, page });
  return { image: fromBase64(result.base64, "image/jpeg"), pages: result.pages };
}

export const aiConfigured = (): Promise<boolean> => call("aiStatus");
export const setAIKey = (key: string): Promise<boolean> => call("aiKey", { key });

export async function pickQuestionPhoto(source: "camera" | "library") {
  const photo: { base64: string } | null = await call("pickQuestionPhoto", { source });
  if (!photo) return null;
  return new File([fromBase64(photo.base64, "image/jpeg")], "题目照片.jpg", { type: "image/jpeg" });
}

async function aiInput(question: string, image?: File | Asset) {
  if (!(await aiConfigured())) throw new Error("请先在「数据与设置 → DeepSeek 解题」保存 API Key");
  if (!image) return { question };
  let blob: Blob;
  if (image instanceof File) {
    blob = image;
  } else {
    const response = await fetch(assetUrl(image));
    if (!response.ok) throw new Error("题图无法读取，请重新选择或同步附件");
    blob = await response.blob();
  }
  return { question, image: await encodeQuestionImage(blob) };
}

async function encodeQuestionImage(image: Blob) {
  const bitmap = await createImageBitmap(image);
  try {
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法读取题图");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  } finally {
    bitmap.close();
  }
}

export async function solveProblem(question: string, image?: File | Asset, previous?: string) {
  return call("aiSolve", { ...await aiInput(question, image), ...(previous === undefined ? {} : { previous }) }) as Promise<{
    answer: string;
    model: string;
    truncated: boolean;
  }>;
}

export async function generateVariant(question: string, image?: Asset) {
  return call("aiVariant", await aiInput(question, image)) as Promise<{ question: string; solution: string; model: string }>;
}
