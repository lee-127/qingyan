import { owner, database, failure, checkOrigin, ApiError } from "@/lib/server";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    checkOrigin(request);
    const uid = await owner();
    const { kind, id } = await context.params;
    const result = await database()
      .prepare("DELETE FROM records WHERE id = ? AND owner = ? AND kind = ?")
      .bind(id, uid, kind)
      .run();
    if (!result.meta.changes) throw new ApiError(404, "记录已不存在");
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
