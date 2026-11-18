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
    async lists(keys) { return keys.map((k) => live(k)?.v.slice() || []); },
    async push(key, value, max, ttlSec) {
      const e = live(key);
      if (e) { if (e.v.length < max) e.v.push(value); return; }
      sweep();
      data.set(key, { v: [value], exp: Date.now() + ttlSec * 1000 });
    },
    // Nhật ký: giữ max dòng mới nhất.
    async logPush(key, value, max, ttlSec) {
      const e = live(key);
      if (e) { e.v.push(value); if (e.v.length > max) e.v.splice(0, e.v.length - max); return; }
      data.set(key, { v: [value], exp: Date.now() + ttlSec * 1000 });
    },
    // Giá trị lưu lâu dài (KHO): không hết hạn.
    async get(key) { return live(key)?.v ?? null; },
    async set(key, value) { data.set(key, { v: value, exp: Infinity }); },
    async hget(key, field) { return live(key)?.v[field] ?? null; },
    async hset(key, field, value) { const e = live(key) || { v: {}, exp: Infinity }; e.v[field] = value; data.set(key, e); },
    async hdel(key, field) { const e = live(key); if (e) delete e.v[field]; },
    async hgetall(key) { return { ...(live(key)?.v || {}) }; }
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
    // Đọc nhiều danh sách trong một lần gọi (nhật ký nhiều ngày).
    async lists(keys) {
      if (!keys.length) return [];
      return (await pipeline(keys.map((k) => ["LRANGE", k, "0", "-1"]))).map((a) => a || []);
    },
    async push(key, value, max, ttlSec) {
      await pipeline([["RPUSH", key, value], ["LTRIM", key, "0", String(max - 1)], ["EXPIRE", key, String(ttlSec), "NX"]]);
    },
    async logPush(key, value, max, ttlSec) {
      await pipeline([["RPUSH", key, value], ["LTRIM", key, String(-max), "-1"], ["EXPIRE", key, String(ttlSec), "NX"]]);
    },
    async get(key) { const [v] = await pipeline([["GET", key]]); return v ?? null; },
    async set(key, value) { await pipeline([["SET", key, value]]); },
    async hget(key, field) { const [v] = await pipeline([["HGET", key, field]]); return v ?? null; },
    async hset(key, field, value) { await pipeline([["HSET", key, field, value]]); },
    async hdel(key, field) { await pipeline([["HDEL", key, field]]); },
    async hgetall(key) {
      const [arr] = await pipeline([["HGETALL", key]]);
      const out = {};
      for (let i = 0; arr && i < arr.length; i += 2) out[arr[i]] = arr[i + 1];
      return out;
    }
  };
}

export function storeFromEnv(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  return url && token ? redisStore(url, token) : memoryStore();
}
