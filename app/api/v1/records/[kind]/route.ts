import {
  owner,
  database,
  failure,
  checkOrigin,
  assetIds,
  ApiError,
} from "@/lib/server";
import { schemas } from "@/lib/validation";
export async function POST(
  request: Request,
  context: { params: Promise<{ kind: string }> },
) {
  try {
    checkOrigin(request);
    const uid = await owner();
    const { kind } = await context.params;
    if (!Object.hasOwn(schemas, kind)) throw new ApiError(404, "未知的数据类型");
    const input = (await request.json()) as Record<string, unknown>;
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new ApiError(400, "数据格式有误");
    if (
      input.id !== undefined &&
      (typeof input.id !== "string" || input.id.length > 150)
    )
      throw new ApiError(400, "记录 ID 无效");
    const parsed = schemas[kind as keyof typeof schemas].safeParse(input);
    if (!parsed.success)
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message || "数据格式有误",
      );
    const data = parsed.data;
    const db = database();
    for (const id of new Set(assetIds(data)))
      if (
        !(await db
          .prepare("SELECT id FROM assets WHERE id = ? AND owner = ?")
          .bind(id, uid)
          .first())
      )
        throw new ApiError(400, "附件不存在，请重新上传");
    if (
      input.id &&
      !(await db
        .prepare(
          "SELECT id FROM records WHERE id = ? AND owner = ? AND kind = ?",
        )
        .bind(input.id, uid, kind)
        .first())
    )
      throw new ApiError(404, "记录已不存在，请刷新");
    const id =
      input.id ||
      (kind === "settings" ? `settings-${uid}` : crypto.randomUUID());
    const now = new Date().toISOString();
    await db
      .prepare(
        "INSERT INTO records (id, owner, kind, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at WHERE records.owner = excluded.owner AND records.kind = excluded.kind",
      )
      .bind(id, uid, kind, JSON.stringify(data), now, now)
      .run();
    return Response.json(
      { id, ...data, updatedAt: now },
      { status: input.id ? 200 : 201 },
    );
  } catch (e) {
    return failure(e);
  }
}
