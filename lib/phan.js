// Xử lý /api/phan. Dùng chung cho server.js (chạy trên máy, Railway, Render) và api/phan.js (Vercel).
//   GET  /api/phan  → cấp vé hỏi thầy (token ký HMAC, gắn tên miền, có hạn).
//   POST /api/phan  → hỏi thầy, phải kèm vé trong header x-thay-token.
//
// Các chốt chặn, theo thứ tự:
//   1. Mỗi IP tối đa RATE_PER_MIN lượt mỗi phút.
//   2. Chỉ nhận request từ chính trang (header Origin) và có vé hợp lệ, mỗi vé tối đa TOKEN_USES lượt.
//   3. Câu hỏi nhạy cảm trả câu có sẵn, không gọi AI.
//   4. Mỗi câu hỏi chỉ AI_PER_QUESTION lần phán đầu dùng AI; hỏi lại nữa thì rút quẻ trong kho.
//   5. Câu hỏi đã có đủ CACHE_SIZE câu phán thì xoay vòng các câu đó, không gọi AI.
//   6. Cả trang tối đa DAILY_AI_LIMIT lượt AI mỗi ngày (giờ Việt Nam); quá thì rút quẻ trong kho.
// Mọi trường hợp không gọi AI đều trả 200 với verdict null, trang tự rút quẻ, người dùng không thấy lỗi.
import { safety, normKey } from "../public/js/rules.js";
import { Anthropic } from "./claude.js";
import { issueToken, verifyToken } from "./token.js";

const num = (v, d) => (Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : d);

export function limitsFromEnv(env = process.env) {
  return {
    ratePerMin: num(env.RATE_PER_MIN, 15),
    perQuestion: num(env.AI_PER_QUESTION, 2),
    cacheSize: num(env.CACHE_SIZE, 5),
    daily: num(env.DAILY_AI_LIMIT, 2000),
    tokenTtl: num(env.TOKEN_TTL, 1800),
    tokenUses: num(env.TOKEN_USES, 30),
    // Tên miền khác được phép gọi API, cách nhau dấu phẩy (ví dụ https://thayphan.vn). Chính tên miền của trang luôn được phép.
    origins: String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean)
  };
}

export const cacheKey = (q) => normKey(q).replace(/[\s?!.,…~]+$/u, "");
const vnDay = (t) => new Date(t + 7 * 3600_000).toISOString().slice(0, 10);

function clientIp(req) {
  // Chỉ tin x-forwarded-for khi chạy sau proxy ghi đè header này (Vercel luôn ghi đè).
  if (process.env.VERCEL || process.env.TRUST_PROXY === "1") {
    const xff = req.headers["x-forwarded-for"];
    if (xff) return String(xff).split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "?";
}

// Request có đến từ chính trang không. Trình duyệt luôn gửi Origin khi POST; script không có thì bị chặn.
function fromOurPage(req, limits, needOrigin) {
  const host = req.headers.host, origin = req.headers.origin;
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  if (!origin) return !needOrigin;
  return origin === `https://${host}` || origin === `http://${host}` || limits.origins.includes(origin);
}

export function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
}

async function readJson(req, max = 4096) {
  // Trên Vercel, req.body đã được đọc sẵn; chạy Node thường thì tự đọc luồng.
  if (req.body !== undefined) {
    const b = req.body;
    if (typeof b === "string" || Buffer.isBuffer(b)) {
      if (b.length > max) throw new Error("too_large");
      return JSON.parse(b.toString() || "{}");
    }
    if (JSON.stringify(b ?? {}).length > max) throw new Error("too_large");
    return b ?? {};
  }
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > max) throw new Error("too_large"); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export function createPhanHandler({ store, ask, secret, limits = limitsFromEnv(), now = Date.now, log = console }) {
  if (!secret) throw new Error("createPhanHandler cần secret để ký vé");
  let warnedDay = "";
  const fallback = (res, reason) => send(res, 200, { verdict: null, error: reason });

  return async function handlePhan(req, res) {
    if (req.method !== "POST" && req.method !== "GET") return send(res, 405, { error: "method_not_allowed" });
    const t = now();
    const ip = clientIp(req);

    try {
      if (await store.incr(`rl:${ip}:${Math.floor(t / 60_000)}`, 90) > limits.ratePerMin) return send(res, 429, { error: "rate_limited" });
    } catch (e) { log.warn("[thayphan] Không đọc được bộ đếm:", e.message); return fallback(res, "store_error"); }

    const host = String(req.headers.host || "");
    if (req.method === "GET") {
      if (!fromOurPage(req, limits, false)) return send(res, 403, { error: "forbidden" });
      return send(res, 200, issueToken(secret, host, limits.tokenTtl, t));
    }
    if (!fromOurPage(req, limits, true)) return send(res, 403, { error: "forbidden" });
    const nonce = verifyToken(secret, req.headers["x-thay-token"], host, t);
    if (!nonce) return send(res, 401, { error: "bad_token" });
    try {
      if (await store.incr(`tk:${nonce}`, limits.tokenTtl + 60) > limits.tokenUses) return send(res, 401, { error: "bad_token" });
    } catch (e) { log.warn("[thayphan] Không đọc được bộ đếm:", e.message); return fallback(res, "store_error"); }

    let body;
    try { body = await readJson(req); } catch { return send(res, 400, { error: "bad_request" }); }
    const q = typeof body?.q === "string" ? body.q.normalize("NFC").trim() : "";
    if (!q || q.length > 140) return send(res, 400, { error: "bad_question" });
    const prev = Array.isArray(body.prev) ? body.prev.filter((v) => typeof v === "string" && v.length <= 140).slice(-6) : [];

    const s = safety(q);
    if (s) return send(res, 200, { verdict: s.line, kind: s.kind, source: "rule" });
    if (!ask) return fallback(res, "no_ai");
    if (prev.length >= limits.perQuestion) return fallback(res, "reask");

    const key = `q:${cacheKey(q)}`;
    let cached;
    try {
      cached = await store.list(key);
      const fresh = cached.filter((v) => !prev.includes(v));
      if (cached.length >= limits.cacheSize && fresh.length) {
        return send(res, 200, { verdict: fresh[Math.floor(Math.random() * fresh.length)], source: "cache" });
      }
      const day = vnDay(t);
      if (await store.incr(`day:${day}`, 2 * 86400) > limits.daily) {
        if (warnedDay !== day) { warnedDay = day; log.warn(`[thayphan] Hết ${limits.daily} lượt AI của ngày ${day}. Từ giờ tới hết ngày thầy rút quẻ trong kho.`); }
        return fallback(res, "budget");
      }
    } catch (e) { log.warn("[thayphan] Không đọc được bộ đếm:", e.message); return fallback(res, "store_error"); }

    try {
      const v = await ask(q, prev);
      if (!v) return fallback(res, "no_verdict");
      // Chờ lưu xong rồi mới trả: trên serverless, hàm có thể bị dừng ngay sau khi trả lời.
      if (!cached.includes(v)) await store.push(key, v, limits.cacheSize, 7 * 86400).catch((e) => log.warn("[thayphan] Không lưu được câu phán:", e.message));
      return send(res, 200, { verdict: v, source: "ai" });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) log.warn("[thayphan] Khoá Claude không hợp lệ.");
      else if (e instanceof Anthropic.RateLimitError) log.warn("[thayphan] Claude đang quá tải hoặc chạm giới hạn tài khoản.");
      else log.warn("[thayphan] Không gọi được Claude:", e.status ?? "", e.message);
      return fallback(res, "ai_error");
    }
  };
}
