import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createPhanHandler, cacheKey } from "../lib/phan.js";
import { memoryStore } from "../lib/store.js";
import { issueToken } from "../lib/token.js";

const SECRET = "test-secret", HOST = "thayphan.test";

const quiet = { warn() {} };
const limits = { ratePerMin: 100, perQuestion: 2, cacheSize: 3, daily: 1000, tokenTtl: 1800, tokenUses: 1000, origins: [] };

function request(handler, { method = "POST", body, ip = "1.1.1.1", headers = {} } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.method = method; req.socket = { remoteAddress: ip };
  req.headers = { host: HOST, ...headers };
  return new Promise((resolve) => {
    const res = { writeHead(status) { this.status = status; }, end(b) { resolve({ status: this.status, ...JSON.parse(b) }); } };
    handler(req, res);
  });
}

// Hỏi như trang thật: có Origin của trang và vé hợp lệ.
function call(handler, body, ip = "1.1.1.1") {
  const { token } = issueToken(SECRET, HOST, 30 * 86400); // hạn dài để test đổi ngày vẫn dùng được
  return request(handler, { body, ip, headers: { origin: `https://${HOST}`, "x-thay-token": token } });
}

function counter() {
  let n = 0;
  const ask = async () => `câu ${++n}`;
  return { ask, calls: () => n };
}

test("không có AI thì trả verdict null để trang tự rút quẻ", async () => {
  const h = createPhanHandler({ secret: SECRET, store: memoryStore(), ask: null, limits, log: quiet });
  assert.deepEqual(await call(h, { q: "Ăn gì?" }), { status: 200, verdict: null, error: "no_ai" });
});

test("câu nhạy cảm không gọi AI", async () => {
  const c = counter();
  const h = createPhanHandler({ secret: SECRET, store: memoryStore(), ask: c.ask, limits, log: quiet });
  const r = await call(h, { q: "Có nên uống thuốc ngủ không?" });
  assert.equal(r.source, "rule");
  assert.equal(c.calls(), 0);
});

test("hỏi lại quá số lần cho phép thì không gọi AI", async () => {
  const c = counter();
  const h = createPhanHandler({ secret: SECRET, store: memoryStore(), ask: c.ask, limits, log: quiet });
  assert.equal((await call(h, { q: "Trà sữa hay cà phê?", prev: [] })).source, "ai");
  assert.equal((await call(h, { q: "Trà sữa hay cà phê?", prev: ["câu 1"] })).source, "ai");
  const r = await call(h, { q: "Trà sữa hay cà phê?", prev: ["câu 1", "câu 2"] });
  assert.equal(r.error, "reask");
  assert.equal(c.calls(), 2);
});

test("câu hỏi đã nhớ đủ câu phán thì xoay vòng, không gọi AI nữa", async () => {
  const c = counter();
  const h = createPhanHandler({ secret: SECRET, store: memoryStore(), ask: c.ask, limits, log: quiet });
  for (let i = 0; i < 3; i++) await call(h, { q: "Ăn gì tối nay?" }, `ip${i}`);
  assert.equal(c.calls(), 3);
  const r = await call(h, { q: "  ăn gì tối nay  " }, "ip9");
  assert.equal(r.source, "cache");
  assert.match(r.verdict, /^câu [123]$/);
  // Câu đã phán cho người này thì không lặp lại.
  const r2 = await call(h, { q: "Ăn gì tối nay?", prev: ["câu 1", "câu 2"].slice(0, 1) }, "ip9");
  assert.notEqual(r2.verdict, "câu 1");
  assert.equal(c.calls(), 3);
});

test("hết lượt AI trong ngày thì rút quẻ trong kho", async () => {
  const c = counter();
  const h = createPhanHandler({ secret: SECRET, store: memoryStore(), ask: c.ask, limits: { ...limits, daily: 2 }, log: quiet });
  await call(h, { q: "Đi Đà Lạt không?" });
  await call(h, { q: "Mua áo này không?" });
  const r = await call(h, { q: "Ngủ sớm không?" });
  assert.equal(r.error, "budget");
  assert.equal(c.calls(), 2);
});

test("ngày mới thì có lượt AI trở lại", async () => {
  const c = counter();
  let t = Date.UTC(2026, 10, 12, 10);
  const h = createPhanHandler({ secret: SECRET, store: memoryStore(), ask: c.ask, limits: { ...limits, daily: 1 }, now: () => t, log: quiet });
  await call(h, { q: "Câu một?" });
  assert.equal((await call(h, { q: "Câu hai?" })).error, "budget");
  t += 86400_000;
  assert.equal((await call(h, { q: "Câu ba?" })).source, "ai");
});

test("giới hạn lượt mỗi phút theo IP", async () => {
  const h = createPhanHandler({ secret: SECRET, store: memoryStore(), ask: null, limits: { ...limits, ratePerMin: 2 }, log: quiet });
  await call(h, { q: "a?" }); await call(h, { q: "b?" });
  assert.equal((await call(h, { q: "c?" })).status, 429);
  assert.equal((await call(h, { q: "c?" }, "2.2.2.2")).status, 200);
});

test("AI lỗi hoặc bộ đếm lỗi thì vẫn trả 200 để trang rút quẻ", async () => {
  const h = createPhanHandler({ secret: SECRET, store: memoryStore(), ask: async () => { throw new Error("boom"); }, limits, log: quiet });
  assert.deepEqual(await call(h, { q: "Đi chơi không?" }), { status: 200, verdict: null, error: "ai_error" });
  const broken = { incr: async () => { throw new Error("down"); }, list: async () => [], push: async () => {} };
  const h2 = createPhanHandler({ secret: SECRET, store: broken, ask: async () => "x", limits, log: quiet });
  assert.equal((await call(h2, { q: "Đi chơi không?" })).error, "store_error");
});

test("câu hỏi sai bị chặn", async () => {
  const h = createPhanHandler({ secret: SECRET, store: memoryStore(), ask: null, limits, log: quiet });
  assert.equal((await call(h, { q: "" })).status, 400);
  assert.equal((await call(h, { q: "x".repeat(141) })).status, 400);
});

test("khoá nhớ bỏ dấu câu và khoảng trắng cuối", () => {
  assert.equal(cacheKey("Ăn gì tối nay??  "), cacheKey("ăn gì tối nay"));
});

test("Redis: gửi đúng lệnh qua REST pipeline", async () => {
  const { redisStore } = await import("../lib/store.js");
  const sent = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent.push({ url, auth: init.headers.authorization, cmds: JSON.parse(init.body) });
    return { ok: true, json: async () => JSON.parse(init.body).map(() => ({ result: 7 })) };
  };
  try {
    const s = redisStore("https://x.upstash.io/", "tok");
    assert.equal(await s.incr("day:2026-11-12", 60), 7);
    await s.push("q:ăn gì", "Phở.", 5, 100);
    assert.equal(sent[0].url, "https://x.upstash.io/pipeline");
    assert.equal(sent[0].auth, "Bearer tok");
    assert.deepEqual(sent[0].cmds, [["INCR", "day:2026-11-12"], ["EXPIRE", "day:2026-11-12", "60", "NX"]]);
    assert.deepEqual(sent[1].cmds[1], ["LTRIM", "q:ăn gì", "0", "4"]);
  } finally { globalThis.fetch = orig; }
});

test("trang xin vé rồi hỏi được", async () => {
  const h = createPhanHandler({ secret: SECRET, store: memoryStore(), ask: async () => "Phở.", limits, log: quiet });
  const t = await request(h, { method: "GET" });
  assert.equal(t.status, 200);
  const r = await request(h, { body: { q: "Ăn gì?" }, headers: { origin: `https://${HOST}`, "x-thay-token": t.token } });
  assert.equal(r.verdict, "Phở.");
});

test("không có vé, vé giả, vé hết hạn hoặc vé của tên miền khác thì bị chặn", async () => {
  const h = createPhanHandler({ secret: SECRET, store: memoryStore(), ask: async () => "x", limits, log: quiet });
  const origin = `https://${HOST}`;
  const ask = (token) => request(h, { body: { q: "Ăn gì?" }, headers: { origin, ...(token ? { "x-thay-token": token } : {}) } });
  assert.equal((await ask()).status, 401);
  assert.equal((await ask("abc.def")).status, 401);
  assert.equal((await ask(issueToken("khoá-khác", HOST, 1800).token)).status, 401);
  assert.equal((await ask(issueToken(SECRET, "trang-khac.com", 1800).token)).status, 401);
  assert.equal((await ask(issueToken(SECRET, HOST, 60, Date.now() - 120_000).token)).status, 401);
  const good = issueToken(SECRET, HOST, 1800).token;
  const tampered = good.replace(/^./, (c) => (c === "e" ? "f" : "e"));
  assert.equal((await ask(tampered)).status, 401);
});

test("request từ trang khác hoặc không có Origin (curl) thì bị chặn", async () => {
  const h = createPhanHandler({ secret: SECRET, store: memoryStore(), ask: async () => "x", limits, log: quiet });
  const token = issueToken(SECRET, HOST, 1800).token;
  assert.equal((await request(h, { body: { q: "a?" }, headers: { "x-thay-token": token } })).status, 403);
  assert.equal((await request(h, { body: { q: "a?" }, headers: { origin: "https://evil.com", "x-thay-token": token } })).status, 403);
  assert.equal((await request(h, { method: "GET", headers: { origin: "https://evil.com" } })).status, 403);
  assert.equal((await request(h, { method: "GET", headers: { "sec-fetch-site": "cross-site" } })).status, 403);
  const h2 = createPhanHandler({ secret: SECRET, store: memoryStore(), ask: async () => "x", limits: { ...limits, origins: ["https://thayphan.vn"] }, log: quiet });
  assert.equal((await request(h2, { body: { q: "a?" }, headers: { origin: "https://thayphan.vn", "x-thay-token": token } })).status, 200);
});

test("mỗi vé chỉ dùng được số lượt giới hạn", async () => {
  const h = createPhanHandler({ secret: SECRET, store: memoryStore(), ask: null, limits: { ...limits, tokenUses: 2 }, log: quiet });
  const headers = { origin: `https://${HOST}`, "x-thay-token": issueToken(SECRET, HOST, 1800).token };
  assert.equal((await request(h, { body: { q: "a?" }, headers })).status, 200);
  assert.equal((await request(h, { body: { q: "b?" }, headers })).status, 200);
  assert.equal((await request(h, { body: { q: "c?" }, headers })).status, 401);
});
