import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import JSZip from "jszip";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageDirectory = path.join(root, "outputs", "desktop-app");
const { LocalStore } = await import(
  pathToFileURL(path.join(packageDirectory, "store.mjs")).href
);
const folder = await fs.mkdtemp(path.join(os.tmpdir(), "qingyan-local-test-"));
const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
let server,
  checks = 0,
  log = "",
  base,
  port;
async function start() {
  port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    [path.join(packageDirectory, "server.mjs")],
    {
      windowsHide: true,
      env: {
        ...process.env,
        QINGYAN_DATA_DIR: path.join(folder, "main"),
        QINGYAN_PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/v1/local/health")).ok) return;
    } catch {}
    if (server.exitCode !== null) throw new Error(log);
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error("Local startup timed out: " + log);
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  await new Promise((resolve) => {
    server.once("exit", resolve);
    server.kill();
  });
}
async function call(route, method = "GET", data) {
  const r = await fetch(base + route, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
try {
  await start();
  const page = await fetch(base + "/", { redirect: "manual" });
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes("本地复习工作台"));
  assert.ok(
    page.headers.get("content-security-policy").includes("connect-src 'self'"),
  );
  checks++;
  const normal = await call("/api/v1/records");
  assert.equal(normal.status, 200);
  assert.deepEqual(normal.data.material, []);
  checks++;
  const cross = await fetch(base + "/api/v1/records", {
    headers: { Origin: "https://untrusted.example" },
  });
  assert.equal(cross.status, 403);
  checks++;
  const wrongHost = await new Promise((resolve, reject) => {
    http
      .get(
        base + "/api/v1/records",
        { headers: { Host: `untrusted.example:${port}` } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      )
      .on("error", reject);
  });
  assert.equal(wrongHost, 403);
  checks++;
  const form = new FormData();
  const bytes = Buffer.from("本地资料保存验证，无需连接互联网。", "utf8");
  form.append(
    "file",
    new File([bytes], "验证笔记.txt", { type: "text/plain" }),
  );
  const upload = await fetch(base + "/api/v1/assets", {
    method: "POST",
    body: form,
  });
  assert.equal(upload.status, 201);
  const asset = await upload.json();
  checks++;
  const download = await fetch(base + `/api/v1/assets/${asset.id}?download`);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  assert.ok(
    download.headers.get("content-disposition").startsWith("attachment"),
  );
  checks++;
  const range = await fetch(base + `/api/v1/assets/${asset.id}`, {
    headers: { Range: "bytes=0-2" },
  });
  assert.equal(range.status, 206);
  assert.deepEqual(
    Buffer.from(await range.arrayBuffer()),
    bytes.subarray(0, 3),
  );
  checks++;
  const material = (
    await call("/api/v1/records/material", "POST", {
      title: "[测试]本地笔记",
      subject: "数学",
      type: "笔记",
      year: "",
      note: "",
      file: asset,
    })
  ).data;
  const question = {
    title: "[测试]本地错题",
    subject: "数学",
    topic: "极限",
    reason: "概念不清",
    status: "待复习",
    difficulty: "基础",
    question: "求 lim(x→0) sin x / x",
    answer: "1",
    reflection: "",
    sourceId: material.id,
    source: material.title,
    tags: ["验证"],
  };
  const mistake = (await call("/api/v1/records/mistake", "POST", question))
    .data;
  const paper = (
    await call("/api/v1/records/paper", "POST", {
      title: "[测试]本地练习卷",
      questionIds: [mistake.id],
      questions: [question],
      points: [10],
      space: 5,
      includeAnswers: true,
      note: "",
    })
  ).data;
  assert.ok(paper.id);
  checks++;
  await call("/api/v1/records/mistake", "POST", {
    ...mistake,
    title: "[测试]修改后的错题",
    status: "已掌握",
  });
  assert.equal(
    (await call("/api/v1/records")).data.paper[0].questions[0].title,
    question.title,
  );
  checks++;
  for (const type of ["真题卷", "模拟卷"]) {
    const r = await call("/api/v1/records/score", "POST", {
      title: `[测试]${type}`,
      subject: "数学",
      type,
      score: 120,
      total: 150,
      date: "2026-11-04",
      duration: 180,
      sourceId: "",
      note: "",
    });
    assert.equal(r.status, 201);
  }
  checks++;
  const invalid = await call("/api/v1/records/score", "POST", {
    title: "bad",
    subject: "数学",
    type: "真题卷",
    score: 151,
    total: 150,
    date: "2026-11-04",
    duration: 180,
  });
  assert.equal(invalid.status, 400);
  checks++;
  const invalidDate = await call("/api/v1/records/score", "POST", {
    title: "bad",
    subject: "数学",
    type: "真题卷",
    score: 120,
    total: 150,
    date: "2026-02-31",
    duration: 180,
  });
  assert.equal(invalidDate.status, 400);
  checks++;
  const invalidBody = await call("/api/v1/records/score", "POST", null);
  assert.equal(invalidBody.status, 400);
  checks++;
  const exportResponse = await fetch(base + "/api/v1/local/backup");
  assert.equal(exportResponse.status, 200);
  const backup = Buffer.from(await exportResponse.arrayBuffer());
  const zip = await JSZip.loadAsync(backup);
  assert.deepEqual(
    await zip.file(`files/${asset.id}`).async("nodebuffer"),
    bytes,
  );
  checks++;
  const restoreStore = new LocalStore(path.join(folder, "restored"));
  const imported = await restoreStore.importBackup(backup);
  assert.equal(imported.added, 5);
  assert.equal(restoreStore.all().score.length, 2);
  assert.deepEqual(await fs.readFile(restoreStore.filePath(asset.id)), bytes);
  checks++;
  const repeated = await restoreStore.importBackup(backup);
  assert.equal(repeated.added, 0);
  assert.equal(repeated.skipped, 5);
  checks++;
  const broken = await JSZip.loadAsync(backup);
  broken.remove(`files/${asset.id}`);
  const brokenZip = await broken.generateAsync({ type: "uint8array" });
  await assert.rejects(restoreStore.importBackup(brokenZip));
  assert.equal(restoreStore.all().material.length, 1);
  checks++;
  restoreStore.close();
  const reopened = new LocalStore(path.join(folder, "restored"));
  reopened.dailyBackup();
  assert.ok(
    (await fs.readdir(path.join(folder, "restored", "automatic-backups"))).some(
      (x) => x.endsWith(".sqlite"),
    ),
  );
  reopened.close();
  checks++;
  const before = (await call("/api/v1/records")).data;
  await stop();
  await start();
  const after = (await call("/api/v1/records")).data;
  assert.deepEqual(after, before);
  assert.deepEqual(
    Buffer.from(
      await (await fetch(base + `/api/v1/assets/${asset.id}`)).arrayBuffer(),
    ),
    bytes,
  );
  checks++;
  const apiRestore = await fetch(base + "/api/v1/local/restore", {
    method: "POST",
    headers: { "Content-Type": "application/zip" },
    body: backup,
  });
  assert.equal(apiRestore.status, 200);
  assert.equal((await apiRestore.json()).added, 0);
  checks++;
  const index = await fs.readFile(
    path.join(packageDirectory, "client", "index.html"),
    "utf8",
  );
  assert.ok(!/https?:\/\//.test(index));
  const assetFiles = await fs.readdir(
    path.join(packageDirectory, "client", "assets"),
  );
  for (const filename of assetFiles.filter((x) => x.endsWith(".js"))) {
    const source = await fs.readFile(
      path.join(packageDirectory, "client", "assets", filename),
      "utf8",
    );
    assert.ok(!source.includes("pearlybox.chatgpt.site"));
  }
  checks++;
  console.log(
    `PASS: ${checks} offline desktop checks: loopback access, no login, file upload/download/ranges, all record modules, validation, full ZIP backup/restore, duplicate preservation, corrupt backup rejection, daily snapshot, restart durability and self-contained assets.`,
  );
} catch (e) {
  console.error(log);
  throw e;
} finally {
  await stop();
  if (
    path.dirname(folder) !== path.resolve(os.tmpdir()) ||
    !path.basename(folder).startsWith("qingyan-local-test-")
  )
    throw new Error("Refusing unsafe test cleanup");
  await fs.rm(folder, { recursive: true, force: true });
}
