import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const home = process.env.QINGYAN_HOME || path.dirname(appDirectory);
const dataDirectory = path.join(home, "data");
const expectedInstance = createHash("sha256")
  .update(path.resolve(dataDirectory))
  .digest("hex")
  .slice(0, 16);
const stateFile = path.join(home, "runtime.json");
const logDirectory = path.join(home, "logs");
fs.mkdirSync(logDirectory, { recursive: true });
const nodeCandidate = path.join(home, "runtime", "node.exe");
const node = fs.existsSync(nodeCandidate) ? nodeCandidate : process.execPath;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function health(url) {
  try {
    const r = await fetch(url + "api/v1/local/health", {
      signal: AbortSignal.timeout(900),
    });
    const h = await r.json();
    return (
      r.ok &&
      h.app === "qingyan-local" &&
      h.instance === expectedInstance &&
      h.version === "2.0.0"
    );
  } catch {
    return false;
  }
}
async function previous() {
  try {
    const info = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (
      /^http:\/\/127\.0\.0\.1:\d+\/$/.test(info.url) &&
      (await health(info.url))
    )
      return info;
  } catch {}
  return null;
}
function show(url) {
  if (process.env.QINGYAN_NO_OPEN === "1") return;
  const child = spawn("explorer.exe", [url], {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      });
  child.unref();
}
async function start() {
  const existing = await previous();
  if (existing) {
    show(existing.url);
    return { ...existing, reused: true };
  }
  const lockFile = path.join(home, "launch.lock");
  let lock;
  for (let i = 0; i < 150; i++) {
    try {
      lock = fs.openSync(lockFile, "wx");
      break;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      const info = await previous();
      if (info) {
        show(info.url);
        return { ...info, reused: true };
      }
      try {
        if (Date.now() - fs.statSync(lockFile).mtimeMs > 60000)
          fs.unlinkSync(lockFile);
      } catch {}
      await delay(100);
    }
  }
  if (lock === undefined)
    throw new Error("清研正在启动，请稍后重新点击桌面图标。");
  try {
    const reused = await previous();
    if (reused) {
      show(reused.url);
      return { ...reused, reused: true };
    }
    const base = Number(process.env.QINGYAN_BASE_PORT || 18766);
    if (fs.existsSync(path.join(home,"managed-service.json"))) {
      const run=spawnSync("schtasks.exe",["/Run","/TN","QingyanStudyLocal"],{windowsHide:true,stdio:"ignore"});
      if(run.status===0){for(let attempt=0;attempt<100;attempt++){const ready=await previous();if(ready){show(ready.url);return {...ready,reused:false};}await delay(150);}throw new Error("本地后台服务暂未就绪，请稍后重新点击桌面图标。");}
    }
    for (let port = base; port < base + 12; port++) {
      const url = `http://127.0.0.1:${port}/`;
      // A different local service may already own this port. Never stop it.
      const { createServer } = await import("node:net");
      const available = await new Promise((resolve) => {
        const probe = createServer();
        probe.once("error", () => resolve(false));
        probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
      });
      if (!available) continue;
      const log = fs.openSync(path.join(logDirectory, "server.log"), "a");
      const child = spawn(
        node,
        [
          "--disable-warning=ExperimentalWarning",
          path.join(appDirectory, "server.mjs"),
        ],
        {
          cwd: appDirectory,
          detached: true,
          stdio: ["ignore", log, log],
          windowsHide: true,
          env: {
            ...process.env,
            QINGYAN_PORT: String(port),
            QINGYAN_DATA_DIR: dataDirectory,
          },
        },
      );
      fs.closeSync(log);
      child.unref();
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await health(url)) {
          const info = {
            url,
            pid: child.pid,
            version: "2.0.0",
            startedAt: new Date().toISOString(),
          };
          const temp = stateFile + ".tmp";
          fs.writeFileSync(temp, JSON.stringify(info, null, 2));
          fs.renameSync(temp, stateFile);
          show(url);
          return { ...info, reused: false };
        }
        await delay(120);
      }
      if (child.pid)
        try {
          process.kill(child.pid, "SIGTERM");
        } catch {}
      throw new Error(
        "本地服务未能启动。请查看本机清研文件夹 logs/server.log，资料仍保存在 data 文件夹。",
      );
    }
    throw new Error("本机可用端口被占用，请关闭其他复习软件实例后重试。");
  } finally {
    fs.closeSync(lock);
    try {
      fs.unlinkSync(lockFile);
    } catch {}
  }
}
try {
  console.log(JSON.stringify(await start()));
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  fs.appendFileSync(
    path.join(logDirectory, "launcher.log"),
    `${new Date().toISOString()} ${message}\n`,
  );
  const escaped = message.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
  const errorFile = path.join(home, "启动帮助.html");
  await fsp.writeFile(
    errorFile,
    `<!doctype html><meta charset="utf-8"><title>清研启动帮助</title><body style="font-family:Microsoft YaHei,sans-serif;padding:50px;background:#f7f8f4;color:#356653"><h1>暂时没能打开清研</h1><p>${escaped}</p><p>你的记录位于 ${dataDirectory}，程序启动失败不会删除记录。</p><p>可重新双击桌面「清研考研复习」，或将此提示反馈给维护人员。</p>`,
  );
  if (process.env.QINGYAN_NO_OPEN !== "1") {
    const child = spawn("explorer.exe", [errorFile], {
      stdio: "ignore",
      detached: true,
      windowsHide: false,
    });
    child.unref();
  }
  console.error(message);
  process.exitCode = 1;
}
