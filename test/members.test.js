import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createOpsHandler } from "../lib/ops.js";
import { memoryStore } from "../lib/store.js";
import { generatePassword, MEMBERS_KEY } from "../lib/members.js";

const SECRET = "test-secret", HOST = "thayphan.test", PW = "mat-khau-khoi-tao";
const quiet = { warn() {} };
const origin = { origin: `https://${HOST}` };

function request(handler, { method = "GET", url = "/", body, headers = {} } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { method, url, socket: { remoteAddress: "1.1.1.1" }, headers: { host: HOST, ...headers } });
  return new Promise((resolve) => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, writeHead(s, h) { this.status = s; Object.assign(this.headers, h); }, end(b) { resolve({ status: this.status, headers: this.headers, body: b ? JSON.parse(b) : null }); } };
    handler(req, res);
  });
}

function setup() {
  const store = memoryStore();
  const h = createOpsHandler({ store, secret: SECRET, password: PW, log: quiet });
  const login = async (email, password) => {
    const r = await request(h, { method: "POST", url: "/api/ops?a=login", body: { email, password }, headers: origin });
    return r.status === 200 ? r.headers["set-cookie"].split(";")[0] : r;
  };
  const as = (cookie) => ({
    get: (a) => request(h, { url: `/api/ops?a=${a}`, headers: { cookie } }),
    post: (a, body) => request(h, { method: "POST", url: `/api/ops?a=${a}`, body, headers: { cookie, ...origin } })
  });
  return { store, h, login, as };
}

test("mật khẩu tự tạo đủ dài, không có ký tự dễ nhầm", () => {
  const p = generatePassword();
  assert.match(p, /^[a-zA-Z2-9]{4}(-[a-zA-Z2-9]{4}){3}$/);
  assert.doesNotMatch(p, /[01lIO]/);
  assert.notEqual(generatePassword(), generatePassword());
});

test("chủ trang tạo admin và ops; mỗi người đăng nhập bằng email của mình", async () => {
  const { store, login, as } = setup();
  const owner = as(await login("", PW));
  const a = await owner.post("member-add", { email: "Admin@Thayphan.test", name: "A", role: "admin" });
  assert.equal(a.status, 200);
  assert.equal(a.body.member.email, "admin@thayphan.test");
  assert.ok(a.body.password.length >= 16);
  const o = await owner.post("member-add", { email: "ops@thayphan.test", role: "ops", password: "mat-khau-tu-dat" });
  assert.equal(o.status, 200);
  assert.equal((await owner.post("member-add", { email: "ops@thayphan.test", role: "ops" })).status, 409);
  assert.equal((await owner.post("member-add", { email: "khong-phai-email", role: "ops" })).status, 400);
  assert.equal((await owner.post("member-add", { email: "x@y.vn", role: "sep" })).status, 400);

  // Không lưu mật khẩu gốc, danh sách không trả về bản băm.
  const raw = JSON.stringify(await store.hgetall(MEMBERS_KEY));
  assert.ok(!raw.includes(a.body.password));
  const list = (await owner.get("members")).body.members;
  assert.deepEqual(list.map((m) => m.email), ["admin@thayphan.test", "ops@thayphan.test"]);
  assert.equal(list[0].hash, undefined);

  const adminCookie = await login("admin@thayphan.test", a.body.password);
  assert.equal(typeof adminCookie, "string");
  assert.equal((await as(adminCookie).get("me")).body.user.role, "admin");
  assert.equal((await login("admin@thayphan.test", "sai-mat-khau")).status, 401);
  assert.equal((await login("ai-do@thayphan.test", a.body.password)).status, 401);
});

test("quyền ops dùng được KHO nhưng không quản lý thành viên", async () => {
  const { login, as } = setup();
  const owner = as(await login("", PW));
  await owner.post("member-add", { email: "ops@thayphan.test", role: "ops", password: "mat-khau-tu-dat" });
  const ops = as(await login("ops@thayphan.test", "mat-khau-tu-dat"));
  assert.equal((await ops.get("kho")).status, 200);
  assert.equal((await ops.post("qa-save", { q: "Phở hay bún?", answers: ["Phở."] })).body.by, "ops@thayphan.test");
  assert.equal((await ops.get("members")).status, 403);
  assert.equal((await ops.post("member-add", { email: "x@thayphan.test", role: "admin" })).status, 403);
});

test("đặt lại mật khẩu, đổi quyền hay xoá thì phiên cũ của người đó hết hiệu lực", async () => {
  const { login, as } = setup();
  const owner = as(await login("", PW));
  await owner.post("member-add", { email: "qa@thayphan.test", role: "admin", password: "mat-khau-tu-dat" });
  let c = await login("qa@thayphan.test", "mat-khau-tu-dat");
  assert.equal((await as(c).get("me")).status, 200);

  const r = await owner.post("member-reset", { email: "qa@thayphan.test" });
  assert.equal((await as(c).get("me")).status, 401);
  assert.equal((await login("qa@thayphan.test", "mat-khau-tu-dat")).status, 401);
  c = await login("qa@thayphan.test", r.body.password);

  await owner.post("member-update", { email: "qa@thayphan.test", role: "ops" });
  assert.equal((await as(c).get("me")).status, 401);
  c = await login("qa@thayphan.test", r.body.password);
  assert.equal((await as(c).get("me")).body.user.role, "ops");

  await owner.post("member-del", { email: "qa@thayphan.test" });
  assert.equal((await as(c).get("me")).status, 401);
});

test("tự đổi mật khẩu: giữ phiên hiện tại, mật khẩu cũ hết dùng được", async () => {
  const { login, as } = setup();
  const owner = as(await login("", PW));
  await owner.post("member-add", { email: "a@thayphan.test", role: "admin", password: "mat-khau-cu-123" });
  const me = await as(await login("a@thayphan.test", "mat-khau-cu-123")).post("me-password", { current: "mat-khau-cu-123", next: "mat-khau-moi-456" });
  assert.equal(me.status, 200);
  assert.equal((await as(me.headers["set-cookie"].split(";")[0]).get("me")).status, 200);
  assert.equal((await login("a@thayphan.test", "mat-khau-cu-123")).status, 401);
  assert.equal(typeof (await login("a@thayphan.test", "mat-khau-moi-456")), "string");
});

test("admin không tự xoá, tự đổi quyền hay tự đặt lại mật khẩu của mình", async () => {
  const { login, as } = setup();
  const owner = as(await login("", PW));
  await owner.post("member-add", { email: "a@thayphan.test", role: "admin", password: "mat-khau-tu-dat" });
  const a = as(await login("a@thayphan.test", "mat-khau-tu-dat"));
  assert.equal((await a.post("member-del", { email: "a@thayphan.test" })).status, 400);
  assert.equal((await a.post("member-update", { email: "a@thayphan.test", role: "ops" })).status, 400);
  assert.equal((await a.post("member-reset", { email: "a@thayphan.test" })).status, 400);
});

test("đăng nhập sai 10 lần thì khoá 15 phút, đăng nhập đúng không bị tính", async () => {
  const { login } = setup();
  for (let i = 0; i < 12; i++) assert.equal(typeof (await login("", PW)), "string");
  for (let i = 0; i < 10; i++) await login("", "sai");
  assert.equal((await login("", PW)).status, 429);
});
