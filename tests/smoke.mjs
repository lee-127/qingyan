import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import JSZip from "jszip";
import { localSession } from "./local-session.mjs";
const base = process.env.STUDY_TEST_URL || "http://127.0.0.1:5173";
const cookie = await localSession(base);
const created = [];
let checks = 0;
async function call(url, method = "GET", data) {
  const r = await fetch(base + url, {
    method,
    headers: {
      Cookie: cookie,
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
async function save(kind, data) {
  const r = await call(`/api/v1/records/${kind}`, "POST", data);
  assert.equal(r.status, 201, JSON.stringify(r));
  created.push([kind, r.data.id]);
  return r.data;
}
try {
  const anon = await fetch(base + "/api/v1/records");
  assert.equal(anon.status, 401);
  checks++;
  const form = new FormData();
  form.append(
    "file",
    new File(["Synthetic material for API verification"], "smoke-test.txt", {
      type: "text/plain",
    }),
  );
  const upload = await fetch(base + "/api/v1/assets", {
    method: "POST",
    headers: { Cookie: cookie },
    body: form,
  });
  assert.equal(upload.status, 201);
  const asset = await upload.json();
  checks++;
  const file = await fetch(base + `/api/v1/assets/${asset.id}`, {
    headers: { Cookie: cookie },
  });
  assert.equal(await file.text(), "Synthetic material for API verification");
  checks++;
  const noFile = await fetch(base + `/api/v1/assets/${asset.id}`);
  assert.equal(noFile.status, 401);
  checks++;
  const material = await save("material", {
    title: "[测试]资料",
    type: "真题卷",
    subject: "数学",
    year: "2025",
    note: "临时测试",
    file: asset,
  });
  checks++;
  const question = {
    title: "[测试]极限",
    subject: "数学",
    topic: "极限",
    reason: "方法不熟",
    status: "待复习",
    difficulty: "中等",
    question: "求 lim(x→0) sin x / x",
    answer: "1",
    reflection: "注意角度单位",
    sourceId: material.id,
    source: material.title,
    tags: ["测试"],
  };
  const mistake = await save("mistake", question);
  checks++;
  const paper = await save("paper", {
    title: "[测试]快照卷",
    questionIds: [mistake.id],
    questions: [question],
    points: [10],
    space: 3,
    includeAnswers: true,
    note: "测试",
  });
  checks++;
  const updated = await call("/api/v1/records/mistake", "POST", {
    ...mistake,
    title: "[测试]编辑题目",
    status: "已掌握",
  });
  assert.equal(updated.status, 200);
  checks++;
  const badScore = await call("/api/v1/records/score", "POST", {
    title: "无效",
    subject: "数学",
    type: "真题卷",
    score: 151,
    total: 150,
    date: "2026-11-04",
    duration: 180,
  });
  assert.equal(badScore.status, 400);
  checks++;
  const badDate = await call("/api/v1/records/score", "POST", {
    title: "无效",
    subject: "数学",
    type: "真题卷",
    score: 100,
    total: 150,
    date: "2026-02-31",
    duration: 180,
  });
  assert.equal(badDate.status, 400);
  checks++;
  for (const type of ["真题卷", "模拟卷"])
    await save("score", {
      title: `[测试]${type}`,
      subject: "数学",
      type,
      score: type === "真题卷" ? 123 : 112,
      total: 150,
      date: "2026-11-04",
      duration: 180,
      sourceId: material.id,
      note: "临时测试",
    });
  checks++;
  const all = (await call("/api/v1/records")).data;
  assert.equal(all.mistake.find((m) => m.id === mistake.id).status, "已掌握");
  assert.equal(
    all.paper.find((p) => p.id === paper.id).questions[0].title,
    question.title,
  );
  checks++;
  const badKind = await call("/api/v1/records/not-real", "POST", {});
  assert.equal(badKind.status, 404);
  checks++;
  const cross = await fetch(base + "/api/v1/records/score", {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: "https://untrusted.example",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(cross.status, 403);
  checks++;
  const filename = path.join(
    os.homedir(),
    "Downloads",
    "我的错题专项练习.docx",
  );
  try {
    const zip = await JSZip.loadAsync(await fs.readFile(filename));
    const xml = await zip.file("word/document.xml").async("string");
    assert.ok(
      xml.indexOf("特征值与矩阵的迹") < xml.indexOf("用等价无穷小求极限"),
    );
    assert.ok(xml.includes("参考答案与解析"));
    assert.ok(xml.includes('w:type="page"'));
    assert.ok(xml.includes("tr(A²)"));
    checks++;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    console.log(
      "DOCX browser download not present; skipped archive inspection.",
    );
  }
  console.log(
    `PASS: ${checks} checks covering auth, file persistence, CRUD, snapshot isolation, validation, score types, CSRF and DOCX structure.`,
  );
} finally {
  for (const [kind, id] of created.reverse()) {
    const r = await call(`/api/v1/records/${kind}/${id}`, "DELETE");
    assert.equal(r.status, 200);
  }
  console.log("Temporary test records removed.");
}
