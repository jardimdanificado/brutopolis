import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let PORT = parseInt(process.env.PORT || "8080", 10);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json"
};

const server = http.createServer((req, res) => {
  const startTime = Date.now();
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // Default route to index.html
  if (pathname === "/" || pathname === "") {
    pathname = "/index.html";
  }

  // API status route
  if (pathname === "/api/status") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(JSON.stringify({
      name: "Brutopolis",
      status: "online",
      version: "1.0.0",
      nodeVersion: process.version,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Resolve absolute file path and prevent directory traversal
  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, "");
  const filePath = path.join(ROOT_DIR, safePath);

  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("403 Forbidden");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`404 Not Found: ${pathname}`);
      logRequest(req.method, pathname, 404, Date.now() - startTime);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    const headers = {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": ext === ".wasm" || ext === ".png" ? "public, max-age=3600" : "no-cache"
    };

    // Support Gzip compression for text, JS, CSS, and WASM
    const acceptEncoding = req.headers["accept-encoding"] || "";
    const isCompressible = /text|javascript|json|wasm|xml/.test(contentType);

    if (isCompressible && acceptEncoding.includes("gzip")) {
      headers["Content-Encoding"] = "gzip";
      res.writeHead(200, headers);
      const rawStream = fs.createReadStream(filePath);
      const gzipStream = zlib.createGzip();
      rawStream.pipe(gzipStream).pipe(res);
    } else {
      headers["Content-Length"] = stats.size;
      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(res);
    }

    logRequest(req.method, pathname, 200, Date.now() - startTime);
  });
});

function logRequest(method, pathname, status, durationMs) {
  const statusColor = status === 200 ? "\x1b[32m" : status === 404 ? "\x1b[33m" : "\x1b[31m";
  const reset = "\x1b[0m";
  const gray = "\x1b[90m";
  const cyan = "\x1b[36m";
  console.log(
    `${gray}[${new Date().toLocaleTimeString()}]${reset} ${cyan}${method}${reset} ${pathname} ${statusColor}${status}${reset} ${gray}(${durationMs}ms)${reset}`
  );
}

function startServer(port) {
  server.listen(port, HOST, () => {
    PORT = port;
    console.log(`
\x1b[38;5;208m❖ BRUTOPOLIS — Biological Simulation Engine\x1b[0m
\x1b[32m✓ Node.js Frontend & Web Server active\x1b[0m
\x1b[90m──────────────────────────────────────────────\x1b[0m
\x1b[1m➜ Local URL:\x1b[0m    \x1b[36mhttp://localhost:${PORT}\x1b[0m
\x1b[1m➜ Network URL:\x1b[0m  \x1b[36mhttp://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}\x1b[0m
\x1b[1m➜ Health API:\x1b[0m   \x1b[36mhttp://localhost:${PORT}/api/status\x1b[0m
\x1b[90m──────────────────────────────────────────────\x1b[0m
\x1b[90mPressione Ctrl+C para encerrar o servidor.\x1b[0m
`);
  });
}

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(`\x1b[33mPorta ${PORT} em uso, tentando porta ${PORT + 1}...\x1b[0m`);
    startServer(PORT + 1);
  } else {
    console.error("Erro no servidor:", err);
  }
});

startServer(PORT);

process.on("SIGINT", () => {
  console.log("\n\x1b[33mEncerrando servidor Brutopolis...\x1b[0m");
  server.close(() => {
    process.exit(0);
  });
});
