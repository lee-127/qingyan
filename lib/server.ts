import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { accessKey, hasDeviceAccess } from "./access";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function owner() {
  if (accessKey()) {
    if (!(await hasDeviceAccess()))
      throw new ApiError(401, "请从桌面快捷方式或专属链接重新进入，无需登录。");
    // This was an owner-private Site. Keep its original owner IDs and R2 keys,
    // avoiding a data rewrite when switching to a single personal workspace.
    const owners = await database()
      .prepare(
        "SELECT owner FROM records UNION SELECT owner FROM assets LIMIT 2",
      )
      .all<{ owner: string }>();
    if (owners.results.length > 1)
      throw new ApiError(409, "检测到多个历史资料空间，需要先确认数据归属。");
    return owners.results[0]?.owner || "personal-workspace";
  }
  const user = await getChatGPTUser();
  if (!user) throw new ApiError(401, "请先登录后使用复习工作台");
  return user.userId;
}
export function database() {
  if (!env.DB) throw new ApiError(503, "数据库暂时不可用，请稍后重试");
  return env.DB;
}
export function bucket() {
  if (!env.BUCKET) throw new ApiError(503, "文件存储暂时不可用，请稍后重试");
  return env.BUCKET;
}
export function failure(e: unknown) {
  if (e instanceof ApiError)
    return Response.json({ error: e.message }, { status: e.status });
  console.error("Study API error", e);
  return Response.json(
    { error: "操作未完成，请稍后重试。已填写的内容会保留。" },
    { status: 500 },
  );
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new ApiError(403, "不允许跨站写入");
}
export function assetIds(value: any): string[] {
  return [
    value.file?.id,
    value.image?.id,
    ...(value.questions || []).map((q: any) => q.image?.id),
  ].filter(Boolean);
}
