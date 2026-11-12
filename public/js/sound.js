// Âm thanh quán trà, tổng hợp bằng Web Audio: không file âm thanh, không bản quyền, gần như không tốn dung lượng.
// Trình duyệt chỉ cho phát tiếng sau lần chạm hoặc gõ phím đầu tiên, nên mọi thứ khởi động ở unlock().
// Người dùng tắt/bật bằng nút loa; lựa chọn được nhớ trên máy.

let ctx = null, master = null, sfxBus = null, ambBus = null, noiseBuf = null, brownBuf = null, chimeTimer = 0;
let on = readPref();

function readPref() { try { return localStorage.getItem("tp-sound") !== "off"; } catch { return true; } }
function savePref() { try { localStorage.setItem("tp-sound", on ? "on" : "off"); } catch {} }

function makeNoise(seconds, brown) {
  const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return buf;
}

function setup() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = on ? 0.9 : 0; master.connect(ctx.destination);
  // Nén nhẹ để tiếng cộp không bị vỡ trên loa điện thoại.
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(master);
  sfxBus = ctx.createGain(); sfxBus.connect(comp);
  ambBus = ctx.createGain(); ambBus.gain.value = 0; ambBus.connect(comp);
  noiseBuf = makeNoise(1.5, false);
  brownBuf = makeNoise(6, true);
  return true;
}

// ---------- viên gạch dựng tiếng ----------
const now = () => ctx.currentTime;

function env(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone({ type = "sine", f, f2, t = now(), peak = 0.3, attack = 0.003, decay = 0.3, out = sfxBus }) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + attack + decay);
  env(g, t, peak, attack, decay);
  o.connect(g).connect(out); o.start(t); o.stop(t + attack + decay + 0.05);
}

function noise({ t = now(), peak = 0.3, attack = 0.005, decay = 0.2, type = "bandpass", f = 1000, f2, q = 1, out = sfxBus, buf = noiseBuf }) {
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = buf; s.loop = true;
  fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + attack + decay);
  env(g, t, peak, attack, decay);
  s.connect(fl).connect(g).connect(out); s.start(t, Math.random()); s.stop(t + attack + decay + 0.05);
}

// ---------- các tiếng trong quán ----------
const S = {
  // Mõ gỗ: thầy gõ trong lúc ngẫm.
  mo(t = now(), soft = false) {
    const k = soft ? 0.55 : 1;
    tone({ type: "triangle", f: 760, f2: 700, t, peak: 0.42 * k, decay: 0.16 });
    tone({ type: "sine", f: 2050, t, peak: 0.08 * k, decay: 0.05 });
    noise({ t, peak: 0.12 * k, decay: 0.025, type: "highpass", f: 2500 });
  },
  // Chuông nhỏ: thầy mở mắt.
  bell(t = now(), f = 1320, peak = 0.16, out = sfxBus) {
    [[1, 1], [2.76, 0.45], [5.4, 0.2]].forEach(([m, a], i) => tone({ f: f * m, t, peak: peak * a, attack: 0.004, decay: 2.2 - i * 0.6, out }));
  },
  // Gió lướt: con dấu rơi, quạt vung lên.
  whoosh(t = now(), dur = 0.38, from = 500, to = 2600, peak = 0.22) {
    noise({ t, peak, attack: dur * 0.7, decay: dur * 0.4, f: from, f2: to, q: 1.2 });
  },
  // Cộp: con dấu đập xuống bàn gỗ.
  stamp(t = now()) {
    tone({ f: 130, f2: 42, t, peak: 0.95, attack: 0.002, decay: 0.32 });
    noise({ t, peak: 0.55, decay: 0.09, type: "lowpass", f: 900 });
    tone({ type: "triangle", f: 240, f2: 200, t, peak: 0.3, decay: 0.12 });
    noise({ t: t + 0.01, peak: 0.08, decay: 0.25, type: "bandpass", f: 3200, q: 0.8 });
  },
  // Quạt gõ bàn: tiếng chát gỗ sắc.
  clack(t = now()) {
    noise({ t, peak: 0.7, decay: 0.05, type: "highpass", f: 1400 });
    tone({ type: "triangle", f: 520, f2: 380, t, peak: 0.5, decay: 0.14 });
    tone({ f: 95, f2: 50, t, peak: 0.5, decay: 0.2 });
  },
  // Thở dài.
  sigh(t = now()) {
    noise({ t, peak: 0.2, attack: 0.35, decay: 0.95, f: 1100, f2: 380, q: 0.9 });
    tone({ type: "sine", f: 190, f2: 130, t: t + 0.05, peak: 0.035, attack: 0.3, decay: 0.9 });
  },
  // Hừm: thầy bắt đầu khó chịu.
  hum(t = now()) {
    tone({ type: "sawtooth", f: 118, f2: 104, t, peak: 0.05, attack: 0.06, decay: 0.4 });
    noise({ t, peak: 0.05, attack: 0.05, decay: 0.35, f: 500, q: 2 });
  },
  // Húp trà rồi khà.
  slurp(t = now()) {
    for (let i = 0; i < 4; i++) noise({ t: t + i * 0.07, peak: 0.1, attack: 0.02, decay: 0.07, f: 1300 + i * 380, q: 3 });
    noise({ t: t + 1.15, peak: 0.13, attack: 0.08, decay: 0.55, f: 1500, f2: 700, q: 0.7 });
  },
  // Giấy sột soạt: lấy thẻ lời phán.
  rustle(t = now()) {
    for (let i = 0; i < 5; i++) noise({ t: t + i * 0.045 + Math.random() * 0.02, peak: 0.07, decay: 0.05, f: 2600 + Math.random() * 2000, q: 0.8 });
  }
};

// ---------- tiếng nền: quán trà đêm ----------
let ambStarted = false;
function startAmbience() {
  if (ambStarted) return; ambStarted = true;
  noise({ t: now(), peak: 1, attack: 0.01, decay: 1e5, type: "lowpass", f: 420, q: 0.5, out: ambBus, buf: brownBuf }); // tiếng phòng, mưa xa
  ambBus.gain.setTargetAtTime(0.05, now(), 1.5);
  scheduleChime();
}
function scheduleChime() {
  clearTimeout(chimeTimer);
  chimeTimer = setTimeout(() => {
    if (ctx && on && ctx.state === "running") {
      const notes = [880, 988, 1175, 1319, 1568];
      const t = now();
      for (let i = 0, n = 1 + Math.floor(Math.random() * 3); i < n; i++) S.bell(t + i * (0.18 + Math.random() * 0.3), notes[Math.floor(Math.random() * notes.length)], 0.035, ambBus);
    }
    scheduleChime();
  }, 14000 + Math.random() * 18000);
}

// ---------- API cho app.js ----------
export const sound = {
  get on() { return on; },
  // Gọi ở lần chạm/gõ đầu tiên.
  unlock() {
    if (!on || !setup()) return;
    if (ctx.state === "suspended") ctx.resume();
    startAmbience();
  },
  toggle() {
    on = !on; savePref();
    if (on) { this.unlock(); master.gain.setTargetAtTime(0.9, now(), 0.05); }
    else if (ctx) master.gain.setTargetAtTime(0, now(), 0.05);
    return on;
  },
  // Phát một tiếng sau `delay` giây; im lặng nếu đang tắt hoặc trình duyệt chưa cho phát.
  play(name, delay = 0, ...args) {
    if (!on || !ctx || ctx.state !== "running") return;
    S[name]?.(now() + delay, ...args);
  }
};

// Tab ẩn thì tạm dừng cho đỡ tốn pin.
document.addEventListener("visibilitychange", () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend(); else if (on) ctx.resume();
});
