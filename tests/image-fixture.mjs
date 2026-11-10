import assert from "node:assert/strict";
import { localSession } from "./local-session.mjs";
const base = "http://127.0.0.1:5173";
const headers = { Cookie: await localSession(base) };
const bytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1kAAAAASUVORK5CYII=",
  "base64",
);
const form = new FormData();
form.append(
  "file",
  new File([bytes], "image-export-test.png", { type: "image/png" }),
);
const upload = await fetch(base + "/api/v1/assets", {
  method: "POST",
  headers,
  body: form,
});
assert.equal(upload.status, 201);
const image = await upload.json();
const q = {
  title: "[验证]题图导出",
  subject: "数学",
  topic: "文档导出验证",
  reason: "其他",
  status: "待复习",
  difficulty: "基础",
  question: "这是一条临时验证题，用于确认题图能嵌入 Word 文档。",
  image,
  answer: "图片应保留在文档内。",
  reflection: "",
  sourceId: "",
  source: "测试数据",
  tags: [],
};
const r = await fetch(base + "/api/v1/records/mistake", {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify(q),
});
assert.equal(r.status, 201);
console.log("Temporary image question created.");
