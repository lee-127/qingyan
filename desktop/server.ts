import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { LocalStore, StoreError } from "./store";
import { ICloudFileSync } from "./icloud-sync";
const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.QINGYAN_PORT || 18766);
const dataDirectory =
  process.env.QINGYAN_DATA_DIR ||
  path.join(
    process.env.LOCALAPPDATA || path.join(here, ".."),
    "QingyanStudy",
    "data",
  );
const store = new LocalStore(dataDirectory);
const cloud = new ICloudFileSync(store);
cloud.start();
const client = path.join(here, "client");
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".json": "application/json",
};
const uploadTypes: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  zip: "application/zip",
};
function json(response: http.ServerResponse, status: number, value: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
}
async function body(request: http.IncomingMessage, limit: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new StoreError(413, "文件过大，请选择较小的文件");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function input(request: http.IncomingMessage) {
  try {
    return JSON.parse((await body(request, 8 * 1024 * 1024)).toString("utf8"));
  } catch (e) {
    if (e instanceof StoreError) throw e;
    throw new StoreError(400, "数据格式有误");
  }
}
function sendFile(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  filename: string,
  mime: string,
  downloadName?: string,
  force = false,
) {
  const stat = fs.statSync(filename);
  const headers: Record<string, string | number> = {
    "Content-Type": mime,
    "Content-Length": stat.size,
    "Accept-Ranges": "bytes",
    "Cache-Control": downloadName ? "no-store" : "no-cache",
  };
  if (downloadName) {
    const inline = mime.startsWith("image/") || mime === "application/pdf";
    headers["Content-Disposition"] =
      `${inline && !force ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
  }
  if (request.headers.range) {
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
    if (!range) throw new StoreError(416, "不支持的文件范围");
    const start = range[1]
      ? Number(range[1])
      : Math.max(0, stat.size - Number(range[2]));
    const end =
      range[1] && range[2]
        ? Math.min(stat.size - 1, Number(range[2]))
        : stat.size - 1;
    if (start > end || start >= stat.size)
      throw new StoreError(416, "文件范围超出大小");
    headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
    headers["Content-Length"] = end - start + 1;
    response.writeHead(206, headers);
    fs.createReadStream(filename, { start, end }).pipe(response);
    return;
  }
  response.writeHead(200, headers);
  if (request.method === "HEAD") response.end();
  else fs.createReadStream(filename).pipe(response);
}
const server = http.createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
  );
  try {
    const authority = request.headers.host || "";
    if (authority !== `127.0.0.1:${port}` && authority !== `localhost:${port}`)
      throw new StoreError(403, "此程序仅供本机使用");
    const origin = request.headers.origin;
    if (origin && origin !== `http://${authority}`)
      throw new StoreError(403, "不允许跨站访问本机资料");
    if (request.headers["sec-fetch-site"] === "cross-site")
      throw new StoreError(403, "请从清研桌面入口访问");
    const url = new URL(request.url || "/", `http://${authority}`);
    const method = request.method;
    const pathname = url.pathname;
    if (pathname === "/api/v1/local/health" && method === "GET") {
      json(response, 200, {
        app: "qingyan-local",
        version: "2.0.0",
        mode: "local",
        offline: true,
        instance: createHash("sha256")
          .update(path.resolve(dataDirectory))
          .digest("hex")
          .slice(0, 16),
      });
      return;
    }
    if (pathname === "/api/v1/local/info" && method === "GET") {
      json(response, 200, {
        mode: "local",
        dataDirectory,
        automaticBackups: path.join(dataDirectory, "automatic-backups"),
      });
      return;
    }
    if (pathname === "/api/v1/access" && method === "GET") {
      json(response, 200, { authorized: true, mode: "local" });
      return;
    }
    if (pathname === "/api/v1/records" && method === "GET") {
      await cloud.refreshIfDue();
      json(response, 200, store.all());
      return;
    }
    const record = /^\/api\/v1\/records\/([a-z]+)(?:\/([^/]+))?$/.exec(
      pathname,
    );
    if (record && method === "POST" && !record[2]) {
      const value = await input(request);
      const saved = store.save(record[1], value);
      cloud.markDirty();
      json(response, value?.id ? 200 : 201, saved);
      return;
    }
    if (record && method === "DELETE" && record[2]) {
      store.remove(record[1], decodeURIComponent(record[2]));
      cloud.markDirty();
      json(response, 200, { ok: true });
      return;
    }
    if (pathname === "/api/v1/assets" && method === "POST") {
      const bytes = await body(request, 21 * 1024 * 1024);
      const parsed = new Request(`http://${authority}/`, {
        method: "POST",
        headers: { "Content-Type": request.headers["content-type"] || "" },
        body: bytes,
      });
      let form: FormData;
      try {
        form = await parsed.formData();
      } catch {
        throw new StoreError(400, "上传文件格式有误");
      }
      const file = form.get("file");
      if (!(file instanceof File) || !file.size)
        throw new StoreError(400, "请选择非空文件");
      if (file.size > 20 * 1024 * 1024)
        throw new StoreError(400, "单个文件不能超过 20 MB");
      const mime = uploadTypes[file.name.split(".").pop()?.toLowerCase() || ""];
      if (!mime)
        throw new StoreError(400, "支持 PDF、Word、文本、图片及 ZIP 文件");
      const asset = store.addAsset(
        {
          id: crypto.randomUUID(),
          name: file.name.slice(0, 200),
          mime,
          size: file.size,
        },
        new Uint8Array(await file.arrayBuffer()),
      );
      json(response, 201, asset);
      cloud.markDirty();
      return;
    }
    const assetMatch = /^\/api\/v1\/assets\/([^/]+)$/.exec(pathname);
    if (assetMatch && (method === "GET" || method === "HEAD")) {
      const asset = store.asset(assetMatch[1]);
      if (!asset || !fs.existsSync(store.filePath(asset.id)))
        throw new StoreError(404, "文件不存在");
      sendFile(
        request,
        response,
        store.filePath(asset.id),
        asset.mime,
        asset.name,
        url.searchParams.has("download"),
      );
      return;
    }
    if (pathname === "/api/v1/local/backup" && method === "GET") {
      const zip = await store.exportBackup();
      response.writeHead(200, {
        "Content-Type": "application/zip",
        "Cache-Control": "no-store",
        "Content-Length": zip.length,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`清研完整备份-${new Date().toISOString().slice(0, 10)}.zip`)}`,
      });
      response.end(zip);
      return;
    }
    if (pathname === "/api/v1/local/restore" && method === "POST") {
      const result = await store.importBackup(
        await body(request, 512 * 1024 * 1024),
      );
      cloud.markDirty();
      json(response, 200, result);
      return;
    }
    if (pathname === "/api/v1/local/icloud/status" && method === "GET") {
      json(response, 200, cloud.status(url.searchParams.has("refresh")));
      return;
    }
    if (pathname === "/api/v1/local/icloud/connect" && method === "POST") {
      const value = await input(request);
      if (value?.folder !== undefined && typeof value.folder !== "string")
        throw new StoreError(400, "同步目录格式有误");
      json(response, 200, await cloud.connect(value?.folder));
      return;
    }
    if (pathname === "/api/v1/local/icloud/disconnect" && method === "POST") {
      json(response, 200, cloud.disconnect());
      return;
    }
    if (pathname === "/api/v1/local/icloud/push" && method === "POST") {
      json(response, 200, await cloud.push());
      return;
    }
    if (pathname === "/api/v1/local/icloud/pull" && method === "POST") {
      json(response, 200, await cloud.pull());
      return;
    }
    if (pathname === "/api/v1/local/icloud/import" && method === "POST") {
      const safety = path.join(dataDirectory, "automatic-backups");
      fs.mkdirSync(safety, { recursive: true });
      fs.writeFileSync(
        path.join(safety, `before-sync-import-${Date.now()}.zip`),
        await store.exportBackup(),
      );
      const result = await store.importBackup(
        await body(request, 512 * 1024 * 1024),
        { sync: true },
      );
      cloud.markDirty();
      json(response, 200, result);
      return;
    }
    if (pathname.startsWith("/api/")) throw new StoreError(404, "接口不存在");
    if (method !== "GET" && method !== "HEAD")
      throw new StoreError(405, "不支持此操作");
    let relative: string;
    try {
      relative = decodeURIComponent(pathname);
    } catch {
      throw new StoreError(400, "网址格式有误");
    }
    const filename = path.resolve(
      client,
      "." + (relative === "/" ? "/index.html" : relative),
    );
    if (filename !== client && !filename.startsWith(client + path.sep))
      throw new StoreError(403, "路径不允许访问");
    if (!fs.existsSync(filename) || !fs.statSync(filename).isFile())
      throw new StoreError(404, "页面不存在");
    sendFile(
      request,
      response,
      filename,
      types[path.extname(filename)] || "application/octet-stream",
    );
  } catch (e) {
    if (response.headersSent) {
      response.destroy();
      return;
    }
    if (e instanceof StoreError) json(response, e.status, { error: e.message });
    else {
      console.error(new Date().toISOString(), e);
      json(response, 500, {
        error: "操作未完成，请稍后重试。资料仍保存在本机。",
      });
    }
  }
});
server.requestTimeout = 120000;
server.listen(port, "127.0.0.1", () =>
  console.log(`Qingyan local ready at http://127.0.0.1:${port}/`),
);
server.on("error", (e) => {
  console.error(e);
  store.close();
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    }),
  );
export { server };
