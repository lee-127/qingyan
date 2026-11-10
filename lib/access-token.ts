// Domain-separated session value: the browser cookie never contains the link key.
export const ACCESS_COOKIE = "qingyan_device_access";
export async function sessionValue(key: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`qingyan-device-session-v1:${key}`),
  );
  return Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export function equalSecret(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++)
    difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}
export function cookieValue(header: string | null): string {
  return (
    (header || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${ACCESS_COOKIE}=`))
      ?.slice(ACCESS_COOKIE.length + 1) || ""
  );
}
