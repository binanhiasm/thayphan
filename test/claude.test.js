import { test } from "node:test";
import assert from "node:assert/strict";
import { makeAsk } from "../lib/claude.js";

function fakeClient({ rejectExtras }) {
  const calls = [];
  const reply = { model: "claude-haiku-5-5", usage: { input_tokens: 900, output_tokens: 30 }, stop_reason: "end_turn", content: [{ type: "text", text: "Bún chả. Phở để mai." }] };
  return {
    calls,
    beta: { messages: { create: async (p) => { calls.push({ kind: "beta", p }); if (rejectExtras) throw Object.assign(new Error("bad"), { status: 400 }); return reply; } } },
    messages: { create: async (p) => { calls.push({ kind: "plain", p }); return reply; } }
  };
}

test("dùng model trong THAYPHAN_MODEL và gửi kèm effort khi model nhận", async () => {
  const c = fakeClient({ rejectExtras: false });
  const ask = makeAsk({ THAYPHAN_MODEL: "claude-haiku-5-5" }, c);
  assert.deepEqual(await ask("phở hay bún chả", []), { verdict: "Bún chả. Phở để mai.", model: "claude-haiku-5-5" });
  assert.equal(c.calls[0].p.model, "claude-haiku-5-5");
  assert.deepEqual(c.calls[0].p.output_config, { effort: "low" });
});

test("model từ chối tuỳ chọn phụ (400) thì gọi lại không kèm, và các lần sau bỏ luôn", async () => {
  const c = fakeClient({ rejectExtras: true });
  const ask = makeAsk({ THAYPHAN_MODEL: "claude-haiku-5-5" }, c);
  assert.equal((await ask("a hay b", [])).verdict, "Bún chả. Phở để mai.");
  await ask("c hay d", []);
  assert.deepEqual(c.calls.map((x) => x.kind), ["beta", "plain", "plain"]);
  assert.equal(c.calls[1].p.output_config, undefined);
  assert.equal(c.calls[1].p.fallbacks, undefined);
});

test("lỗi khác 400 vẫn ném ra để trang rơi về kho câu", async () => {
  const c = fakeClient({ rejectExtras: false });
  c.beta.messages.create = async () => { throw Object.assign(new Error("overloaded"), { status: 529 }); };
  await assert.rejects(makeAsk({}, c)("x", []));
});
