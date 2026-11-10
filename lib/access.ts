import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { cookieValue, equalSecret, sessionValue } from "./access-token";
export function accessKey(): string | undefined {
  return env.STUDY_ACCESS_KEY;
}
export async function hasDeviceAccess(): Promise<boolean> {
  const key = accessKey();
  if (!key) return false;
  const cookie = cookieValue((await headers()).get("cookie"));
  return cookie.length === 64 && equalSecret(cookie, await sessionValue(key));
}
