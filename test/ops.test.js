import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createOpsHandler } from "../lib/ops.js";
import { createPhanHandler } from "../lib/phan.js";
import { createKhoHandler, saveQa, cleanGroups } from "../lib/kho.js";
import { memoryStore } from "../lib/store.js";
import { issueToken } from "../lib/token.js";
import { DEFAULT_GROUPS, matchKey, setKho, categoryOf, BANK } from "../public/js/rules.js";

const SECRET = "test-secret", HOST = "thayphan.test", PW = "mat-khau-thu";
const quiet = { warn() {} };
const limits = { ratePerMin: 100, perQuestion: 2, cacheSize: 3, daily: 1000, tokenTtl: 1800, tokenUses: 1000, origins: [] };

function request(handler, { method = "GET", url = "/", body, headers = {} } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { method, url, socket: { remoteAddress: "1.1.1.1" }, headers: { host: HOST, ...headers } });
  return new Promise((resolve) => {
    const res = {
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      writeHead(status, h) { this.status = status; Object.assign(this.headers, h); },
      end(b) { resolve({ status: this.status, headers: this.headers, body: b ? JSON.parse(b) : null }); }
    };
    handler(req, res);
  });
}
const origin = { origin: `https://${HOST}` };

async function login(h) {
  const r = await request(h, { method: "POST", url: "/api/ops?a=login", body: { password: PW }, headers: origin });
  assert.equal(r.status, 200);
  return r.headers["set-cookie"].split(";")[0];
}

test("khoá so khớp gộp các cách hỏi giống nhau", () => {
  assert.equal(matchKey("Thầy ơi, phở hay bún chả?"), matchKey("bún chả hay phở"));
  assert.equal(matchKey("Có nên nhắn tin cho người yêu cũ không ạ?"), matchKey("nhắn tin cho người yêu cũ"));
  assert.notEqual(matchKey("ăn gì"), matchKey("uống gì"));
});

test("trang vận hành tắt khi chưa có OPS_PASSWORD", async () => {
  const h = createOpsHandler({ store: memoryStore(), secret: SECRET, password: "" });
  assert.equal((await request(h, { url: "/api/ops?a=me" })).status, 404);
});

test("phải đăng nhập đúng mật khẩu, cookie HttpOnly và chỉ dùng cho /api/ops", async () => {
  const h = createOpsHandler({ store: memoryStore(), secret: SECRET, password: PW, log: quiet });
  assert.equal((await request(h, { url: "/api/ops?a=kho" })).status, 401);
  assert.equal((await request(h, { method: "POST", url: "/api/ops?a=login", body: { password: "sai" }, headers: origin })).status, 401);
  const r = await request(h, { method: "POST", url: "/api/ops?a=login", body: { password: PW }, headers: origin });
  assert.match(r.headers["set-cookie"], /HttpOnly; SameSite=Strict/);
  assert.match(r.headers["set-cookie"], /Path=\/api\/ops/);
  const cookie = r.headers["set-cookie"].split(";")[0];
  assert.equal((await request(h, { url: "/api/ops?a=kho", headers: { cookie } })).status, 200);
  // Cookie của mật khẩu cũ hết hiệu lực khi đổi mật khẩu.
  const h2 = createOpsHandler({ store: memoryStore(), secret: SECRET, password: "mat-khau-moi", log: quiet });
  assert.equal((await request(h2, { url: "/api/ops?a=kho", headers: { cookie } })).status, 401);
});

test("đăng nhập sai quá 10 lần thì bị khoá tạm", async () => {
  const h = createOpsHandler({ store: memoryStore(), secret: SECRET, password: PW, log: quiet });
  for (let i = 0; i < 10; i++) await request(h, { method: "POST", url: "/api/ops?a=login", body: { password: "sai" }, headers: origin });
  assert.equal((await request(h, { method: "POST", url: "/api/ops?a=login", body: { password: PW }, headers: origin })).status, 429);
});

test("lệnh ghi từ trang khác bị chặn dù có cookie", async () => {
  const h = createOpsHandler({ store: memoryStore(), secret: SECRET, password: PW, log: quiet });
  const cookie = await login(h);
  const r = await request(h, { method: "POST", url: "/api/ops?a=qa-save", body: { q: "a", answers: ["b"] }, headers: { cookie, origin: "https://trang-xau.com" } });
  assert.equal(r.status, 403);
});

test("câu hỏi riêng trong KHO được trả lời mà không gọi AI, và ghi nhật ký", async () => {
  const store = memoryStore();
  const h = createOpsHandler({ store, secret: SECRET, password: PW, log: quiet });
  const cookie = await login(h);
  const s = await request(h, { method: "POST", url: "/api/ops?a=qa-save", body: { q: "Phở hay bún chả?", answers: ["Bún chả. Phở để mai.", "  "] }, headers: { cookie, ...origin } });
  assert.equal(s.status, 200);
  assert.deepEqual(s.body.a, ["Bún chả. Phở để mai."]);

  let aiCalls = 0;
  const phan = createPhanHandler({ secret: SECRET, store, ask: async () => { aiCalls++; return { verdict: "AI", model: "m" }; }, limits, log: quiet });
  const { token } = issueToken(SECRET, HOST, 3600);
  const ask = (q, prev = []) => request(phan, { method: "POST", body: { q, prev }, headers: { ...origin, "x-thay-token": token } }).then((r) => r.body);
  // Câu đầu tiên của người mới luôn để AI phán.
  assert.equal((await ask("Phở hay bún chả?")).source, "ai");
  assert.equal(aiCalls, 1);
  assert.deepEqual(await ask("Thầy ơi bún chả hay phở"), { verdict: "Bún chả. Phở để mai.", source: "kho" });
  assert.equal(aiCalls, 1);
  // Hết câu trong KHO cho người này thì mới gọi AI.
  assert.equal((await ask("bún chả hay phở", ["Bún chả. Phở để mai."])).source, "ai");
  assert.equal(aiCalls, 2);

  const log = await request(h, { url: "/api/ops?a=log", headers: { cookie } });
  assert.deepEqual(log.body.rows.map((r) => r.src), ["ai", "kho", "ai"]);
  assert.equal(log.body.rows[0].model, "m");
  assert.equal(log.body.rows[0].ip, undefined);
});

test("câu nhạy cảm không bị ghi nhật ký", async () => {
  const store = memoryStore();
  const phan = createPhanHandler({ secret: SECRET, store, ask: async () => "x", limits, log: quiet });
  const { token } = issueToken(SECRET, HOST, 3600);
  await request(phan, { method: "POST", body: { q: "Con muốn chết" }, headers: { ...origin, "x-thay-token": token } });
  const h = createOpsHandler({ store, secret: SECRET, password: PW, log: quiet });
  const log = await request(h, { url: "/api/ops?a=log", headers: { cookie: await login(h) } });
  assert.deepEqual(log.body.rows, []);
});

test("lưu nhóm câu: kiểm tra dữ liệu, chặn ghi đè khi người khác vừa lưu, trang chính tải được", async () => {
  const store = memoryStore();
  const h = createOpsHandler({ store, secret: SECRET, password: PW, log: quiet });
  const cookie = await login(h);
  const save = (rev, groups) => request(h, { method: "POST", url: "/api/ops?a=groups", body: { rev, groups }, headers: { cookie, ...origin } });

  const noSystem = DEFAULT_GROUPS.filter((g) => g.id !== "any");
  assert.equal((await save(0, noSystem)).status, 400);
  const groups = [{ id: "hoc", name: "Học tập", keywords: ["ôn thi", "học bài"], lines: ["Học đi. Điểm không tự lên."] }, ...DEFAULT_GROUPS];
  const ok = await save(0, groups);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.rev, 1);
  assert.equal((await save(0, groups)).status, 409);

  const kho = await request(createKhoHandler({ store }), {});
  assert.match(kho.headers["cache-control"], /s-maxage=60/);
  assert.ok(setKho(kho.body.groups));
  assert.equal(categoryOf("Tối nay có nên ôn thi không?"), "hoc");
  assert.deepEqual(BANK.hoc, ["Học đi. Điểm không tự lên."]);
  setKho(DEFAULT_GROUPS);
});

test("cleanGroups bỏ dòng trống và câu quá dài", () => {
  const r = cleanGroups(DEFAULT_GROUPS.map((g) => (g.id === "food" ? { ...g, lines: [...g.lines, "", "x".repeat(200)] } : g)));
  assert.equal(r.groups.find((g) => g.id === "food").lines.length, DEFAULT_GROUPS.find((g) => g.id === "food").lines.length);
});

test("saveQa từ chối câu hỏi không có câu phán", async () => {
  assert.ok((await saveQa(memoryStore(), { q: "abc", answers: [] })).error);
});


test("nhật ký: lọc theo khoảng ngày, theo nguồn, phân trang và đếm tổng", async () => {
  const store = memoryStore();
  const DAY = 86400_000, now = Date.parse("2026-11-19T05:00:00Z"); // 12:00 giờ VN
  const put = (daysAgo, src, i) => store.logPush(`log:${new Date(now - daysAgo * DAY + 7 * 3600_000).toISOString().slice(0, 10)}`,
    JSON.stringify({ t: now - daysAgo * DAY + i, q: `câu ${daysAgo}-${i}`, v: src === "fallback" ? null : "v", src }), 3000, 86400);
  for (let i = 0; i < 25; i++) await put(0, i < 10 ? "ai" : "kho", i);
  for (let i = 0; i < 5; i++) await put(1, "fallback", i);
  for (let i = 0; i < 3; i++) await put(40, "cache", i);

  const h = createOpsHandler({ store, secret: SECRET, password: PW, now: () => now, log: quiet });
  const cookie = await login(h);
  const get = (q) => request(h, { url: `/api/ops?a=log${q}`, headers: { cookie } }).then((r) => r.body);

  const today = await get("");
  assert.deepEqual(today.counts, { total: 25, ai: 10, cache: 0, kho: 15, fallback: 0 });
  assert.equal(today.rows.length, 20);
  assert.equal(today.pages, 2);
  assert.equal(today.rows[0].q, "câu 0-24"); // mới nhất trước
  assert.equal((await get("&page=2")).rows.length, 5);
  assert.equal((await get("&size=50")).rows.length, 25);

  const week = await get("&from=2026-11-13&to=2026-11-19");
  assert.equal(week.counts.total, 30);
  assert.equal(week.counts.fallback, 5);
  const onlyAi = await get("&from=2026-11-13&to=2026-11-19&src=ai");
  assert.equal(onlyAi.matched, 10);
  assert.equal(onlyAi.counts.total, 30); // số tổng vẫn tính cả khoảng
  assert.equal((await get("&from=2026-08-01&to=2026-11-19")).counts.cache, 3);
  // Ngày tương lai bị kéo về hôm nay; khoảng ngược được đảo lại.
  assert.equal((await get("&from=2026-11-19&to=2027-01-01")).to, "2026-11-19");
  assert.equal((await get("&from=2026-11-19&to=2026-11-18")).from, "2026-11-18");
});

test("nhật ký: gộp câu hỏi giống nhau, đếm số lần", async () => {
  const store = memoryStore();
  const now = Date.parse("2026-11-19T05:00:00Z");
  for (const q of ["Phở hay bún chả?", "thầy ơi bún chả hay phở", "Ăn gì?"]) {
    await store.logPush("log:2026-11-19", JSON.stringify({ t: now, q, v: "x", src: "ai" }), 3000, 86400);
  }
  const h = createOpsHandler({ store, secret: SECRET, password: PW, now: () => now, log: quiet });
  const r = await request(h, { url: "/api/ops?a=log&group=1", headers: { cookie: await login(h) } });
  assert.deepEqual(r.body.rows.map((x) => x.n), [2, 1]);
  assert.equal(r.body.matched, 2);
});

test("nhật ký: tìm theo câu hỏi hoặc câu phán, không phân biệt dấu", async () => {
  const store = memoryStore();
  const now = Date.parse("2026-11-19T05:00:00Z");
  for (const [q, v] of [["Phở hay bún chả?", "Bún chả."], ["Uống gì?", "Trà đá."], ["Đi đâu?", null]]) {
    await store.logPush("log:2026-11-19", JSON.stringify({ t: now, q, v, src: v ? "ai" : "fallback" }), 3000, 86400);
  }
  const h = createOpsHandler({ store, secret: SECRET, password: PW, now: () => now, log: quiet });
  const cookie = await login(h);
  const get = (q) => request(h, { url: `/api/ops?a=log&q=${encodeURIComponent(q)}`, headers: { cookie } }).then((r) => r.body);
  assert.deepEqual((await get("pho")).rows.map((r) => r.q), ["Phở hay bún chả?"]);
  assert.deepEqual((await get("tra da")).rows.map((r) => r.q), ["Uống gì?"]);
  assert.equal((await get("di dau")).counts.total, 1);
  assert.equal((await get("Phở")).counts.total, 1);
  assert.equal((await get("phỏ")).counts.total, 0); // gõ có dấu thì phải đúng dấu
});
