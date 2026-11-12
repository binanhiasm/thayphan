import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createPhanHandler, cacheKey } from "../lib/phan.js";
import { memoryStore } from "../lib/store.js";

const quiet = { warn() {} };
const limits = { ratePerMin: 100, perQuestion: 2, cacheSize: 3, daily: 1000 };

function call(handler, body, ip = "1.1.1.1") {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = "POST"; req.headers = {}; req.socket = { remoteAddress: ip };
  return new Promise((resolve) => {
    const res = { writeHead(status) { this.status = status; }, end(b) { resolve({ status: this.status, ...JSON.parse(b) }); } };
    handler(req, res);
  });
}

function counter() {
  let n = 0;
  const ask = async () => `câu ${++n}`;
  return { ask, calls: () => n };
}

test("không có AI thì trả verdict null để trang tự rút quẻ", async () => {
  const h = createPhanHandler({ store: memoryStore(), ask: null, limits, log: quiet });
  assert.deepEqual(await call(h, { q: "Ăn gì?" }), { status: 200, verdict: null, error: "no_ai" });
});

test("câu nhạy cảm không gọi AI", async () => {
  const c = counter();
  const h = createPhanHandler({ store: memoryStore(), ask: c.ask, limits, log: quiet });
  const r = await call(h, { q: "Có nên uống thuốc ngủ không?" });
  assert.equal(r.source, "rule");
  assert.equal(c.calls(), 0);
});

test("hỏi lại quá số lần cho phép thì không gọi AI", async () => {
  const c = counter();
  const h = createPhanHandler({ store: memoryStore(), ask: c.ask, limits, log: quiet });
  assert.equal((await call(h, { q: "Trà sữa hay cà phê?", prev: [] })).source, "ai");
  assert.equal((await call(h, { q: "Trà sữa hay cà phê?", prev: ["câu 1"] })).source, "ai");
  const r = await call(h, { q: "Trà sữa hay cà phê?", prev: ["câu 1", "câu 2"] });
  assert.equal(r.error, "reask");
  assert.equal(c.calls(), 2);
});

test("câu hỏi đã nhớ đủ câu phán thì xoay vòng, không gọi AI nữa", async () => {
  const c = counter();
  const h = createPhanHandler({ store: memoryStore(), ask: c.ask, limits, log: quiet });
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
  const h = createPhanHandler({ store: memoryStore(), ask: c.ask, limits: { ...limits, daily: 2 }, log: quiet });
  await call(h, { q: "Đi Đà Lạt không?" });
  await call(h, { q: "Mua áo này không?" });
  const r = await call(h, { q: "Ngủ sớm không?" });
  assert.equal(r.error, "budget");
  assert.equal(c.calls(), 2);
});

test("ngày mới thì có lượt AI trở lại", async () => {
  const c = counter();
  let t = Date.UTC(2026, 10, 12, 10);
  const h = createPhanHandler({ store: memoryStore(), ask: c.ask, limits: { ...limits, daily: 1 }, now: () => t, log: quiet });
  await call(h, { q: "Câu một?" });
  assert.equal((await call(h, { q: "Câu hai?" })).error, "budget");
  t += 86400_000;
  assert.equal((await call(h, { q: "Câu ba?" })).source, "ai");
});

test("giới hạn lượt mỗi phút theo IP", async () => {
  const h = createPhanHandler({ store: memoryStore(), ask: null, limits: { ...limits, ratePerMin: 2 }, log: quiet });
  await call(h, { q: "a?" }); await call(h, { q: "b?" });
  assert.equal((await call(h, { q: "c?" })).status, 429);
  assert.equal((await call(h, { q: "c?" }, "2.2.2.2")).status, 200);
});

test("AI lỗi hoặc bộ đếm lỗi thì vẫn trả 200 để trang rút quẻ", async () => {
  const h = createPhanHandler({ store: memoryStore(), ask: async () => { throw new Error("boom"); }, limits, log: quiet });
  assert.deepEqual(await call(h, { q: "Đi chơi không?" }), { status: 200, verdict: null, error: "ai_error" });
  const broken = { incr: async () => { throw new Error("down"); }, list: async () => [], push: async () => {} };
  const h2 = createPhanHandler({ store: broken, ask: async () => "x", limits, log: quiet });
  assert.equal((await call(h2, { q: "Đi chơi không?" })).error, "store_error");
});

test("câu hỏi sai bị chặn", async () => {
  const h = createPhanHandler({ store: memoryStore(), ask: null, limits, log: quiet });
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
