import http from "node:http";
import fs from "node:fs";
const file = new URL("../outputs/mobile-app/preview.html", import.meta.url);
const server = http.createServer((req, res) => {
  if (req.url !== "/" && req.url !== "/favicon.ico") { res.writeHead(404); res.end(); return; }
  if (req.url === "/favicon.ico") { res.writeHead(204); res.end(); return; }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
});
server.listen(18779, "127.0.0.1", () => console.log("http://127.0.0.1:18779/"));
