import assert from "node:assert/strict";
const base = "http://127.0.0.1:5173";
const key = "local-testing-device-access-not-a-production-secret";
let count = 0;
const page = await fetch(base + "/", { redirect: "manual" });
assert.equal(page.status, 200);
assert.ok((await page.text()).includes("正在打开你的复习空间"));
count++;
const unauthorized = await fetch(base + "/api/v1/records");
assert.equal(unauthorized.status, 401);
count++;
const legacy = await fetch(base + "/api/v1/records", {
  headers: { Cookie: "__sites_local_auth=1" },
});
assert.equal(legacy.status, 401);
count++;
const wrong = await fetch(base + "/api/v1/access", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ key: "invalid" }),
});
assert.equal(wrong.status, 401);
assert.ok(!wrong.headers.get("set-cookie"));
count++;
const valid = await fetch(base + "/api/v1/access", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ key }),
});
assert.equal(valid.status, 200);
const cookieHeader = valid.headers.get("set-cookie");
assert.ok(cookieHeader.includes("HttpOnly"));
assert.ok(cookieHeader.includes("SameSite=Lax"));
assert.ok(cookieHeader.includes("Max-Age=31536000"));
assert.ok(!cookieHeader.includes(key));
const cookie = cookieHeader.split(";")[0];
count++;
const authorized = await fetch(base + "/api/v1/access", {
  headers: { Cookie: cookie },
});
assert.equal((await authorized.json()).authorized, true);
count++;
const all = await fetch(base + "/api/v1/records", {
  headers: { Cookie: cookie },
});
assert.equal(all.status, 200);
const before = await all.json();
count++;
const tampered = await fetch(base + "/api/v1/records", {
  headers: { Cookie: cookie + "x" },
});
assert.equal(tampered.status, 401);
count++;
const value = {
  title: "[免登录验证]持久记录",
  subject: "数学",
  type: "模拟卷",
  score: 120,
  total: 150,
  date: "2026-11-04",
  duration: 180,
  sourceId: "",
  note: "临时测试",
};
const save = await fetch(base + "/api/v1/records/score", {
  method: "POST",
  headers: { Cookie: cookie, "Content-Type": "application/json" },
  body: JSON.stringify(value),
});
assert.equal(save.status, 201);
const record = await save.json();
count++;
try {
  const renewed = await fetch(base + "/api/v1/access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
  const renewedCookie = renewed.headers.get("set-cookie").split(";")[0];
  assert.equal(renewedCookie, cookie);
  const after = await (
    await fetch(base + "/api/v1/records", {
      headers: { Cookie: renewedCookie },
    })
  ).json();
  assert.ok(after.score.some((s) => s.id === record.id));
  for (const kind of Object.keys(before))
    for (const r of before[kind])
      assert.ok(after[kind].some((s) => s.id === r.id));
  count++;
  const cross = await fetch(base + "/api/v1/access", {
    method: "POST",
    headers: {
      Origin: "https://untrusted.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ key }),
  });
  assert.equal(cross.status, 403);
  count++;
  console.log(
    `PASS: ${count} checks: anonymous gate, no account bypass, invalid key/cookie rejection, persistent device access, record preservation and same-origin protection.`,
  );
} finally {
  await fetch(base + `/api/v1/records/score/${record.id}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
}
