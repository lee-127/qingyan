import {
  owner,
  database,
  bucket,
  failure,
  checkOrigin,
  ApiError,
} from "@/lib/server";
const types: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  zip: "application/zip",
};
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const uid = await owner();
    const body = await request.formData();
    const file = body.get("file");
    if (!(file instanceof File) || !file.size)
      throw new ApiError(400, "请选择非空文件");
    if (file.size > 20 * 1024 * 1024)
      throw new ApiError(400, "单个文件不能超过 20 MB");
    const mime = types[file.name.split(".").pop()?.toLowerCase() || ""];
    if (!mime) throw new ApiError(400, "支持 PDF、Word、文本、图片及 ZIP 文件");
    const id = crypto.randomUUID();
    const name = file.name.slice(0, 200);
    const key = `${uid}/${id}`;
    await bucket().put(key, file.stream(), {
      httpMetadata: { contentType: mime },
    });
    try {
      await database()
        .prepare(
          "INSERT INTO assets (id, owner, name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(id, uid, name, mime, file.size, new Date().toISOString())
        .run();
    } catch (e) {
      await bucket().delete(key);
      throw e;
    }
    return Response.json({ id, name, mime, size: file.size }, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
