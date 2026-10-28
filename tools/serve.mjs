// Tiny static server for local play. No dependencies.
// Run with: .tools/node/node.exe tools/serve.mjs
// Optional: PORT=8080 .tools/node/node.exe tools/serve.mjs

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";

    const filePath = path.resolve(ROOT, `.${pathname}`);
    if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    const body = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME[extension] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(body);
  } catch (error) {
    const notFound = error && error.code === "ENOENT";
    response.writeHead(notFound ? 404 : 500, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end(notFound ? "Not found" : "Server error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Word Chomp is ready at http://${HOST}:${PORT}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
