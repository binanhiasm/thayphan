// Trang vận hành của Thầy Phán: xem lịch sử hỏi đáp, soạn KHO câu hỏi riêng và nhóm câu.
import { matchKey, setKho, categoryOf } from "/js/rules.js";

const $ = (s) => document.querySelector(s);
const main = $("#main"), dlg = $("#dlg"), dlgForm = $("#dlgForm");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const icon = (n) => `<i class="fi fi-rr-${n}"></i>`;

const SRC = {
  ai: { label: "AI phán", icon: "sparkles" },
  cache: { label: "Câu đã nhớ", icon: "time-past" },
  kho: { label: "KHO soạn sẵn", icon: "bookmark" },
  fallback: { label: "Kho có sẵn", icon: "box-open" }
};
const WHY = { alternate: "xen kẽ tiết kiệm", no_ai: "chưa bật AI", reask: "hỏi lại quá lượt", budget: "hết lượt AI trong ngày", no_verdict: "AI không trả câu", ai_error: "lỗi gọi AI" };
const PRESETS = [["today", "Hôm nay"], ["yesterday", "Hôm qua"], ["7d", "7 ngày"], ["30d", "30 ngày"], ["90d", "3 tháng"], ["custom", "Tuỳ chọn"]];

const st = {
  tab: "log", today: "",
  log: { preset: "today", from: "", to: "", q: "", src: "", group: false, page: 1, size: 20, data: null },
  groups: [], rev: 0, qa: [], qaQuery: "", dirty: false
};

const shiftDay = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400_000).toISOString().slice(0, 10);
const dmy = (d) => d.split("-").reverse().join("/");
const dm = (d) => d.split("-").slice(1).reverse().join("/");
const vnTime = (t) => new Date(t).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
const vnDate = (t) => new Date(t + 7 * 3600_000).toISOString().slice(0, 10);
const fmt = (n) => n.toLocaleString("vi-VN");

function toast(msg) {
  const t = $("#toast"); t.innerHTML = icon("check") + esc(msg); t.classList.add("show");
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("show"), 2400);
}

async function api(a, { body, query = "" } = {}) {
  const r = await fetch(`/api/ops?a=${a}${query}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && a !== "login") { showLogin(); throw new Error("login"); }
  if (!r.ok) throw new Error(j.error || `Lỗi ${r.status}`);
  return j;
}

// ---------- đăng nhập ----------
function showLogin(msg = "") {
  $("#side").hidden = true;
  let owner = false;
  main.innerHTML = `<div class="login"><form class="card" id="loginForm">
    <span class="seal">判</span>
    <h2>Trang vận hành</h2><p class="muted" style="margin:0 0 18px">Thầy Phán · chỉ dành cho người quản lý</p>
    <div class="field" id="emailField"><label for="em">Email</label><input type="email" id="em" autocomplete="username" required autofocus></div>
    <div class="field"><label for="pw" id="pwLabel">Mật khẩu</label><input type="password" id="pw" autocomplete="current-password" required></div>
    <p class="err" id="loginErr">${esc(msg)}</p>
    <button class="btn primary" style="width:100%;justify-content:center">${icon("lock")} Đăng nhập</button>
    <button type="button" class="link" id="ownerToggle">Dùng mật khẩu khởi tạo (OPS_PASSWORD)</button></form></div>`;
  $("#ownerToggle").onclick = () => {
    owner = !owner;
    $("#emailField").hidden = owner; $("#em").required = !owner;
    $("#pwLabel").textContent = owner ? "Mật khẩu khởi tạo" : "Mật khẩu";
    $("#ownerToggle").textContent = owner ? "Đăng nhập bằng email" : "Dùng mật khẩu khởi tạo (OPS_PASSWORD)";
    (owner ? $("#pw") : $("#em")).focus();
  };
  $("#loginForm").onsubmit = async (e) => {
    e.preventDefault();
    try { await api("login", { body: { email: owner ? "" : $("#em").value, password: $("#pw").value } }); start(); }
    catch (err) { $("#loginErr").textContent = err.message === "ops_disabled" ? "Trang vận hành chưa bật (thiếu biến OPS_PASSWORD)." : err.message; }
  };
}

const ROLE = { admin: { label: "Admin", desc: "Làm mọi việc, kể cả thêm và xoá thành viên" }, ops: { label: "Ops", desc: "Xem lịch sử, sửa câu hỏi riêng và nhóm câu" } };

async function start() {
  let me;
  try { me = await api("me"); } catch (e) { if (e.message !== "login") main.innerHTML = `<p class="pad err">${esc(e.message === "ops_disabled" ? "Trang vận hành chưa bật: thêm biến OPS_PASSWORD rồi deploy lại." : e.message)}</p>`; return; }
  st.today = me.today; st.user = me.user;
  setPreset(st.log.preset);
  $("#side").hidden = false;
  $("#tabMembers").hidden = me.user.role !== "admin";
  if (st.tab === "members" && me.user.role !== "admin") st.tab = "log";
  $("#who").innerHTML = `<span class="avatar">${esc((me.user.name || me.user.email).trim().charAt(0).toUpperCase())}</span>
    <span class="who-text"><b>${esc(me.user.name || me.user.email)}</b><small>${ROLE[me.user.role]?.label || me.user.role}${me.user.name && me.user.email !== "owner" ? " · " + esc(me.user.email) : ""}</small></span>`;
  $("#myPw").hidden = me.user.email === "owner";
  await loadKho();
  show(st.tab);
}

$("#logout").onclick = async () => { await api("logout", { body: {} }).catch(() => {}); showLogin(); };
$("#myPw").onclick = () => changeMyPassword();
$("#tabs").onclick = (e) => {
  const b = e.target.closest("button[data-tab]"); if (!b) return;
  if (st.tab === "groups" && st.dirty) {
    if (!confirm("Nhóm câu có thay đổi chưa lưu. Rời trang này?")) return;
    loadKho().then(() => show(b.dataset.tab)); return;
  }
  show(b.dataset.tab);
};
window.addEventListener("beforeunload", (e) => { if (st.dirty) e.preventDefault(); });

async function loadKho() {
  const k = await api("kho");
  st.groups = k.groups; st.rev = k.rev; st.qa = k.qa; st.dirty = false;
}

function show(tab) {
  st.tab = tab;
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  ({ log: () => renderLog(true), qa: renderQa, groups: renderGroups, members: renderMembers })[tab]();
}

// ---------- lịch sử ----------
function setPreset(p) {
  const L = st.log, t = st.today;
  L.preset = p;
  if (p === "today") [L.from, L.to] = [t, t];
  else if (p === "yesterday") [L.from, L.to] = [shiftDay(t, -1), shiftDay(t, -1)];
  else if (p === "7d") [L.from, L.to] = [shiftDay(t, -6), t];
  else if (p === "30d") [L.from, L.to] = [shiftDay(t, -29), t];
  else if (p === "90d") [L.from, L.to] = [shiftDay(t, -89), t];
  else if (!L.from) [L.from, L.to] = [t, t];
}

const rangeLabel = (from, to) => from === to ? `${from === st.today ? "Hôm nay, " : from === shiftDay(st.today, -1) ? "Hôm qua, " : ""}${dmy(from)}` : `${dm(from)} – ${dmy(to)}`;

const presetLabel = (L) => L.preset === "custom" ? (L.from === L.to ? dmy(L.from) : `${dm(L.from)} – ${dmy(L.to)}`) : PRESETS.find(([k]) => k === L.preset)[1];
// Chỉ câu do AI phán hoặc câu đã nhớ mới cần lưu; câu từ KHO và kho có sẵn thì đã nằm trong kho rồi.
const canSave = (src) => src === "ai" || src === "cache";

async function renderLog(reload) {
  const L = st.log;
  if (reload || !L.data) {
    if (!L.data) main.innerHTML = `<p class="muted pad">Đang tải lịch sử…</p>`;
    try {
      L.data = await api("log", { query: `&from=${L.from}&to=${L.to}&q=${encodeURIComponent(L.q)}&src=${L.src}&page=${L.page}&size=${L.size}&group=${L.group ? 1 : 0}` });
      L.page = L.data.page;
    } catch (e) { if (e.message !== "login") main.innerHTML = `<p class="pad err">${esc(e.message)}</p>`; return; }
  }
  const d = L.data, c = d.counts, fromKho = c.cache + c.kho + c.fallback;
  const pct = (n) => (c.total ? Math.round((n / c.total) * 100) : 0);
  const known = new Set(st.qa.map((e) => e.key));
  const multiDay = d.from !== d.to;
  const first = (d.page - 1) * d.size;

  const srcTag = (s) => `<span class="tag ${s}">${icon(SRC[s]?.icon || "info")}${esc(SRC[s]?.label || s)}</span>`;
  const saveBtn = (i) => `<button type="button" class="icon-btn" data-qa="${i}" title="Lưu vào câu hỏi riêng" aria-label="Lưu vào câu hỏi riêng">${icon("bookmark")}</button>`;
  let rows;
  if (!d.rows.length) {
    rows = `<div class="empty">${icon("comments")}Không có câu hỏi nào${L.q ? ` khớp “${esc(L.q)}”` : ""}${L.src ? ` thuộc “${SRC[L.src].label}”` : ""} trong khoảng này.</div>`;
  } else if (L.group) {
    rows = `<div class="tr th"><div>#</div><div>Số lần</div><div>Câu hỏi và các câu phán</div><div>Nguồn</div><div></div></div>` + d.rows.map((r, i) => `<div class="tr">
      <div class="no">${first + i + 1}</div>
      <div><span class="count">×${r.n}</span></div>
      <div><div class="q">${esc(r.q)}</div>${r.verdicts.length ? `<ul class="vs">${r.verdicts.map((v) => `<li>${esc(v)}</li>`).join("")}</ul>` : `<div class="v none">Chưa có câu phán: trang tự rút quẻ trong kho có sẵn</div>`}</div>
      <div class="tags">${r.srcs.map(srcTag).join("")}${known.has(r.key) ? `<span class="tag kho">${icon("check")}Trong KHO</span>` : ""}</div>
      <div class="acts">${r.srcs.some(canSave) && !known.has(r.key) ? saveBtn(i) : ""}</div></div>`).join("");
  } else {
    rows = `<div class="tr th"><div>#</div><div>Thời gian</div><div>Câu hỏi và câu phán</div><div>Nguồn</div><div></div></div>` + d.rows.map((r, i) => `<div class="tr">
      <div class="no">${first + i + 1}</div>
      <div class="when">${vnTime(r.t)}${multiDay ? `<small>${dmy(vnDate(r.t))}</small>` : ""}</div>
      <div><div class="q">${esc(r.q)}</div><div class="v ${r.v ? "" : "none"}">${r.v ? esc(r.v) : "Trang tự rút quẻ trong kho có sẵn"}</div></div>
      <div class="tags">${srcTag(r.src)}${r.model ? `<span class="tag plain">${esc(r.model.replace("claude-", ""))}</span>` : ""}${r.why ? `<span class="tag plain">${esc(WHY[r.why] || r.why)}</span>` : ""}${known.has(matchKey(r.q)) ? `<span class="tag kho">${icon("check")}Trong KHO</span>` : ""}</div>
      <div class="acts">${canSave(r.src) ? saveBtn(i) + `<button type="button" class="icon-btn" data-grp="${i}" title="Thêm vào nhóm câu" aria-label="Thêm vào nhóm câu">${icon("layers")}</button>` : ""}</div></div>`).join("");
  }

  const end = Math.min(d.page * d.size, d.matched);
  const nums = [];
  for (let p = 1; p <= d.pages; p++) if (p === 1 || p === d.pages || Math.abs(p - d.page) <= 1) nums.push(p); else if (nums[nums.length - 1] !== "…") nums.push("…");
  const hadFocus = document.activeElement?.id === "lq" ? document.activeElement.selectionStart : null;

  main.innerHTML = `
    <div class="head"><div><h1>Lịch sử hỏi đáp</h1><p>${esc(rangeLabel(d.from, d.to))} · giờ Việt Nam</p></div></div>
    <div class="toolbar">
      <div class="search">${icon("search")}<input type="search" id="lq" placeholder="Tìm câu hỏi hoặc câu phán…" value="${esc(L.q)}"></div>
      <div class="dd" id="dd">
        <button type="button" class="fld" id="ddBtn" aria-haspopup="true" aria-expanded="false">${icon("calendar")}<span>${esc(presetLabel(L))}</span>${icon("angle-small-down")}</button>
        <div class="pop" id="ddPop" hidden>
          ${PRESETS.filter(([k]) => k !== "custom").map(([k, t]) => `<button type="button" class="opt ${L.preset === k ? "on" : ""}" data-p="${k}">${t}${L.preset === k ? icon("check") : ""}</button>`).join("")}
          <div class="custom"><div class="hint">Tuỳ chọn</div>
            <div class="range"><input type="date" id="from" value="${L.from}" max="${st.today}" min="${shiftDay(st.today, -89)}" aria-label="Từ ngày"><span>→</span><input type="date" id="to" value="${L.to}" max="${st.today}" min="${shiftDay(st.today, -89)}" aria-label="Đến ngày"></div>
            <button type="button" class="btn sm primary" id="apply">Áp dụng</button></div>
        </div>
      </div>
      <label class="fld">${icon("filter")}<select id="src" aria-label="Lọc theo trạng thái">
        <option value="">Tất cả trạng thái</option>${Object.entries(SRC).map(([k, s]) => `<option value="${k}" ${L.src === k ? "selected" : ""}>${s.label} (${fmt(c[k])})</option>`).join("")}
      </select></label>
      <button type="button" class="fld toggle-btn ${L.group ? "on" : ""}" id="group" aria-pressed="${L.group}">${icon("layers")}<span>Gộp câu giống nhau</span></button>
      <button type="button" class="icon-btn" id="reload" title="Tải lại" aria-label="Tải lại">${icon("refresh")}</button>
    </div>
    <div class="stats">
      <div class="stat total"><span class="ico">${icon("messages")}</span><div class="lbl">Tổng câu hỏi</div><div class="num">${fmt(c.total)}</div>
        <div class="sub">${esc(rangeLabel(d.from, d.to))}${L.q ? ` · khớp “${esc(L.q)}”` : ""}</div>
        <div class="bar-mini" title="AI ${pct(c.ai)}%"><i style="width:${pct(c.ai)}%;background:var(--ai)"></i><i style="width:${pct(c.kho)}%;background:var(--kho)"></i><i style="width:${pct(c.cache)}%;background:var(--cache)"></i><i style="width:${pct(c.fallback)}%;background:var(--fb)"></i></div></div>
      <div class="stat ai"><span class="ico">${icon("sparkles")}</span><div class="lbl">Dùng AI</div><div class="num">${fmt(c.ai)}</div>
        <div class="sub">${pct(c.ai)}% số câu hỏi · mỗi lượt tốn tiền</div></div>
      <div class="stat kho"><span class="ico">${icon("box-open")}</span><div class="lbl">Từ kho (không tốn tiền)</div><div class="num">${fmt(fromKho)}</div>
        <div class="sub">KHO soạn sẵn ${fmt(c.kho)} · đã nhớ ${fmt(c.cache)} · kho có sẵn ${fmt(c.fallback)}</div></div>
    </div>
    <div class="table ${L.group ? "grouped" : ""}">
      ${rows}
      <div class="pager">
        <span>${d.matched ? `Hiển thị <b>${fmt(first + 1)}–${fmt(end)}</b> trong ${fmt(d.matched)} ${L.group ? "câu hỏi" : "lượt"}` : "Không có dữ liệu"}</span>
        <label class="sel">Mỗi trang <select id="size">${[20, 50, 100].map((n) => `<option ${n === d.size ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <div class="pages">
          <button type="button" class="icon-btn" data-pg="${d.page - 1}" ${d.page <= 1 ? "disabled" : ""} aria-label="Trang trước">${icon("angle-small-left")}</button>
          ${nums.map((p) => (p === "…" ? `<span class="dots">…</span>` : `<button type="button" class="num ${p === d.page ? "on" : ""}" data-pg="${p}">${p}</button>`)).join("")}
          <button type="button" class="icon-btn" data-pg="${d.page + 1}" ${d.page >= d.pages ? "disabled" : ""} aria-label="Trang sau">${icon("angle-small-right")}</button>
        </div>
      </div>
    </div>
    <p class="note">${icon("lock")}Nhật ký giữ 90 ngày, không lưu IP. Câu nhạy cảm (y tế, pháp luật, khủng hoảng…) không được ghi.</p>`;

  const reloadFirst = () => { L.page = 1; renderLog(true); };
  const lq = $("#lq");
  if (hadFocus !== null) { lq.focus(); lq.setSelectionRange(hadFocus, hadFocus); }
  lq.oninput = () => { clearTimeout(renderLog.t); renderLog.t = setTimeout(() => { L.q = lq.value.trim(); reloadFirst(); }, 300); };

  const pop = $("#ddPop"), ddBtn = $("#ddBtn");
  const setOpen = (o) => { pop.hidden = !o; ddBtn.setAttribute("aria-expanded", o); };
  ddBtn.onclick = (e) => { e.stopPropagation(); setOpen(pop.hidden); };
  pop.onclick = (e) => e.stopPropagation();
  document.onclick = () => setOpen(false);
  document.onkeydown = (e) => { if (e.key === "Escape") setOpen(false); };
  pop.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => { setPreset(b.dataset.p); reloadFirst(); }));
  $("#apply").onclick = () => {
    const f = $("#from").value, t = $("#to").value;
    if (!f || !t) return;
    [L.from, L.to] = f <= t ? [f, t] : [t, f];
    L.preset = "custom"; reloadFirst();
  };
  $("#src").onchange = (e) => { L.src = e.target.value; reloadFirst(); };
  $("#group").onclick = () => { L.group = !L.group; reloadFirst(); };
  $("#size").onchange = (e) => { L.size = Number(e.target.value); reloadFirst(); };
  $("#reload").onclick = () => renderLog(true);
  main.querySelectorAll("[data-pg]").forEach((b) => (b.onclick = () => { L.page = Number(b.dataset.pg); renderLog(true); window.scrollTo?.({ top: 0 }); }));
  main.querySelectorAll("[data-qa]").forEach((b) => (b.onclick = () => {
    const r = d.rows[b.dataset.qa];
    editQa(r.q, L.group ? r.verdicts : r.v ? [r.v] : []);
  }));
  main.querySelectorAll("[data-grp]").forEach((b) => (b.onclick = () => addToGroup(d.rows[b.dataset.grp])));
}

// ---------- hộp thoại ----------
function openDialog(html, onSubmit) {
  dlgForm.innerHTML = html + `<p class="err" id="dlgErr"></p><div class="dlgActs"><button type="button" class="btn" id="dlgCancel">Huỷ</button><button class="btn primary" id="dlgOk">${icon("disk")}Lưu</button></div>`;
  $("#dlgCancel").onclick = () => dlg.close();
  dlgForm.onsubmit = async (e) => {
    e.preventDefault();
    $("#dlgOk").disabled = true;
    try { await onSubmit(); dlg.close(); } catch (err) { if (err.message !== "login") $("#dlgErr").textContent = err.message; }
    finally { const ok = $("#dlgOk"); if (ok) ok.disabled = false; }
  };
  dlg.showModal();
}

/** Mở trình soạn câu hỏi riêng. Câu hỏi đã có trong KHO thì gộp câu phán mới vào câu cũ. */
function editQa(q, add = [], existing = null) {
  const cur = existing || st.qa.find((e) => e.key === matchKey(q));
  const answers = [...new Set([...(cur?.a || []), ...add])];
  openDialog(`<h2>${icon("bookmark")}${cur ? "Sửa câu hỏi riêng" : "Thêm câu hỏi riêng"}</h2>
    <div class="field"><label for="fq">Câu hỏi</label><input type="text" id="fq" maxlength="140" value="${esc(cur?.q || q)}" required></div>
    <p class="hint" id="fkey" style="margin:-6px 0 12px"></p>
    <div class="field"><label>Câu phán</label><div id="fa"></div>
      <span class="hint">Enter để thêm dòng mới. Thầy rút ngẫu nhiên và không lặp lại với cùng người hỏi.</span></div>
    ${cur ? `<button type="button" class="btn sm danger" id="fdel">${icon("trash")}Xoá câu hỏi này khỏi KHO</button>` : ""}`,
  async () => {
    const entry = await api("qa-save", { body: { q: $("#fq").value, answers: lines.filter((l) => l.trim()), oldKey: cur?.key } });
    st.qa = [entry, ...st.qa.filter((e) => e.key !== entry.key && e.key !== cur?.key)];
    toast("Đã lưu vào KHO. Câu hỏi này sẽ không gọi AI nữa.");
    if (st.tab === "log") renderLog(false); else renderQa();
  });
  const lines = answers.length ? answers.slice() : [""];
  mountLines($("#fa"), lines);
  const showKey = () => { $("#fkey").textContent = `Khớp mọi cách hỏi rút gọn thành: “${matchKey($("#fq").value)}”`; };
  $("#fq").oninput = showKey; showKey();
  if (cur) $("#fdel").onclick = async () => {
    if (!confirm("Xoá câu hỏi này khỏi KHO?")) return;
    try { await api("qa-del", { body: { key: cur.key } }); st.qa = st.qa.filter((e) => e.key !== cur.key); dlg.close(); toast("Đã xoá."); show(st.tab); }
    catch (err) { if (err.message !== "login") $("#dlgErr").textContent = err.message; }
  };
}

function addToGroup(r) {
  setKho(st.groups);
  const guess = categoryOf(r.q) || "any";
  openDialog(`<h2>${icon("layers")}Thêm câu phán vào nhóm</h2>
    <p class="hint" style="margin-top:-6px">Câu hỏi gốc: “${esc(r.q)}”. Câu trong nhóm dùng cho mọi câu hỏi cùng loại, nên sửa cho hợp chung.</p>
    <div class="field"><label for="gg">Nhóm</label><select id="gg">${st.groups.map((g) => `<option value="${esc(g.id)}" ${g.id === guess ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select></div>
    <div class="field"><label for="gl">Câu phán</label><textarea id="gl" rows="2" maxlength="140">${esc(r.v)}</textarea></div>`,
  async () => {
    const line = $("#gl").value.trim().replace(/\s+/g, " ");
    if (!line) throw new Error("Câu phán đang trống.");
    const groups = st.groups.map((g) => (g.id === $("#gg").value ? { ...g, lines: [...new Set([...g.lines, line])] } : g));
    const saved = await api("groups", { body: { rev: st.rev, groups } });
    st.groups = saved.groups; st.rev = saved.rev;
    toast("Đã thêm vào nhóm. Trang chính cập nhật trong khoảng 1 phút.");
  });
}

// ---------- câu hỏi riêng ----------
function renderQa() {
  const q = st.qaQuery.trim().toLowerCase();
  const items = st.qa.filter((e) => !q || e.q.toLowerCase().includes(q) || e.a.some((a) => a.toLowerCase().includes(q)));
  main.innerHTML = `
    <div class="head"><div><h1>Câu hỏi riêng</h1><p>${fmt(st.qa.length)} câu hỏi trong KHO, trả lời ngay bằng câu soạn sẵn, không gọi AI</p></div>
      <button class="btn primary" id="qnew">${icon("plus")}Câu hỏi mới</button></div>
    <div class="toolbar"><div class="search">${icon("search")}<input type="search" id="qs" placeholder="Tìm câu hỏi hoặc câu phán…" value="${esc(st.qaQuery)}"></div></div>
    <p class="hint" style="margin:-6px 0 14px">Thầy tự khớp các cách hỏi gần giống nhau: bỏ “thầy ơi”, “có nên… không”, đảo “A hay B”.</p>
    <div class="cards">${items.map((e, i) => `<div class="card">
      <div class="card-head"><h3 class="grow">${esc(e.q)}</h3><span class="tag plain">${e.a.length} câu phán</span>
        <button class="btn sm" data-edit="${i}">${icon("edit")}Sửa</button></div>
      <ul class="answers">${e.a.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></div>`).join("") || `<div class="card empty">${icon("comment-question")}${st.qa.length ? "Không tìm thấy." : "Chưa có câu hỏi nào. Vào Lịch sử để chọn câu hay, hoặc bấm “Câu hỏi mới”."}</div>`}</div>`;
  const qs = $("#qs");
  qs.oninput = () => { st.qaQuery = qs.value; const pos = qs.selectionStart; renderQa(); const n = $("#qs"); n.focus(); n.setSelectionRange(pos, pos); };
  $("#qnew").onclick = () => editQa("", []);
  main.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => editQa(items[b.dataset.edit].q, [], items[b.dataset.edit])));
}

// ---------- danh sách câu phán: mỗi câu một dòng ----------
/** Vẽ trình sửa câu phán vào `el`, sửa thẳng trên mảng `arr`. Enter thêm dòng mới, nút × xoá dòng. */
function mountLines(el, arr, onChange = () => {}) {
  const draw = (focusAt) => {
    el.innerHTML = `<ol class="lines">${arr.map((l, i) => `<li>
        <span class="ln">${i + 1}</span>
        <input type="text" maxlength="140" value="${esc(l)}" data-line="${i}" placeholder="Nhập câu phán…" aria-label="Câu phán ${i + 1}">
        <span class="len ${l.length > 120 ? "warn" : ""}">${l.length}/140</span>
        <button type="button" class="icon-btn sm" data-rm="${i}" title="Xoá câu này" aria-label="Xoá câu ${i + 1}">${icon("cross-small")}</button></li>`).join("")}</ol>
      <button type="button" class="btn sm add-line">${icon("plus")}Thêm câu</button>`;
    el.querySelectorAll("[data-line]").forEach((inp) => {
      const i = +inp.dataset.line;
      inp.oninput = () => {
        arr[i] = inp.value;
        const len = inp.nextElementSibling; len.textContent = `${inp.value.length}/140`; len.classList.toggle("warn", inp.value.length > 120);
        onChange();
      };
      inp.onkeydown = (e) => {
        if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); arr.splice(i + 1, 0, ""); onChange(); draw(i + 1); }
        if (e.key === "Backspace" && !inp.value && arr.length > 1) { e.preventDefault(); arr.splice(i, 1); onChange(); draw(Math.max(0, i - 1)); }
      };
    });
    el.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { arr.splice(+b.dataset.rm, 1); onChange(); draw(); }));
    el.querySelector(".add-line").onclick = () => { arr.push(""); onChange(); draw(arr.length - 1); };
    if (focusAt != null) el.querySelector(`[data-line="${focusAt}"]`)?.focus();
  };
  draw();
}

// ---------- nhóm câu ----------
const openGroups = new Set();
function renderGroups() {
  const gs = st.groups;
  const allOpen = gs.every((g) => openGroups.has(g.id));
  main.innerHTML = `
    <div class="head"><div><h1>Nhóm câu</h1><p>Câu phán theo loại câu hỏi, dùng khi không gọi AI. Lưu xong, trang chính cập nhật trong khoảng 1 phút.</p></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="dirty" id="dirty">${st.dirty ? icon("info") + "Có thay đổi chưa lưu" : ""}</span>
        <button class="btn" id="gnew">${icon("plus")}Nhóm mới</button>
        <button class="btn" id="greset">${icon("undo")}Bỏ thay đổi</button>
        <button class="btn primary" id="gsave" ${st.dirty ? "" : "disabled"}>${icon("disk")}Lưu nhóm câu</button></div></div>
    <div class="toolbar tester"><div class="search">${icon("interrogation")}<input type="text" id="tq" placeholder="Thử một câu hỏi để xem thầy xếp vào nhóm nào…"></div><span id="tr" class="res"></span></div>
    <div class="bar-line"><p class="hint" style="margin:0">Thầy đọc câu hỏi, gặp từ khoá của nhóm nào trước thì rút câu trong nhóm đó. Nhóm ở trên được ưu tiên.</p>
      <button type="button" class="btn sm" id="gall">${icon(allOpen ? "compress" : "expand")}${allOpen ? "Thu gọn tất cả" : "Mở tất cả"}</button></div>
    <div class="cards">${gs.map((g, i) => {
      const open = openGroups.has(g.id);
      const n = g.lines.filter((l) => l.trim()).length;
      return `<div class="card group ${open ? "open" : ""}" data-i="${i}">
      <div class="group-sum">
        <button type="button" class="group-toggle" aria-expanded="${open}" data-toggle>${icon(open ? "angle-small-down" : "angle-small-right")}<b>${esc(g.name)}</b></button>
        <span class="tag plain">${esc(g.id)}</span>${g.system ? `<span class="tag">${icon("lock")}hệ thống</span>` : ""}
        <span class="grow"></span>
        <span class="meta">${g.system ? "" : `${g.keywords.length} từ khoá · `}${n} câu phán</span>
        <button class="icon-btn" data-mv="-1" ${i ? "" : "disabled"} title="Lên" aria-label="Lên">${icon("angle-small-up")}</button>
        <button class="icon-btn" data-mv="1" ${i < gs.length - 1 ? "" : "disabled"} title="Xuống" aria-label="Xuống">${icon("angle-small-down")}</button>
        ${g.system ? "" : `<button class="icon-btn" data-del title="Xoá nhóm" aria-label="Xoá nhóm">${icon("trash")}</button>`}
      </div>
      ${open ? `<div class="group-body">
        <div class="field"><label>Tên nhóm</label><input type="text" data-k="name" value="${esc(g.name)}" maxlength="60"></div>
        <div class="grid2">
          <div class="field"><label>Từ khoá, cách nhau dấu phẩy</label>${g.system ? `<p class="hint" style="margin:0">Nhóm hệ thống, không dùng từ khoá: ${g.id === "open" ? "câu hỏi có “gì, đâu, nào, ai…” mà không thuộc nhóm nào" : g.id === "any" ? "câu có/không, thầy phán dứt khoát" : "câu chưa rõ loại, thầy khuyên khôn ngoan"}.</p>` : `<textarea data-k="keywords" rows="5">${esc(g.keywords.join(", "))}</textarea>`}</div>
          <div class="field"><label>Câu phán <span class="muted" data-count>(${n})</span></label><div data-lines></div>
            <span class="hint">Enter để thêm dòng mới. Câu trống bị bỏ khi lưu.</span></div>
        </div></div>` : ""}</div>`;
    }).join("")}</div>`;

  const markDirty = () => { st.dirty = true; $("#dirty").innerHTML = icon("info") + "Có thay đổi chưa lưu"; $("#gsave").disabled = false; };
  main.querySelectorAll(".card[data-i]").forEach((card) => {
    const g = gs[card.dataset.i];
    card.querySelector("[data-toggle]").onclick = () => { openGroups.has(g.id) ? openGroups.delete(g.id) : openGroups.add(g.id); renderGroups(); };
    card.querySelectorAll("[data-k]").forEach((el) => (el.oninput = () => {
      g[el.dataset.k] = el.dataset.k === "name" ? el.value : el.value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
      markDirty();
    }));
    const box = card.querySelector("[data-lines]");
    if (box) mountLines(box, g.lines, () => { markDirty(); card.querySelector("[data-count]").textContent = `(${g.lines.filter((l) => l.trim()).length})`; });
    card.querySelectorAll("[data-mv]").forEach((b) => (b.onclick = () => { const i = +card.dataset.i, j = i + +b.dataset.mv; [gs[i], gs[j]] = [gs[j], gs[i]]; markDirty(); renderGroups(); }));
    card.querySelector("[data-del]")?.addEventListener("click", () => { if (confirm(`Xoá nhóm “${g.name}”?`)) { gs.splice(+card.dataset.i, 1); st.dirty = true; renderGroups(); } });
  });
  $("#gall").onclick = () => { if (allOpen) openGroups.clear(); else gs.forEach((g) => openGroups.add(g.id)); renderGroups(); };
  $("#tq").oninput = (e) => {
    setKho(gs.map((g) => ({ ...g, lines: g.lines.filter((l) => l.trim()) })));
    const q = e.target.value.trim(), c = q && categoryOf(q);
    $("#tr").textContent = !q ? "" : c ? `→ ${gs.find((g) => g.id === c)?.name || c}` : "→ không khớp từ khoá, dùng nhóm hệ thống";
  };
  $("#gnew").onclick = () => {
    const id = prompt("Mã nhóm mới (chữ thường không dấu, ví dụ: hoc-tap):");
    if (!id) return;
    if (!/^[a-z0-9_-]{1,24}$/.test(id) || gs.some((g) => g.id === id)) return alert("Mã nhóm không hợp lệ hoặc đã có.");
    gs.splice(gs.findIndex((g) => g.system), 0, { id, name: id, keywords: [], lines: [""] });
    openGroups.add(id); st.dirty = true; renderGroups();
  };
  $("#greset").onclick = async () => { if (!st.dirty || confirm("Bỏ mọi thay đổi chưa lưu?")) { await loadKho(); renderGroups(); } };
  $("#gsave").onclick = async () => {
    try {
      const saved = await api("groups", { body: { rev: st.rev, groups: gs.map((g) => ({ ...g, lines: g.lines.filter((l) => l.trim()) })) } });
      st.groups = saved.groups; st.rev = saved.rev; st.dirty = false;
      toast("Đã lưu nhóm câu. Trang chính cập nhật trong khoảng 1 phút.");
      renderGroups();
    } catch (e) { if (e.message !== "login") alert(e.message); }
  };
}

// ---------- mật khẩu ----------
const ALPHA = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genPassword() {
  const r = crypto.getRandomValues(new Uint32Array(16));
  return [0, 4, 8, 12].map((o) => [...r.slice(o, o + 4)].map((n) => ALPHA[n % ALPHA.length]).join("")).join("-");
}
const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast("Đã chép."); } catch { prompt("Chép thủ công:", text); } };

/** Ô mật khẩu có nút tạo ngẫu nhiên, hiện/ẩn và chép. */
const pwField = (id, label, value = "") => `<div class="field"><label for="${id}">${label}</label>
  <div class="pw-row"><input type="password" id="${id}" value="${esc(value)}" minlength="10" autocomplete="new-password" required>
    <button type="button" class="icon-btn" data-gen="${id}" title="Tạo ngẫu nhiên" aria-label="Tạo mật khẩu ngẫu nhiên">${icon("dice")}</button>
    <button type="button" class="icon-btn" data-eye="${id}" title="Hiện / ẩn" aria-label="Hiện hoặc ẩn mật khẩu">${icon("eye")}</button>
    <button type="button" class="icon-btn" data-copy="${id}" title="Chép" aria-label="Chép mật khẩu">${icon("copy-alt")}</button></div>
  <span class="hint">Ít nhất 10 ký tự. Bấm ${icon("dice")} để tạo mật khẩu ngẫu nhiên khó đoán.</span></div>`;
function bindPwFields(root) {
  root.querySelectorAll("[data-gen]").forEach((b) => (b.onclick = () => { const i = $("#" + b.dataset.gen); i.value = genPassword(); i.type = "text"; i.dispatchEvent(new Event("input")); }));
  root.querySelectorAll("[data-eye]").forEach((b) => (b.onclick = () => { const i = $("#" + b.dataset.eye); i.type = i.type === "password" ? "text" : "password"; }));
  root.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = () => copy($("#" + b.dataset.copy).value)));
}

/** Hiện thông tin đăng nhập một lần để admin gửi cho thành viên. */
function showCredentials(email, password, title) {
  const link = `${location.origin}/ops/`;
  const text = `Trang vận hành Thầy Phán: ${link}\nEmail: ${email}\nMật khẩu: ${password}\nĐăng nhập xong nhớ đổi mật khẩu.`;
  dlgForm.innerHTML = `<h2>${icon("key")}${esc(title)}</h2>
    <p class="hint" style="margin-top:-6px">Mật khẩu chỉ hiện lần này. Gửi riêng cho người đó, đừng dán vào nhóm chat chung.</p>
    <div class="cred"><div><span>Trang</span><b>${esc(link)}</b></div><div><span>Email</span><b>${esc(email)}</b></div><div><span>Mật khẩu</span><b class="mono">${esc(password)}</b></div></div>
    <div class="dlgActs"><button type="button" class="btn" id="cpAll">${icon("copy-alt")}Chép tất cả</button><button type="button" class="btn primary" id="dlgDone">Xong</button></div>`;
  $("#cpAll").onclick = () => copy(text);
  $("#dlgDone").onclick = () => dlg.close();
  dlgForm.onsubmit = (e) => e.preventDefault();
  if (!dlg.open) dlg.showModal();
}

function changeMyPassword() {
  openDialog(`<h2>${icon("password")}Đổi mật khẩu của bạn</h2>
    <div class="field"><label for="cur">Mật khẩu hiện tại</label><input type="password" id="cur" autocomplete="current-password" required></div>
    ${pwField("nxt", "Mật khẩu mới")}`,
  async () => {
    await api("me-password", { body: { current: $("#cur").value, next: $("#nxt").value } });
    toast("Đã đổi mật khẩu. Các thiết bị khác của bạn bị đăng xuất.");
  });
  bindPwFields(dlgForm);
}

// ---------- thành viên (chỉ admin) ----------
async function renderMembers() {
  main.innerHTML = `<p class="muted pad">Đang tải thành viên…</p>`;
  let list;
  try { list = (await api("members")).members; } catch (e) { if (e.message !== "login") main.innerHTML = `<p class="pad err">${esc(e.message)}</p>`; return; }
  const me = st.user.email;
  const fmtDay = (t) => (t ? new Date(t).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "");
  main.innerHTML = `
    <div class="head"><div><h1>Thành viên</h1><p>${list.length} người có thể vào trang vận hành</p></div>
      <button class="btn primary" id="madd">${icon("user-add")}Thêm thành viên</button></div>
    <div class="roles">${Object.entries(ROLE).map(([k, r]) => `<div class="role-card"><span class="tag ${k === "admin" ? "ai" : "kho"}">${icon(k === "admin" ? "shield-check" : "user")}${r.label}</span><span class="hint">${r.desc}</span></div>`).join("")}</div>
    <div class="table members">
      <div class="tr th"><div>#</div><div>Thành viên</div><div>Quyền</div><div>Thêm bởi</div><div></div></div>
      ${list.map((m, i) => `<div class="tr">
        <div class="no">${i + 1}</div>
        <div><div class="q">${esc(m.name || m.email)}${m.email === me ? ` <span class="tag plain">bạn</span>` : ""}</div>${m.name ? `<div class="v">${esc(m.email)}</div>` : ""}</div>
        <div><select data-role="${i}" ${m.email === me ? "disabled" : ""} aria-label="Quyền của ${esc(m.email)}">${Object.entries(ROLE).map(([k, r]) => `<option value="${k}" ${m.role === k ? "selected" : ""}>${r.label}</option>`).join("")}</select></div>
        <div class="when">${esc(m.by === "owner" ? "Chủ trang" : m.by || "")}<small>${fmtDay(m.at)}</small></div>
        <div class="acts">${m.email === me ? "" : `<button type="button" class="icon-btn" data-reset="${i}" title="Đặt lại mật khẩu" aria-label="Đặt lại mật khẩu">${icon("key")}</button><button type="button" class="icon-btn" data-del="${i}" title="Xoá thành viên" aria-label="Xoá thành viên">${icon("trash")}</button>`}</div>
      </div>`).join("") || `<div class="empty">${icon("users")}Chưa có thành viên nào. Bấm “Thêm thành viên” để tạo tài khoản đầu tiên.</div>`}
    </div>
    <p class="note">${icon("lock")}Đặt lại mật khẩu, đổi quyền hay xoá thì người đó bị đăng xuất ngay. Mật khẩu khởi tạo (OPS_PASSWORD) luôn đăng nhập được với quyền admin.</p>`;

  $("#madd").onclick = () => {
    openDialog(`<h2>${icon("user-add")}Thêm thành viên</h2>
      <div class="field"><label for="me_">Email</label><input type="email" id="me_" required autocomplete="off"></div>
      <div class="field"><label for="mn">Tên hiển thị <span class="muted">(không bắt buộc)</span></label><input type="text" id="mn" maxlength="60" autocomplete="off"></div>
      <div class="field"><label>Quyền</label><div class="role-pick">${Object.entries(ROLE).map(([k, r], j) => `<label class="role-opt"><input type="radio" name="role" value="${k}" ${j === 1 ? "checked" : ""}><span><b>${r.label}</b><small>${r.desc}</small></span></label>`).join("")}</div></div>
      ${pwField("mp", "Mật khẩu", genPassword())}`,
    async () => {
      const email = $("#me_").value.trim(), password = $("#mp").value;
      const r = await api("member-add", { body: { email, name: $("#mn").value, role: dlgForm.querySelector("[name=role]:checked").value, password } });
      renderMembers();
      setTimeout(() => showCredentials(r.member.email, r.password, "Đã tạo tài khoản"), 0);
    });
    bindPwFields(dlgForm);
  };
  main.querySelectorAll("[data-role]").forEach((sel) => (sel.onchange = async () => {
    const m = list[sel.dataset.role];
    if (!confirm(`Đổi quyền của ${m.email} thành ${ROLE[sel.value].label}? Người này sẽ phải đăng nhập lại.`)) { sel.value = m.role; return; }
    try { await api("member-update", { body: { email: m.email, role: sel.value } }); toast("Đã đổi quyền."); renderMembers(); }
    catch (e) { if (e.message !== "login") { alert(e.message); sel.value = m.role; } }
  }));
  main.querySelectorAll("[data-reset]").forEach((b) => (b.onclick = async () => {
    const m = list[b.dataset.reset];
    if (!confirm(`Tạo mật khẩu mới cho ${m.email}? Mật khẩu cũ hết dùng được và người này bị đăng xuất.`)) return;
    try { const r = await api("member-reset", { body: { email: m.email } }); showCredentials(m.email, r.password, "Mật khẩu mới"); }
    catch (e) { if (e.message !== "login") alert(e.message); }
  }));
  main.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    const m = list[b.dataset.del];
    if (!confirm(`Xoá ${m.email} khỏi trang vận hành? Người này bị đăng xuất ngay.`)) return;
    try { await api("member-del", { body: { email: m.email } }); toast("Đã xoá thành viên."); renderMembers(); }
    catch (e) { if (e.message !== "login") alert(e.message); }
  }));
}

start();
