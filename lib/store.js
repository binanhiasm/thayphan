// Nơi lưu bộ đếm và câu phán đã nhớ.
// Có biến UPSTASH_REDIS_REST_URL/TOKEN (hoặc KV_REST_API_URL/TOKEN của Vercel) thì dùng Redis,
// để nhiều máy chủ (như serverless trên Vercel) cùng chung một bộ đếm. Không có thì lưu trong bộ nhớ.

export function memoryStore() {
  const data = new Map();
  const live = (k) => {
    const e = data.get(k);
    if (e && e.exp < Date.now()) { data.delete(k); return undefined; }
    return e;
  };
  const sweep = () => { if (data.size > 20000) for (const k of data.keys()) live(k); };
  return {
    kind: "memory",
    async incr(key, ttlSec) {
      const e = live(key);
      if (e) { e.v += 1; return e.v; }
      sweep();
      data.set(key, { v: 1, exp: Date.now() + ttlSec * 1000 });
      return 1;
    },
    async list(key) { return live(key)?.v.slice() || []; },
    async push(key, value, max, ttlSec) {
      const e = live(key);
      if (e) { if (e.v.length < max) e.v.push(value); return; }
      sweep();
      data.set(key, { v: [value], exp: Date.now() + ttlSec * 1000 });
    }
  };
}

export function redisStore(url, token) {
  async function pipeline(cmds) {
    const r = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(cmds),
      signal: AbortSignal.timeout(2000)
    });
    if (!r.ok) throw new Error(`redis ${r.status}`);
    const out = await r.json();
    const bad = out.find((x) => x.error);
    if (bad) throw new Error(`redis ${bad.error}`);
    return out.map((x) => x.result);
  }
  return {
    kind: "redis",
    async incr(key, ttlSec) {
      // EXPIRE ... NX chỉ đặt hạn ở lần tăng đầu, nên cửa sổ không bị kéo dài mãi.
      const [n] = await pipeline([["INCR", key], ["EXPIRE", key, String(ttlSec), "NX"]]);
      return Number(n);
    },
    async list(key) {
      const [arr] = await pipeline([["LRANGE", key, "0", "-1"]]);
      return arr || [];
    },
    async push(key, value, max, ttlSec) {
      await pipeline([["RPUSH", key, value], ["LTRIM", key, "0", String(max - 1)], ["EXPIRE", key, String(ttlSec), "NX"]]);
    }
  };
}

export function storeFromEnv(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  return url && token ? redisStore(url, token) : memoryStore();
}
