// API của trang vận hành (/ops/). Chỉ chạy khi có biến OPS_PASSWORD.
// Đăng nhập bằng email + mật khẩu của thành viên (xem members.js), hoặc để trống email và dùng mật khẩu khởi tạo
// OPS_PASSWORD (quyền admin, dùng để tạo thành viên đầu tiên và khi không ai vào được).
// Cookie phiên ký HMAC (HttpOnly, SameSite=Strict, 12 giờ). Đổi OPS_PASSWORD là mọi phiên cũ hết hiệu lực.
//   POST ?a=login {email, password}   GET ?a=me   POST ?a=logout   POST ?a=me-password {current, next}
//   Chỉ admin: GET ?a=members   POST ?a=member-add {email, name, role, password?}
//              POST ?a=member-update {email, name, role}   POST ?a=member-reset {email}   POST ?a=member-del {email}
//   GET  ?a=kho                   → {rev, groups, qa}
//   POST ?a=groups {rev, groups}  → lưu toàn bộ nhóm câu (409 nếu người khác vừa lưu)
//   POST ?a=qa-save {q, answers, oldKey}   POST ?a=qa-del {key}
//   GET  ?a=log&from=&to=&q=&src=&page=&size=&group=  → nhật ký trong khoảng ngày (giờ VN), mới nhất trước,
//        kèm số tổng theo nguồn (theo khoảng ngày và từ tìm kiếm); group=1 gộp các câu hỏi giống nhau
import crypto from "node:crypto";
import { send, readJson, clientIp, fromOurPage } from "./phan.js";
import { ROLES, OWNER, normEmail, validEmail, generatePassword, hashPassword, checkPassword, getMember, listMembers, putMember, delMember, publicMember, issueSession, readSession } from "./members.js";
import { GROUPS_KEY, QA_KEY, LOG_DAYS, loadGroups, cleanGroups, loadQa, saveQa, logKey, vnDay, shiftDay, daysBetween } from "./kho.js";
import { matchKey } from "../public/js/rules.js";

const SOURCES = ["ai", "cache", "kho", "fallback"];
// Tìm không phân biệt hoa thường và dấu: "pho" khớp "Phở".
const fold = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase();
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "") && !Number.isNaN(Date.parse(d));

const COOKIE = "tp_ops", SESSION_SEC = 12 * 3600;
const sha = (s) => crypto.createHash("sha256").update(s).digest();

function cookieOf(req) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return v.join("=");
  }
  return null;
}

export function createOpsHandler({ store, secret, password, now = Date.now, log = console }) {
  const key = password ? sha(`ops:${secret}:${password}`).toString("hex") : null;
  const isHttps = (req) => process.env.VERCEL || req.headers["x-forwarded-proto"] === "https";
  const setCookie = (req, res, value, maxAge) => res.setHeader?.("set-cookie",
    `${COOKIE}=${value}; Path=/api/ops; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isHttps(req) ? "; Secure" : ""}`);

  const ownerUser = { email: OWNER, name: "Chủ trang", role: "admin", ver: 0 };
  // Người đang đăng nhập, hoặc null nếu phiên hỏng, hết hạn, hoặc tài khoản đã bị đổi/xoá.
  async function whoIs(req) {
    const p = readSession(key, cookieOf(req), now());
    if (!p) return null;
    if (p.sub === OWNER) return p.ver === 0 ? ownerUser : null;
    const m = await getMember(store, p.sub);
    return m && m.ver === p.ver ? m : null;
  }
  const login = (req, res, user) => setCookie(req, res, issueSession(key, user.email, user.ver, SESSION_SEC, now()), SESSION_SEC);

  return async function handleOps(req, res) {
    if (!password) return send(res, 404, { error: "ops_disabled" });
    const url = new URL(req.url || "/", "http://x");
    const a = url.searchParams.get("a") || "";
    const post = req.method === "POST";
    if (!post && req.method !== "GET") return send(res, 405, { error: "method_not_allowed" });
    // Mọi lệnh ghi phải đến từ chính trang (chống trang khác gửi hộ bằng cookie của mình).
    if (post && !fromOurPage(req, { origins: [] }, true)) return send(res, 403, { error: "forbidden" });

    try {
      if (a === "login" && post) {
        const failKey = `opsfail:${clientIp(req)}`;
        if (Number(await store.get(failKey)) >= 10) return send(res, 429, { error: "Sai quá nhiều lần, thử lại sau 15 phút." });
        const body = await readJson(req).catch(() => ({}));
        const email = normEmail(body.email);
        let user = null;
        if (!email) {
          if (typeof body.password === "string" && crypto.timingSafeEqual(sha(body.password), sha(password))) user = ownerUser;
        } else {
          const m = await getMember(store, email);
          // Vẫn băm khi không có tài khoản để thời gian trả lời như nhau, không lộ email nào có tồn tại.
          const ok = await checkPassword(body.password, m || { salt: "AAAAAAAAAAAAAAAAAAAAAA", hash: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" });
          if (m && ok) user = m;
        }
        if (!user) { await store.incr(failKey, 900); return send(res, 401, { error: email ? "Sai email hoặc mật khẩu." : "Sai mật khẩu khởi tạo." }); }
        login(req, res, user);
        return send(res, 200, { ok: true });
      }
      if (a === "logout" && post) { setCookie(req, res, "", 0); return send(res, 200, { ok: true }); }

      const user = await whoIs(req);
      if (!user) return send(res, 401, { error: "login" });
      const isAdmin = user.role === "admin";

      if (a === "me") return send(res, 200, { ok: true, today: vnDay(now()), user: publicMember(user) });

      if (a === "me-password" && post) {
        if (user.email === OWNER) return send(res, 400, { error: "Mật khẩu khởi tạo đổi bằng biến OPS_PASSWORD trên Vercel." });
        const { current, next } = await readJson(req);
        if (!(await checkPassword(current, user))) return send(res, 400, { error: "Mật khẩu hiện tại không đúng." });
        if (typeof next !== "string" || next.length < 10 || next.length > 200) return send(res, 400, { error: "Mật khẩu mới cần từ 10 ký tự." });
        const m = { ...user, ...(await hashPassword(next)), ver: user.ver + 1 };
        await putMember(store, m);
        login(req, res, m); // giữ phiên này, các phiên khác của người này bị đăng xuất
        return send(res, 200, { ok: true });
      }

      if (a.startsWith("member")) {
        if (!isAdmin) return send(res, 403, { error: "Chỉ admin mới quản lý được thành viên." });
        if (a === "members" && !post) return send(res, 200, { members: (await listMembers(store)).map(publicMember), roles: ROLES });
        if (!post) return send(res, 405, { error: "method_not_allowed" });
        const body = await readJson(req);
        const email = normEmail(body.email);
        const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
        if (a === "member-add") {
          if (!validEmail(email)) return send(res, 400, { error: "Email không hợp lệ." });
          if (!ROLES.includes(body.role)) return send(res, 400, { error: "Quyền phải là admin hoặc ops." });
          if (await getMember(store, email)) return send(res, 409, { error: "Email này đã là thành viên." });
          const given = typeof body.password === "string" ? body.password : "";
          if (given && (given.length < 10 || given.length > 200)) return send(res, 400, { error: "Mật khẩu cần từ 10 ký tự." });
          const pw = given || generatePassword();
          const m = { email, name, role: body.role, ...(await hashPassword(pw)), ver: 1, at: now(), by: user.email };
          await putMember(store, m);
          return send(res, 200, { member: publicMember(m), password: pw });
        }
        const m = await getMember(store, email);
        if (!m) return send(res, 404, { error: "Không tìm thấy thành viên." });
        const self = email === user.email;
        if (a === "member-update") {
          if (body.role !== undefined && !ROLES.includes(body.role)) return send(res, 400, { error: "Quyền phải là admin hoặc ops." });
          if (self && body.role && body.role !== m.role) return send(res, 400, { error: "Không tự đổi quyền của mình được." });
          const roleChanged = body.role && body.role !== m.role;
          const next = { ...m, name: body.name !== undefined ? name : m.name, role: body.role || m.role, ver: roleChanged ? m.ver + 1 : m.ver };
          await putMember(store, next);
          return send(res, 200, { member: publicMember(next) });
        }
        if (a === "member-reset") {
          if (self) return send(res, 400, { error: "Đổi mật khẩu của mình ở mục Đổi mật khẩu." });
          const pw = generatePassword();
          await putMember(store, { ...m, ...(await hashPassword(pw)), ver: m.ver + 1 });
          return send(res, 200, { password: pw });
        }
        if (a === "member-del") {
          if (self) return send(res, 400, { error: "Không tự xoá mình được." });
          await delMember(store, email);
          return send(res, 200, { ok: true });
        }
        return send(res, 404, { error: "not_found" });
      }
      if (a === "kho" && !post) {
        const [g, qa] = await Promise.all([loadGroups(store), loadQa(store)]);
        return send(res, 200, { ...g, qa });
      }
      if (a === "groups" && post) {
        const body = await readJson(req, 400_000);
        const cur = await loadGroups(store);
        if ((body.rev || 0) !== cur.rev) return send(res, 409, { error: "Có người vừa lưu nhóm câu. Tải lại trang rồi sửa lại." });
        const r = cleanGroups(body.groups);
        if (r.error) return send(res, 400, { error: r.error });
        const next = { rev: cur.rev + 1, groups: r.groups, by: user.email, at: now() };
        await store.set(GROUPS_KEY, JSON.stringify(next));
        return send(res, 200, next);
      }
      if (a === "qa-save" && post) {
        const r = await saveQa(store, { ...(await readJson(req, 20_000)), by: user.email }, now());
        return r.error ? send(res, 400, { error: r.error }) : send(res, 200, r.entry);
      }
      if (a === "qa-del" && post) {
        const { key: k } = await readJson(req);
        if (typeof k !== "string" || !k) return send(res, 400, { error: "Thiếu khoá câu hỏi." });
        await store.hdel(QA_KEY, k);
        return send(res, 200, { ok: true });
      }
      if (a === "log" && !post) {
        const p = url.searchParams, today = vnDay(now());
        let to = isDay(p.get("to")) ? p.get("to") : today;
        if (to > today) to = today;
        let from = isDay(p.get("from")) ? p.get("from") : to;
        if (from > to) [from, to] = [to, from];
        if (from < shiftDay(to, -(LOG_DAYS - 1))) from = shiftDay(to, -(LOG_DAYS - 1));
        const src = SOURCES.includes(p.get("src")) ? p.get("src") : "";
        const size = [20, 50, 100].includes(Number(p.get("size"))) ? Number(p.get("size")) : 20;
        const days = daysBetween(from, to);
        // Gõ không dấu thì tìm bỏ qua dấu; gõ có dấu thì tìm đúng dấu ("phở" không khớp "phỏng").
        const raw = String(p.get("q") || "").normalize("NFC").toLowerCase().trim().slice(0, 100);
        const exact = /[^\x00-\x7f]/.test(raw), needle = exact ? raw : fold(raw);
        const has = (s) => (exact ? String(s || "").normalize("NFC").toLowerCase() : fold(s)).includes(needle);
        const all = (await store.lists(days.map(logKey))).flatMap((list) => list.slice().reverse().flatMap((raw) => {
          try { return [typeof raw === "string" ? JSON.parse(raw) : raw]; } catch { return []; }
        })).filter((r) => !needle || has(r.q) || has(r.v));
        const counts = { total: all.length, ai: 0, cache: 0, kho: 0, fallback: 0 };
        for (const r of all) if (r.src in counts) counts[r.src]++;
        let items = src ? all.filter((r) => r.src === src) : all;
        if (p.get("group") === "1") {
          const g = new Map();
          for (const r of items) {
            const k = matchKey(r.q);
            const e = g.get(k) || { key: k, q: r.q, n: 0, last: r.t, verdicts: [], srcs: [] };
            e.n++;
            if (r.v && !e.verdicts.includes(r.v) && e.verdicts.length < 8) e.verdicts.push(r.v);
            if (!e.srcs.includes(r.src)) e.srcs.push(r.src);
            g.set(k, e);
          }
          items = [...g.values()].sort((x, y) => y.n - x.n || y.last - x.last);
        }
        const pages = Math.max(1, Math.ceil(items.length / size));
        const page = Math.min(Math.max(1, Number(p.get("page")) || 1), pages);
        return send(res, 200, { from, to, today, src, q: p.get("q") || "", size, page, pages, matched: items.length, counts, rows: items.slice((page - 1) * size, page * size) });
      }
      return send(res, 404, { error: "not_found" });
    } catch (e) {
      log.warn("[thayphan] Lỗi trang vận hành:", e.message);
      return send(res, 500, { error: "Không đọc/ghi được dữ liệu. Thử lại sau." });
    }
  };
}
