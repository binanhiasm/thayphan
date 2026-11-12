// Server của Thầy Phán khi chạy trên máy hoặc trên Railway/Render: phục vụ trang và API /api/phan.
// Trên Vercel thì không dùng file này: trang lấy từ public/, API chạy ở api/phan.js.
// Chạy: npm install && node --env-file=.env server.js   (thiếu ANTHROPIC_API_KEY thì thầy dùng kho câu dự phòng)
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeAsk, MODEL } from "./lib/claude.js";
import { createPhanHandler, limitsFromEnv, send } from "./lib/phan.js";
import { storeFromEnv } from "./lib/store.js";
import { secretFromEnv } from "./lib/token.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, "public");
const PORT = Number(process.env.PORT) || 3000;

const ask = makeAsk();
const store = storeFromEnv();
const limits = limitsFromEnv();
const handlePhan = createPhanHandler({ store, ask, limits, secret: secretFromEnv() });

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".gif": "image/gif" };

function text(res, status, body) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" });
  res.end(body);
}

async function serveStatic(req, res) {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { return text(res, 400, "Bad request"); }
  const file = path.normalize(path.join(PUBLIC, urlPath === "/" ? "index.html" : urlPath));
  if (!file.startsWith(PUBLIC + path.sep)) return text(res, 403, "Forbidden");
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "public, max-age=300", "x-content-type-options": "nosniff" });
    res.end(data);
  } catch { text(res, 404, "Không tìm thấy"); }
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/phan")) return handlePhan(req, res);
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "method_not_allowed" });
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`[thayphan] Quán trà mở ở http://localhost:${PORT} (model: ${MODEL}${ask ? "" : ", chưa có AI"})`);
  console.log(`[thayphan] Bộ đếm: ${store.kind}. Giới hạn: ${limits.daily} lượt AI/ngày, ${limits.perQuestion} lượt AI/câu hỏi, nhớ ${limits.cacheSize} câu/câu hỏi, ${limits.ratePerMin} lượt/phút/IP.`);
});
