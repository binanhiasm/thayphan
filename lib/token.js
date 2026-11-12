// Vé hỏi thầy: server ký bằng HMAC, trang xin vé rồi gửi kèm mỗi lần hỏi.
// Vé gắn với tên miền đã cấp, hết hạn sau TOKEN_TTL giây và chỉ dùng được TOKEN_USES lần.
// Không ai làm giả được vé nếu không có khoá bí mật nằm trên server.
import crypto from "node:crypto";

export function secretFromEnv(env = process.env) {
  if (env.THAYPHAN_SECRET) return env.THAYPHAN_SECRET;
  // Không đặt riêng thì suy ra từ khoá Claude: mọi lần chạy hàm trên Vercel đều ra cùng một khoá bí mật.
  if (env.ANTHROPIC_API_KEY) return crypto.createHash("sha256").update("thayphan-token:" + env.ANTHROPIC_API_KEY).digest("hex");
  return crypto.randomBytes(32).toString("hex");
}

const b64 = (buf) => Buffer.from(buf).toString("base64url");
const sign = (secret, data) => b64(crypto.createHmac("sha256", secret).update(data).digest());

export function issueToken(secret, host, ttlSec, now = Date.now()) {
  const payload = b64(JSON.stringify({ h: host, e: Math.floor(now / 1000) + ttlSec, n: b64(crypto.randomBytes(9)) }));
  return { token: `${payload}.${sign(secret, payload)}`, expiresIn: ttlSec };
}

// Trả về nonce của vé nếu hợp lệ, không thì null.
export function verifyToken(secret, token, host, now = Date.now()) {
  if (typeof token !== "string" || token.length > 300) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const want = Buffer.from(sign(secret, payload)), got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  let p;
  try { p = JSON.parse(Buffer.from(payload, "base64url").toString()); } catch { return null; }
  if (p.h !== host || typeof p.e !== "number" || p.e * 1000 < now || typeof p.n !== "string") return null;
  return p.n;
}
