// Thành viên trang vận hành: đăng nhập bằng email + mật khẩu, hai quyền:
//   admin → làm mọi việc, kể cả quản lý thành viên
//   ops   → xem lịch sử, sửa KHO câu hỏi và nhóm câu
// Lưu ở Redis hash `ops:members`, mỗi trường là email (chữ thường), giá trị JSON {email, name, role, salt, hash, ver, at, by}.
// Mật khẩu băm bằng scrypt, không bao giờ lưu hay trả về bản gốc.
// `ver` tăng mỗi lần đặt lại mật khẩu, đổi quyền hoặc xoá: mọi phiên cũ của người đó hết hiệu lực ngay.
import crypto from "node:crypto";

export const MEMBERS_KEY = "ops:members";
export const ROLES = ["admin", "ops"];
export const OWNER = "owner"; // đăng nhập bằng mật khẩu khởi tạo OPS_PASSWORD, quyền admin

const b64 = (buf) => Buffer.from(buf).toString("base64url");
const scrypt = (pw, salt) => new Promise((ok, fail) => crypto.scrypt(pw, salt, 32, (e, k) => (e ? fail(e) : ok(k))));

export const normEmail = (e) => String(e || "").trim().toLowerCase();
export const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e);

// Bỏ các ký tự dễ nhầm (0/O, 1/l/I). 4 cụm × 4 ký tự ≈ 90 bit ngẫu nhiên.
const ALPHA = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generatePassword(groups = 4, size = 4) {
  const out = [];
  for (let g = 0; g < groups; g++) {
    let s = "";
    for (let i = 0; i < size; i++) s += ALPHA[crypto.randomInt(ALPHA.length)];
    out.push(s);
  }
  return out.join("-");
}

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return { salt: b64(salt), hash: b64(await scrypt(pw, salt)) };
}

export async function checkPassword(pw, m) {
  if (typeof pw !== "string" || !m?.salt || !m?.hash) return false;
  const got = await scrypt(pw, Buffer.from(m.salt, "base64url")), want = Buffer.from(m.hash, "base64url");
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

const parse = (raw) => { try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; } };
export const publicMember = ({ email, name, role, at, by }) => ({ email, name, role, at, by });

export async function getMember(store, email) {
  const raw = await store.hget(MEMBERS_KEY, normEmail(email));
  return raw ? parse(raw) : null;
}

export async function listMembers(store) {
  return Object.values(await store.hgetall(MEMBERS_KEY)).map(parse).filter(Boolean).sort((a, b) => a.at - b.at);
}

export const putMember = (store, m) => store.hset(MEMBERS_KEY, m.email, JSON.stringify(m));
export const delMember = (store, email) => store.hdel(MEMBERS_KEY, normEmail(email));

// ---------- phiên đăng nhập ----------
// Cookie = base64url({sub, ver, exp}) + "." + HMAC. Mỗi lần dùng, server đọc lại thành viên để chắc `ver` còn khớp.
const sign = (key, data) => b64(crypto.createHmac("sha256", key).update(data).digest());

export function issueSession(key, sub, ver, ttlSec, now = Date.now()) {
  const payload = b64(JSON.stringify({ sub, ver, exp: Math.floor(now / 1000) + ttlSec }));
  return `${payload}.${sign(key, payload)}`;
}

export function readSession(key, token, now = Date.now()) {
  if (typeof token !== "string" || token.length > 600) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const want = Buffer.from(sign(key, payload)), got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  const p = parse(Buffer.from(payload, "base64url").toString());
  if (!p || typeof p.sub !== "string" || typeof p.exp !== "number" || p.exp * 1000 < now) return null;
  return p;
}
