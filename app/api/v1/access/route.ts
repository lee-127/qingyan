import { accessKey, hasDeviceAccess } from "@/lib/access";
import { ACCESS_COOKIE, equalSecret, sessionValue } from "@/lib/access-token";
import { ApiError, checkOrigin, failure } from "@/lib/server";
export async function GET() {
  return Response.json(
    { authorized: await hasDeviceAccess() },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const key = accessKey();
    if (!key) throw new ApiError(503, "免登录入口暂未开启");
    const input = (await request.json()) as { key?: unknown };
    if (
      !input ||
      typeof input.key !== "string" ||
      input.key.length > 256 ||
      !equalSecret(await sessionValue(input.key), await sessionValue(key))
    )
      throw new ApiError(401, "专属链接无效，请从桌面快捷方式重新进入。");
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return Response.json(
      { authorized: true },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Set-Cookie": `${ACCESS_COOKIE}=${await sessionValue(key)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`,
        },
      },
    );
  } catch (e) {
    return failure(e);
  }
}
