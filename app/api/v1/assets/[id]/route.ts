import { owner, database, bucket, failure, ApiError } from "@/lib/server";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const uid = await owner();
    const { id } = await context.params;
    const row = await database()
      .prepare("SELECT name, mime FROM assets WHERE id = ? AND owner = ?")
      .bind(id, uid)
      .first<{ name: string; mime: string }>();
    if (!row) throw new ApiError(404, "文件不存在");
    const file = await bucket().get(`${uid}/${id}`);
    if (!file) throw new ApiError(404, "文件不存在");
    const inline =
      row.mime.startsWith("image/") || row.mime === "application/pdf";
    return new Response(file.body, {
      headers: {
        "Content-Type": row.mime,
        "Content-Disposition": `${inline && !new URL(request.url).searchParams.has("download") ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
