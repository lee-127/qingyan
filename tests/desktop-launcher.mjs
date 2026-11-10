import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const home = await fs.mkdtemp(path.join(os.tmpdir(), "qingyan-launch-test-"));
let pid;
async function run() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(root, "outputs", "desktop-app", "launcher.mjs")],
      {
        windowsHide: true,
        env: {
          ...process.env,
          QINGYAN_HOME: home,
          QINGYAN_NO_OPEN: "1",
          QINGYAN_BASE_PORT: "18966",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "",
      error = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (error += d));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code) reject(new Error(error));
      else
        try {
          resolve(JSON.parse(output.trim()));
        } catch (e) {
          reject(e);
        }
    });
  });
}
async function kill() {
  if (!pid) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {}
  for (let i = 0; i < 80; i++) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, 70));
  }
}
try {
  const first = await run();
  pid = first.pid;
  assert.equal(first.reused, false);
  const health = await (await fetch(first.url + "api/v1/local/health")).json();
  assert.equal(health.app, "qingyan-local");
  const second = await run();
  assert.equal(second.reused, true);
  assert.equal(second.pid, first.pid);
  assert.equal(second.url, first.url);
  await kill();
  pid = undefined;
  const third = await run();
  pid = third.pid;
  assert.equal(third.reused, false);
  assert.ok((await fetch(third.url)).ok);
  console.log(
    "PASS: desktop launcher starts a hidden local service, reuses an existing instance and restarts after a stopped process without internet or account login.",
  );
} finally {
  await kill();
  if (
    path.dirname(home) !== path.resolve(os.tmpdir()) ||
    !path.basename(home).startsWith("qingyan-launch-test-")
  )
    throw new Error("Unsafe test path");
  await fs.rm(home, { recursive: true, force: true });
}
