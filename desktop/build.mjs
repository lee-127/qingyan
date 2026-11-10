import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as viteBuild } from "vite";
import react from "@vitejs/plugin-react";
import { build as esbuild } from "esbuild";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "outputs", "desktop-app");
if (!out.startsWith(path.join(root, "outputs") + path.sep))
  throw new Error("Invalid local package path");
await fs.mkdir(out, { recursive: true });
await viteBuild({
  configFile: false,
  root: path.join(root, "desktop", "ui"),
  publicDir: path.join(root, "public"),
  plugins: [react()],
  resolve: { alias: { "@": root } },
  build: {
    outDir: path.join(out, "client"),
    emptyOutDir: false,
    target: "es2022",
  },
});
const common = {
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
  logLevel: "info",
};
await esbuild({
  ...common,
  entryPoints: [path.join(root, "desktop", "server.ts")],
  outfile: path.join(out, "server.mjs"),
});
await esbuild({
  ...common,
  entryPoints: [path.join(root, "desktop", "store.ts")],
  outfile: path.join(out, "store.mjs"),
});
await esbuild({
  ...common,
  entryPoints: [path.join(root, "desktop", "icloud-sync.ts")],
  outfile: path.join(out, "icloud-sync.mjs"),
});
await fs.copyFile(
  path.join(root, "desktop", "launcher.mjs"),
  path.join(out, "launcher.mjs"),
);
await fs.copyFile(
  path.join(root, "desktop", "service.mjs"),
  path.join(out, "service.mjs"),
);
await fs.writeFile(
  path.join(out, "version.json"),
  JSON.stringify(
    {
      app: "qingyan-local",
      version: "2.0.0",
      builtAt: new Date().toISOString(),
      network: "loopback-only",
    },
    null,
    2,
  ),
);
console.log(`Local package ready: ${out}`);
await import("../mobile/build.mjs");
const phoneDirectory = path.join(out, "client", "mobile-install");
await fs.mkdir(phoneDirectory, { recursive: true });
for (const filename of ["清研.js", "清研启动修复版.js", "更新说明-v1.0.1.txt", "先读我-手机安装步骤.txt", "安装说明.html"])
  await fs.copyFile(path.join(root, "outputs", "mobile-app", filename), path.join(phoneDirectory, filename));
