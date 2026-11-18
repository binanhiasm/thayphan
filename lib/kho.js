// KHO câu của thầy, lưu trên Redis để trang vận hành sửa được mà không cần deploy.
//   kho:groups  → JSON {rev, groups}: các nhóm câu (từ khoá + câu phán). Chưa có thì dùng bản mặc định trong rules.js.
//   kho:qa      → hash, mỗi trường là khoá của một câu hỏi (matchKey), giá trị JSON {q, a: [câu phán], at}.
//   log:<ngày>  → nhật ký câu hỏi và câu phán của ngày đó (giờ Việt Nam), giữ 90 ngày.
import { DEFAULT_GROUPS, SYSTEM_GROUPS, matchKey } from "../public/js/rules.js";

export const GROUPS_KEY = "kho:groups", QA_KEY = "kho:qa";
export const LOG_DAYS = 90, LOG_MAX = 3000;
export const vnDay = (t) => new Date(t + 7 * 3600_000).toISOString().slice(0, 10);
export const logKey = (day) => `log:${day}`;
export const shiftDay = (day, n) => new Date(Date.parse(day + "T00:00:00Z") + n * 86400_000).toISOString().slice(0, 10);
/** Các ngày từ `from` tới `to` (cả hai đầu), mới nhất trước. */
export function daysBetween(from, to) {
  const out = [];
  for (let d = to; d >= from && out.length < LOG_DAYS + 1; d = shiftDay(d, -1)) out.push(d);
  return out;
}

const str = (v, max) => typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;
const clean = (arr, max, limit) => [...new Set((Array.isArray(arr) ? arr : []).filter((x) => str(x, max)).map((x) => x.trim().replace(/\s+/g, " ")))].slice(0, limit);

export async function loadGroups(store) {
  const raw = await store.get(GROUPS_KEY);
  if (!raw) return { rev: 0, groups: DEFAULT_GROUPS };
  try {
    const j = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(j.groups)) return { rev: j.rev || 0, groups: j.groups };
  } catch { /* dữ liệu hỏng: dùng bản mặc định */ }
  return { rev: 0, groups: DEFAULT_GROUPS };
}

/** Kiểm tra và làm sạch danh sách nhóm. Trả về {groups} hoặc {error}. */
export function cleanGroups(input) {
  if (!Array.isArray(input) || input.length > 60) return { error: "Danh sách nhóm không hợp lệ." };
  const seen = new Set(), groups = [];
  for (const g of input) {
    if (!g || !/^[a-z0-9_-]{1,24}$/.test(g.id || "")) return { error: `Mã nhóm "${g?.id ?? ""}" chỉ dùng chữ thường không dấu, số, - và _.` };
    if (seen.has(g.id)) return { error: `Mã nhóm "${g.id}" bị trùng.` };
    seen.add(g.id);
    const system = SYSTEM_GROUPS.includes(g.id);
    const lines = clean(g.lines, 140, 300);
    const keywords = system ? [] : clean(g.keywords, 40, 80).map((k) => k.toLowerCase());
    if (!lines.length) return { error: `Nhóm "${g.name || g.id}" cần ít nhất một câu phán.` };
    if (!system && !keywords.length) return { error: `Nhóm "${g.name || g.id}" cần ít nhất một từ khoá.` };
    groups.push({ id: g.id, name: str(g.name, 60) ? g.name.trim() : g.id, keywords, lines, ...(system && { system: true }) });
  }
  for (const id of SYSTEM_GROUPS) if (!seen.has(id)) return { error: `Không được xoá nhóm hệ thống "${id}".` };
  return { groups };
}

export async function loadQa(store) {
  const all = await store.hgetall(QA_KEY);
  return Object.entries(all).flatMap(([key, raw]) => {
    try { const e = typeof raw === "string" ? JSON.parse(raw) : raw; return [{ key, q: e.q, a: e.a || [], at: e.at || 0, by: e.by }]; } catch { return []; }
  }).sort((x, y) => y.at - x.at);
}

export async function findQa(store, q) {
  const raw = await store.hget(QA_KEY, matchKey(q));
  if (!raw) return null;
  try { const e = typeof raw === "string" ? JSON.parse(raw) : raw; return Array.isArray(e.a) && e.a.length ? e : null; } catch { return null; }
}

/** Lưu một câu hỏi riêng. Trả về {entry} hoặc {error}. */
export async function saveQa(store, { q, answers, oldKey, by }, now = Date.now()) {
  if (!str(q, 140)) return { error: "Câu hỏi cần từ 1 đến 140 ký tự." };
  const a = clean(answers, 140, 30);
  if (!a.length) return { error: "Cần ít nhất một câu phán (mỗi câu tối đa 140 ký tự)." };
  const key = matchKey(q);
  if (!key) return { error: "Câu hỏi không có nội dung để so khớp." };
  const entry = { q: q.trim(), a, at: now, ...(typeof by === "string" && { by }) };
  await store.hset(QA_KEY, key, JSON.stringify(entry));
  if (oldKey && oldKey !== key) await store.hdel(QA_KEY, oldKey);
  return { entry: { key, ...entry } };
}

/** GET /api/kho: trang chính tải nhóm câu về. Ai cũng đọc được; CDN giữ 60 giây. */
export function createKhoHandler({ store, log = console }) {
  return async function handleKho(req, res) {
    let body;
    try { body = await loadGroups(store); } catch (e) { log.warn("[thayphan] Không đọc được KHO:", e.message); body = { rev: 0, groups: DEFAULT_GROUPS }; }
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=600", "x-content-type-options": "nosniff" });
    res.end(JSON.stringify({ rev: body.rev, groups: body.groups.map(({ id, keywords, lines, system }) => ({ id, keywords, lines, ...(system && { system }) })) }));
  };
}
