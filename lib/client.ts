import type { Kind, Asset, StudyData } from "./models";
async function request<T = unknown>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, options);
  const data: any = await response.json();
  if (!response.ok) throw new Error(data.error || "请求未完成");
  return data as T;
}
export const api = {
  all: () => request<StudyData>("/api/v1/records"),
  save: (kind: Kind, data: unknown) =>
    request(`/api/v1/records/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  remove: (kind: Kind, id: string) =>
    request(`/api/v1/records/${kind}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  upload: async (file: File): Promise<Asset> => {
    const form = new FormData();
    form.append("file", file);
    return request<Asset>("/api/v1/assets", { method: "POST", body: form });
  },
};
export const assetUrl = (asset: Asset) =>
  typeof window !== "undefined" && window.__qingyanMobile
    ? window.__qingyanMobile.assetUrl(asset)
    : `/api/v1/assets/${asset.id}`;
export async function download(blob: Blob, filename: string) {
  if (window.__qingyanMobile) {
    await window.__qingyanMobile.download(blob, filename);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/[\\/:*?"<>|]/g, "_");
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
