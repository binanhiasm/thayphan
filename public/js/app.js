import { safety, makePicker, isCloser, CLOSERS, normKey, HOTLINE } from "./rules.js";

const $ = (id) => document.getElementById(id);
const app = $("app"), panel = $("panel"), modal = $("modal");
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const F = { fill: "forwards" };
const pick = makePicker();

let lastQ = "", verdict = "", draft = "", view = "idle", lastActivity = Date.now(), stamps = 0;
const said = {};      // các câu AI đã phán cho từng câu hỏi
const againCount = {}; // số lần thỉnh lại từng câu hỏi

// ---------- lưu trữ nhỏ trên máy người dùng ----------
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } }
const count = () => +(store("tp-count") || 0);
function tally() { const n = count(); $("tally").textContent = n ? `Đã thỉnh ${n} lần` : ""; }
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const anim = (el, kf, o) => (reduce.matches ? null : el.animate(kf, o));

// ---------- câu gợi ý theo giờ ----------
function samples() {
  const h = new Date().getHours();
  const S = h >= 5 && h < 10 ? ["Hôm nay con mặc gì?", "Cà phê hay ngủ thêm 15 phút?", "Có nên xin nghỉ hôm nay không?"]
    : h >= 10 && h < 14 ? ["Trưa nay con ăn gì?", "Trà sữa hay cà phê?", "Con nên nghỉ việc không thầy?"]
    : h >= 14 && h < 18 ? ["Chiều nay uống gì cho tỉnh?", "Làm tiếp hay về sớm?", "Mai có nên nói thẳng với sếp không?"]
    : h >= 18 && h < 23 ? ["Tối nay ăn gì?", "Ở nhà hay ra ngoài?", "Có nên nhắn cho người ấy không?"]
    : ["Ăn khuya hay đi ngủ?", "Ngủ hay cày thêm một tập?", "Có nên gửi tin nhắn đó không?"];
  return count() > 5 ? [S[Math.floor(Math.random() * S.length)]] : S;
}

// =====================================================================
// Nét mặt và cử chỉ của thầy
// =====================================================================
const eyes = {
  open() { $("eyesClosed").setAttribute("opacity", "0"); $("peek").setAttribute("opacity", "0"); $("eyesOpen").setAttribute("opacity", "1");
    anim($("eyesOpen"), [{ transform: "scaleY(.1)" }, { transform: "scaleY(1)" }], { duration: 160, easing: "ease-out" }); },
  close() { $("eyesOpen").setAttribute("opacity", "0"); $("peek").setAttribute("opacity", "0"); $("eyesClosed").setAttribute("opacity", "1"); $("clR").setAttribute("opacity", "1"); }
};

// Hé một mắt khi con gõ
let peeking = false, peekTimer = 0, peekPupil = null;
function peekOn() {
  if (peeking || reduce.matches || view !== "idle") return;
  peeking = true; $("clR").setAttribute("opacity", "0"); $("peek").setAttribute("opacity", "1");
  anim($("peek"), [{ transform: "scaleY(.1)" }, { transform: "scaleY(1)" }], { duration: 180, easing: "ease-out" });
  peekPupil = anim($("peekP"), [{ transform: "translateX(-1.4px)" }, { transform: "translateX(1.4px)" }], { duration: 520, iterations: Infinity, direction: "alternate", easing: "ease-in-out" });
}
function peekOff() { clearTimeout(peekTimer); if (!peeking) return; peeking = false; peekPupil?.cancel(); $("peek").setAttribute("opacity", "0"); $("clR").setAttribute("opacity", "1"); }

// Nhấp trà khi chờ lâu
let sipping = false;
async function sip() {
  if (sipping || reduce.matches) return; sipping = true;
  const g = $("sip");
  const a = g.animate([
    { opacity: 0, transform: "translate(100px,174px) rotate(0deg)" },
    { opacity: 1, transform: "translate(100px,170px) rotate(0deg)", offset: .12 },
    { opacity: 1, transform: "translate(100px,126px) rotate(-14deg)", offset: .38 },
    { opacity: 1, transform: "translate(100px,124px) rotate(-30deg)", offset: .62 },
    { opacity: 1, transform: "translate(100px,170px) rotate(0deg)", offset: .9 },
    { opacity: 0, transform: "translate(100px,172px) rotate(0deg)" }], { duration: 2800, easing: "ease-in-out" });
  await a.finished.catch(() => {});
  $("kha").animate([{ opacity: 0, transform: "translate(0,4px)" }, { opacity: 1, transform: "none", offset: .25 }, { opacity: 1, transform: "none", offset: .7 }, { opacity: 0, transform: "translate(4px,-8px)" }], { duration: 1500 });
  $("puff").animate([{ opacity: .6, transform: "scale(1)" }, { opacity: 0, transform: "translate(16px,-6px) scale(2.4)" }], { duration: 900, easing: "ease-out" });
  sipping = false;
}

// Thầy gắt dần khi thỉnh lại
function frown(level) {
  if (level < 1) {
    $("browL").getAnimations().forEach((a) => a.cancel()); $("browR").getAnimations().forEach((a) => a.cancel());
    $("anger").setAttribute("opacity", "0"); return;
  }
  anim($("browL"), [{ transform: "rotate(0deg)" }, { transform: "translateY(1px) rotate(16deg)" }], { duration: 260, easing: "ease-out", ...F });
  anim($("browR"), [{ transform: "rotate(0deg)" }, { transform: "translateY(1px) rotate(-16deg)" }], { duration: 260, easing: "ease-out", ...F });
  if (reduce.matches) { $("browL").style.transform = "translateY(1px) rotate(16deg)"; $("browR").style.transform = "translateY(1px) rotate(-16deg)"; }
}
function sigh() {
  anim($("master"), [{ transform: "translateY(0)" }, { transform: "translateY(4px)", offset: .45 }, { transform: "translateY(0)" }], { duration: 1100, easing: "ease-in-out" });
  anim($("puff"), [{ opacity: .75, transform: "scale(1)" }, { opacity: 0, transform: "translate(20px,-4px) scale(3)" }], { duration: 1000, delay: 250, easing: "ease-out" });
  anim($("potpuff"), [{ opacity: .9, transform: "translateY(0) scale(1)" }, { opacity: 0, transform: "translateY(-90px) scale(4)" }], { duration: 1100, delay: 350, easing: "ease-out" });
  $("anger").setAttribute("opacity", "1");
  anim($("anger"), [{ transform: "scale(0)" }, { transform: "scale(1.3)", offset: .6 }, { transform: "scale(1)" }], { duration: 300, delay: 500, fill: "both" });
}
const shake = (px = 3) => anim(app, [{ transform: "translate(0,0)" }, { transform: `translate(-${px}px,2px)` }, { transform: `translate(${px}px,-2px)` }, { transform: "translate(-2px,1px)" }, { transform: "translate(0,0)" }], { duration: 210 });
async function fanSlam() {
  if (reduce.matches) return;
  const fan = $("fan"); fan.setAttribute("opacity", "1");
  await fan.animate([{ opacity: 0, transform: "rotate(-120deg)" }, { opacity: 1, transform: "rotate(-150deg)" }], { duration: 300, easing: "ease-out", ...F }).finished;
  await wait(260);
  await fan.animate([{ opacity: 1, transform: "rotate(-150deg)" }, { opacity: 1, transform: "rotate(-18deg)" }], { duration: 150, easing: "cubic-bezier(.6,0,1,.6)", ...F }).finished;
  shake(4); buzz(25);
  document.querySelectorAll(".cup,.pot").forEach((c) => c.animate([{ translate: "0 0" }, { translate: "0 -6px" }, { translate: "0 0" }], { duration: 260, easing: "ease-out" }));
  await wait(550);
  fan.animate([{ opacity: 1, transform: "rotate(-18deg)" }, { opacity: 0, transform: "rotate(-30deg)" }], { duration: 300, ...F });
}
function buzz(ms) { if (stamps > 3) return; try { navigator.vibrate?.(ms); } catch {} }

// Chạm vào thầy
$("master").addEventListener("click", () => {
  if (view !== "idle" || reduce.matches) return;
  eyes.open(); setTimeout(eyes.close, 900);
  const ta = $("q"); if (ta && !ta.value) { ta.placeholder = "Hỏi đi con. Thầy nghe."; ta.focus(); }
});

// =====================================================================
// Các màn hình
// =====================================================================
function idle() {
  view = "idle"; lastActivity = Date.now();
  app.classList.remove("asking", "care"); eyes.close(); frown(0);
  panel.innerHTML = `<div class="view">
    <p class="hint">Thưa thầy, con muốn hỏi…</p>
    <div class="box"><textarea id="q" rows="2" maxlength="140" placeholder="Con nên nghỉ việc không thầy?" aria-label="Câu hỏi cho thầy">${esc(draft)}</textarea>
      <button class="send" id="send" aria-label="Thỉnh thầy" ${draft.trim() ? "" : "disabled"}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg></button></div>
    <div class="chips">${samples().map((s) => `<button class="chip">${esc(s)}</button>`).join("")}</div>
    <p class="vow">Thầy phán một câu. Không giải thích. Sai thầy chịu.</p></div>`;
  const ta = $("q"), send = $("send");
  ta.oninput = () => {
    draft = ta.value; send.disabled = !ta.value.trim(); lastActivity = Date.now();
    if (ta.value.trim().length >= 3) { peekOn(); clearTimeout(peekTimer); peekTimer = setTimeout(peekOff, 3500); } else peekOff();
  };
  ta.onblur = () => { peekTimer = setTimeout(peekOff, 600); };
  ta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); ask(ta.value); } };
  send.onclick = () => ask(ta.value);
  panel.querySelectorAll(".chip").forEach((c) => (c.onclick = () => ask(c.textContent)));
}

async function getVerdict(q) {
  const key = normKey(q), prev = said[key] || (said[key] = []);
  if (prev.length >= 5) { said[key] = []; return CLOSERS[Math.floor(Math.random() * CLOSERS.length)]; }
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 14000);
    const r = await fetch("/api/phan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q, prev }), signal: ctl.signal });
    clearTimeout(t);
    if (r.ok) { const j = await r.json(); if (j.verdict) { if (j.source === "ai" || j.source === "cache") prev.push(j.verdict); return j.verdict; } }
  } catch { /* mất mạng hoặc AI lỗi: thầy rút quẻ trong ống */ }
  return pick(q, verdict);
}

async function ask(q, again) {
  q = (q || "").trim().slice(0, 140); if (!q) return;
  peekOff(); lastQ = q; draft = ""; view = "asking";
  const s = safety(q);
  if (s?.kind === "care") return care(q);

  const key = normKey(q);
  againCount[key] = again ? (againCount[key] || 0) + 1 : 0;
  const n = againCount[key];
  app.classList.add("asking");
  panel.innerHTML = `<div class="view"><p class="asked">Con hỏi:</p><p class="q">“${esc(q)}”</p><div class="dots" aria-hidden="true"><i></i><i></i><i></i></div><p class="hint" style="margin-top:10px">${n >= 2 ? "Thầy thở dài…" : n === 1 ? "Lại hỏi nữa hả con…" : "Thầy đang ngẫm…"}</p></div>`;
  if (n === 1) frown(1);
  if (n >= 2) { frown(1); sigh(); }

  const [v] = await Promise.all([s ? Promise.resolve(s.line) : getVerdict(q), wait(again ? 1300 : 1900)]);
  verdict = v;
  store("tp-count", String(count() + 1)); tally();
  if (isCloser(v)) await fanSlam();
  reveal();
}

function care(q) {
  view = "care"; app.classList.remove("asking"); app.classList.add("care"); eyes.close(); frown(0);
  panel.innerHTML = `<div class="view"><p class="asked">Con hỏi:</p><p class="q">“${esc(q)}”</p>
    <div class="help"><p class="line">Câu này thầy không phán. Con gọi cho một người con thương ngay bây giờ nhé.</p>
      <span class="num">Nếu cần một người lạ biết lắng nghe, gọi ${esc(HOTLINE.name)}<b><a href="tel:${HOTLINE.tel}" style="color:inherit">${HOTLINE.number}</a></b>Nguy hiểm ngay lúc này thì gọi <b style="display:inline;font-size:inherit">115</b>.</span></div>
    <button class="link" id="new">Hỏi thầy câu khác</button></div>`;
  $("new").onclick = idle;
}

function reveal() {
  view = "verdict"; app.classList.remove("asking");
  panel.innerHTML = `<div class="view"><p class="label">LỜI THẦY PHÁN</p><div class="verdict" id="v"><span id="vt"></span><div class="ink" id="ink"></div><div class="seal" id="seal" hidden>判</div></div>
    <div class="acts wait" id="acts"><div class="row"><button class="btn ghost" id="again">Thỉnh lại</button><button class="btn gold" id="share">Lấy thẻ lời phán</button></div>
    <button class="link" id="new">Hỏi thầy câu khác</button></div></div>`;
  const vt = $("vt"), seal = $("seal"), acts = $("acts");
  vt.textContent = `“${verdict}”`;
  $("again").onclick = () => ask(lastQ, true);
  $("share").onclick = card;
  $("new").onclick = idle;
  if (reduce.matches) { seal.hidden = false; acts.classList.remove("wait"); return; }

  // A+B: chữ hiện mờ → thầy mở mắt → con dấu rơi → cộp
  vt.animate([{ opacity: 0, filter: "blur(6px)" }, { opacity: .35, filter: "blur(4px)" }], { duration: 260, ...F });
  setTimeout(() => {
    eyes.open();
    $("aura").animate([{ opacity: 0 }, { opacity: 1, offset: .25 }, { opacity: .35 }, { opacity: 0 }], { duration: 1600, easing: "ease-out" });
    $("flash").animate([{ opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: 0 }], { duration: 900, easing: "ease-out" });
  }, 220);
  setTimeout(() => {
    seal.hidden = false;
    seal.animate([{ transform: "translate(30px,-140px) scale(2.8) rotate(-28deg)", opacity: 0 }, { transform: "translate(8px,-40px) scale(1.6) rotate(-14deg)", opacity: 1, offset: .6 },
      { transform: "translate(0,0) scale(.9) rotate(-8deg)", opacity: 1, offset: .86 }, { transform: "translate(0,0) scale(1) rotate(-8deg)", opacity: 1 }], { duration: 440, easing: "cubic-bezier(.55,0,.9,.35)", ...F });
  }, 480);
  setTimeout(() => {
    stamps++; shake(3); buzz(18);
    $("ink").animate([{ opacity: .9, transform: "scale(.4)" }, { opacity: 0, transform: "scale(2.6)" }], { duration: 620, easing: "ease-out", ...F });
    $("v").animate([{ transform: "scale(.97)" }, { transform: "scale(1)" }], { duration: 260, easing: "cubic-bezier(.3,1.6,.5,1)" });
    vt.animate([{ opacity: .35, filter: "blur(4px)" }, { opacity: 1, filter: "blur(0)" }], { duration: 340, easing: "ease-out", ...F });
  }, 920);
  setTimeout(() => acts.classList.remove("wait"), 1300);
  setTimeout(() => { if (view === "verdict") eyes.close(); }, 2600);
}

// =====================================================================
// Thẻ lời phán để chia sẻ
// =====================================================================
function wrap(ctx, text, maxW) {
  const words = text.split(" "), lines = []; let line = "";
  for (const w of words) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines;
}
function fit(ctx, text, maxW, sizes, maxLines, family) {
  for (const s of sizes) { ctx.font = `700 ${s}px ${family}`; const l = wrap(ctx, text, maxW); if (l.length <= maxLines) return { size: s, lines: l }; }
  const s = sizes[sizes.length - 1]; ctx.font = `700 ${s}px ${family}`; const l = wrap(ctx, text, maxW).slice(0, maxLines);
  l[maxLines - 1] = l[maxLines - 1].replace(/\s*\S*$/, "…"); return { size: s, lines: l };
}
async function makeCard() {
  try { await document.fonts.ready; } catch {}
  const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#f4e5bf"); g.addColorStop(1, "#e2c98f"); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = "#8e2419"; x.lineWidth = 10; x.strokeRect(50, 50, W - 100, H - 100); x.lineWidth = 2; x.strokeRect(74, 74, W - 148, H - 148);
  x.textAlign = "center";
  x.fillStyle = "#b08a3e"; x.font = "700 34px 'Noto Serif TC',serif"; x.fillText("一 言 定 奪", W / 2, 170);
  x.fillStyle = "#8e2419"; x.font = "700 64px 'Noto Serif Display',Georgia,serif"; x.fillText("LỜI THẦY PHÁN", W / 2, 258);
  x.fillStyle = "#7a5a32"; x.font = "italic 500 32px 'Be Vietnam Pro',sans-serif"; x.fillText("Con hỏi:", W / 2, 370);
  x.fillStyle = "#3a1d10"; const qf = fit(x, `“${lastQ}”`, 820, [42, 36], 3, "'Be Vietnam Pro',sans-serif"); x.font = `500 ${qf.size}px 'Be Vietnam Pro',sans-serif`;
  let y = 432; qf.lines.forEach((l) => { x.fillText(l, W / 2, y); y += qf.size * 1.4; });
  x.strokeStyle = "#9c7d45"; x.setLineDash([10, 10]); x.beginPath(); x.moveTo(200, y + 10); x.lineTo(W - 200, y + 10); x.stroke(); x.setLineDash([]);
  x.fillStyle = "#8e2419"; x.font = "700 32px 'Be Vietnam Pro',sans-serif"; x.fillText("THẦY PHÁN:", W / 2, y + 90);
  // lời phán: co chữ cho vừa khoảng trống phía trên con dấu
  const top = y + 175, bottom = H - 300;
  const sizes = [66, 58, 50, 44], fam = "'Noto Serif Display',Georgia,serif";
  let vf = null;
  for (const s of sizes) { x.font = `700 ${s}px ${fam}`; const l = wrap(x, `“${verdict}”`, 860); if (top + (l.length - 1) * s * 1.32 <= bottom) { vf = { size: s, lines: l }; break; } }
  if (!vf) vf = fit(x, `“${verdict}”`, 860, [44], Math.max(1, Math.floor((bottom - top) / (44 * 1.32)) + 1), fam);
  x.fillStyle = "#2a120a"; x.font = `700 ${vf.size}px ${fam}`;
  // căn giữa khối lời phán trong khoảng trống, để câu ngắn không bỏ trống nửa thẻ
  const blockH = (vf.lines.length - 1) * vf.size * 1.32, room = bottom - top;
  let vy = top + Math.max(0, (room - blockH) / 2.4); vf.lines.forEach((l) => { x.fillText(l, W / 2, vy); vy += vf.size * 1.32; });
  // con dấu
  x.save(); x.translate(W / 2, H - 205); x.rotate(-0.12);
  x.fillStyle = "#b3261b"; x.fillRect(-56, -56, 112, 112); x.strokeStyle = "#f4e5bf"; x.lineWidth = 4; x.strokeRect(-46, -46, 92, 92);
  x.fillStyle = "#f4e5bf"; x.font = "700 60px 'Noto Serif TC',serif"; x.textBaseline = "middle"; x.fillText("判", 0, 4); x.restore();
  x.textBaseline = "alphabetic";
  x.fillStyle = "#7a5a32"; x.font = "600 28px 'Be Vietnam Pro',sans-serif"; x.fillText(`Quẻ số ${String(count()).padStart(3, "0")} · sai thầy chịu`, W / 2, H - 112);
  x.font = "500 26px 'Be Vietnam Pro',sans-serif"; x.fillStyle = "#8e2419"; x.fillText(`Hỏi thầy tại ${location.host}`, W / 2, H - 78);
  return c;
}
async function card() {
  const c = await makeCard();
  const url = c.toDataURL("image/png");
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  const file = blob && new File([blob], "loi-thay-phan.png", { type: "image/png" });
  const canShare = file && navigator.canShare?.({ files: [file] });
  modal.innerHTML = `<div class="sheet" role="dialog" aria-label="Thẻ lời phán"><img src="${url}" alt="Thẻ lời phán: ${esc(verdict)}"><p>Lưu ảnh rồi gửi cho đứa bạn cũng đang phân vân.</p>
    <div class="row">${canShare ? `<button class="btn gold" id="shareNative">Chia sẻ</button>` : ""}<a class="btn ${canShare ? "ghost" : "gold"}" id="save" href="${url}" download="loi-thay-phan.png">Lưu ảnh</a><button class="btn ghost" id="copy">Copy lời phán</button></div>
    <button class="link" id="close">Đóng</button></div>`;
  modal.hidden = false; panel.style.visibility = "hidden";
  const shut = () => { modal.hidden = true; panel.style.visibility = ""; };
  $("close").onclick = shut;
  modal.onclick = (e) => { if (e.target === modal) shut(); };
  document.addEventListener("keydown", function onEsc(e) { if (e.key === "Escape") { shut(); document.removeEventListener("keydown", onEsc); } });
  if (canShare) $("shareNative").onclick = () => navigator.share({ files: [file], title: "Lời Thầy Phán", text: `Thầy phán: “${verdict}”` }).catch(() => {});
  $("copy").onclick = (e) => {
    const b = e.currentTarget, t = `Con hỏi: "${lastQ}"\nThầy phán: "${verdict}"\n— Thầy Phán · ${location.host}`;
    navigator.clipboard.writeText(t).then(() => (b.textContent = "Đã chép"), () => (b.textContent = "Chụp màn hình giúp thầy"));
  };
}

// =====================================================================
// Khởi động
// =====================================================================
setInterval(() => {
  const ta = $("q");
  const typing = ta && document.activeElement === ta && ta.value;
  if (view === "idle" && !typing && !document.hidden && Date.now() - lastActivity > 12000) { lastActivity = Date.now(); sip(); }
}, 1000);
["pointerdown", "keydown"].forEach((ev) => addEventListener(ev, () => (lastActivity = Date.now()), { passive: true }));

tally(); idle();
