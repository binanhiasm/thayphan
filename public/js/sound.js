// Âm thanh quán trà: hiệu ứng tổng hợp bằng Web Audio (không file, không bản quyền) + nhạc nền public/audio/nhac-nen.mp3.
// Trình duyệt chỉ cho phát tiếng sau lần chạm hoặc gõ phím đầu tiên, nên mọi thứ khởi động ở unlock().
// Người dùng tắt/bật bằng nút loa; lựa chọn được nhớ trên máy.

let ctx = null, master = null, mixIn = null, sfxBus = null, stampBus = null, ambBus = null, noiseBuf = null, brownBuf = null;
let on = readPref();
// Mức hiệu ứng và tiếng nền, chỉnh cho độ to tương đương bản cũ nhưng không qua bộ nén.
const SFX_LEVEL = 0.85, AMB_LEVEL = 0.4;
// Nhạc nền (bản 慢品一盏茶 có thêm bộ gõ). Có file thì phát nhạc; không tải được thì quay về tiếng nền tổng hợp.
const MUSIC_SRC = "/audio/nhac-nen.mp3", MUSIC_LEVEL = 0.42;

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
  const mix = mixChain(ctx, master); mixIn = mix;
  // Hiệu ứng để dư ~6 dB đỉnh: bộ chặn đỉnh gần như không phải làm việc.
  sfxBus = ctx.createGain(); sfxBus.gain.value = SFX_LEVEL; sfxBus.connect(mix);
  ambBus = ctx.createGain(); ambBus.gain.value = 0; ambBus.connect(mix);
  noiseBuf = makeNoise(1.5, false);
  brownBuf = makeNoise(6, true);
  stampBus = makeStampBus(ctx, sfxBus);
  return true;
}

// Chuỗi trộn cuối: lọc bỏ siêu trầm rồi chặn đỉnh làm lưới an toàn.
// Không dùng bộ nén thường: DynamicsCompressor của trình duyệt tự khuếch đại bù sau khi nén,
// làm tiếng đập bị bóp rồi bơm lên, nghe phập phồng và vỡ. Mức gốc đã chừa ~6 dB nên bộ chặn hầu như không phải làm gì.
function mixChain(c, out) {
  // Bỏ phần dưới 45Hz: loa điện thoại, laptop không phát được, chỉ làm rè.
  const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 45; hp.Q.value = 0.7;
  const lim = c.createDynamicsCompressor(); lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.003; lim.release.value = 0.15;
  const trim = c.createGain(); trim.gain.value = 0.8;
  hp.connect(trim).connect(lim).connect(out);
  return hp;
}

// Con dấu đi qua một gian phòng gỗ nhỏ (vang ngắn 0,6s) để nghe chắc và trang nghiêm, không khô như gõ bàn.
function makeStampBus(c, out) {
  const bus = c.createGain(), room = c.createConvolver(), wet = c.createGain();
  const len = Math.floor(c.sampleRate * 0.6), ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 5); }
  room.buffer = ir; wet.gain.value = 0.22;
  bus.connect(out); bus.connect(room).connect(wet).connect(out);
  return bus;
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
// Mõ nhỏ cho tiếng gõ chữ: gam ngũ cung Sol (G A B D E), cùng giọng với nhạc nền.
const KEY_NOTES = [783.99, 880, 987.77, 1174.66, 1318.51, 1567.98];
let lastKey = -1, lastNote = -1;
function pickKey() { let i; do { i = Math.floor(Math.random() * KEY_NOTES.length); } while (i === lastNote); lastNote = i; return KEY_NOTES[i]; }
function moTick(t, f, peak) {
  tone({ type: "triangle", f, f2: f * 0.93, t, peak, attack: 0.001, decay: 0.07 });
  tone({ f: f * 2.7, t, peak: peak * 0.18, attack: 0.001, decay: 0.02 });
  noise({ t, peak: peak * 0.35, attack: 0.001, decay: 0.008, type: "highpass", f: 3000 });
}

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
  // Đóng mộc: con dấu gỗ cứng ấn xuống án thư. Gọn một tiếng "cộp" chắc, có thớ gỗ, không ầm.
  // Mặt dấu chạm giấy (tách sắc) → thân gỗ cộng hưởng (G3, khớp giọng Sol của nhạc) → lực ấn trầm, ngắn
  // → con dấu nhấc lên → bát chuông trầm ngân rất khẽ cho phần "nghiêm".
  stamp(t = now()) {
    const o = stampBus;
    noise({ t, peak: 0.432, attack: 0.001, decay: 0.012, type: "highpass", f: 3800, out: o });
    tone({ f: 196, f2: 188, t, peak: 0.675, attack: 0.001, decay: 0.11, out: o });
    tone({ f: 418, f2: 405, t, peak: 0.324, attack: 0.001, decay: 0.07, out: o });
    tone({ type: "triangle", f: 905, t, peak: 0.135, attack: 0.001, decay: 0.035, out: o });
    tone({ f: 96, f2: 56, t, peak: 0.972, attack: 0.002, decay: 0.17, out: o });
    noise({ t, peak: 0.405, attack: 0.002, decay: 0.05, type: "lowpass", f: 620, out: o });
    noise({ t: t + 0.006, peak: 0.095, attack: 0.001, decay: 0.008, type: "highpass", f: 5000, out: o });
    noise({ t: t + 0.32, peak: 0.047, attack: 0.004, decay: 0.03, type: "bandpass", f: 2400, q: 1.5, out: o });
    [[1, 0.055, 2.6], [2.71, 0.018, 1.6]].forEach(([m, a, d]) => tone({ f: 98 * m, t: t + 0.04, peak: a, attack: 0.03, decay: d }));
  },
  // Quạt gõ bàn: tiếng chát gỗ sắc.
  clack(t = now()) {
    noise({ t, peak: 0.7, decay: 0.05, type: "highpass", f: 1400 });
    tone({ type: "triangle", f: 520, f2: 380, t, peak: 0.5, decay: 0.14 });
    tone({ f: 95, f2: 50, t, peak: 0.5, decay: 0.2 });
  },
  // Gõ chữ = gõ mõ nhỏ: mỗi phím một tiếng "cốc", cao độ nhảy lung tung trong gam ngũ cung Sol cho vui tai.
  key(t = now(), kind = "char") {
    if (t - lastKey < 0.045 && kind === "char") return; lastKey = t;
    if (kind === "back") { tone({ type: "triangle", f: 520, f2: 430, t, peak: 0.11, decay: 0.08 }); return; }
    if (kind === "ask") { [0, 0.09].forEach((d, i) => moTick(t + d, KEY_NOTES[3 + i], 0.15)); return; }
    if (kind === "paste") { [0, 0.06, 0.12, 0.18].forEach((d) => moTick(t + d, pickKey(), 0.09)); return; }
    moTick(t, pickKey(), kind === "space" ? 0.08 : 0.13);
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

// ---------- tiếng nền: gian điện trà, hơi hướng thiền Trung Hoa ----------
// Ngân trầm (D và A) làm nền, chuông xoay thỉnh thoảng ngân dài, đàn tranh rải vài nốt ngũ cung (D E F# A B).
// Mọi thứ đi qua một lớp vang dài cho cảm giác gian phòng rộng.
// Các hàm nhận ctx riêng để có thể dựng bản nghe thử bằng OfflineAudioContext.

const PENTA = [293.66, 329.63, 369.99, 440, 493.88, 587.33, 659.25, 739.99, 880]; // D4 → A5, gam ngũ cung D cung
const pluckCache = new Map();

function reverb(c, seconds = 4.5) {
  const len = Math.floor(c.sampleRate * seconds), ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  const cv = c.createConvolver(); cv.buffer = ir; return cv;
}

// Dây đàn gảy (Karplus-Strong): tiếng đàn tranh mộc hơn hẳn sóng sin.
function pluckBuffer(c, f) {
  const key = `${c.sampleRate}:${f}`;
  if (pluckCache.has(key)) return pluckCache.get(key);
  const sr = c.sampleRate, len = Math.floor(sr * 3.2), buf = c.createBuffer(1, len, sr), d = buf.getChannelData(0);
  const N = Math.max(2, Math.round(sr / f)), damp = 0.4985 + 0.0012 * (f / 900);
  for (let i = 0; i < N; i++) d[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.sin((Math.PI * i) / N));
  for (let i = N; i < len; i++) d[i] = damp * (d[i - N] + d[i - N + 1]);
  let peak = 0; for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  for (let i = 0; i < len; i++) d[i] /= peak || 1;
  pluckCache.set(key, buf); return buf;
}

function zheng(c, out, t, f, peak = 0.22) {
  const s = c.createBufferSource(), g = c.createGain(), lp = c.createBiquadFilter();
  s.buffer = pluckBuffer(c, f);
  // Ấn dây: nốt hơi non rồi trượt lên đúng cao độ, đặc trưng đàn tranh.
  s.playbackRate.setValueAtTime(0.985, t); s.playbackRate.linearRampToValueAtTime(1, t + 0.12);
  if (Math.random() < 0.3) { s.playbackRate.setValueAtTime(1, t + 0.5); s.playbackRate.linearRampToValueAtTime(1.012, t + 0.8); s.playbackRate.linearRampToValueAtTime(1, t + 1.2); }
  lp.type = "lowpass"; lp.frequency.value = 3200;
  g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.1);
  s.connect(lp).connect(g).connect(out); s.start(t); s.stop(t + 3.2);
}

// Một câu đàn ngắn: 2–5 nốt đi lần, thỉnh thoảng có nốt luyến hai lần.
function zhengPhrase(c, out, t) {
  let i = Math.floor(Math.random() * 5) + 2, tt = t;
  const n = 2 + Math.floor(Math.random() * 4), dir = Math.random() < 0.6 ? -1 : 1;
  for (let k = 0; k < n; k++) {
    zheng(c, out, tt, PENTA[i], 0.2 - k * 0.02);
    if (Math.random() < 0.2) zheng(c, out, tt + 0.11, PENTA[i], 0.1);
    i = Math.min(PENTA.length - 1, Math.max(0, i + dir * (1 + (Math.random() < 0.25 ? 1 : 0))));
    tt += 0.38 + Math.random() * 0.5;
  }
  return tt - t;
}

// Chuông xoay: các bồi âm lệch nhau một chút nên ngân "ong ong".
function bowl(c, out, t, f = 196, peak = 0.12) {
  [[1, 1, 7], [2.71, 0.5, 5], [5.15, 0.22, 3.2], [8.2, 0.08, 1.8]].forEach(([m, a, dec]) => {
    [-0.6, 0.6].forEach((det) => {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = f * m + det * m;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak * a * 0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g).connect(out); o.start(t); o.stop(t + dec + 0.05);
    });
  });
}

// Nền ngân trầm, thở chậm. Trả về hàm dừng.
function drone(c, out, t) {
  const g = c.createGain(), lp = c.createBiquadFilter(), lfo = c.createOscillator(), lfoG = c.createGain();
  lp.type = "lowpass"; lp.frequency.value = 700; g.gain.value = 0.05;
  lfo.frequency.value = 0.07; lfoG.gain.value = 0.02; lfo.connect(lfoG).connect(g.gain);
  const oscs = [[73.42, "sine", 1], [73.62, "sine", 0.8], [110, "triangle", 0.35], [146.83, "sine", 0.25]].map(([f, type, a]) => {
    const o = c.createOscillator(), og = c.createGain();
    o.type = type; o.frequency.value = f; og.gain.value = a;
    o.connect(og).connect(lp); o.start(t); return o;
  });
  lp.connect(g).connect(out); lfo.start(t);
  return () => { oscs.forEach((o) => o.stop()); lfo.stop(); };
}

// Chuông gió: ống kim loại cao, bồi âm lệch, gió lùa nên chạm thành chùm.
const CHIMES = [1174.66, 1318.51, 1479.98, 1760, 1975.53, 2349.32];
function chimeHit(c, out, t, f, peak) {
  [[1, 1, 2.6], [2.76, 0.35, 1.4], [5.4, 0.12, 0.7]].forEach(([m, a, dec]) => {
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.value = f * m * (1 + (Math.random() - 0.5) * 0.002);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak * a, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    o.connect(g).connect(out); o.start(t); o.stop(t + dec + 0.05);
  });
}
function windChimes(c, out, t) {
  const n = 3 + Math.floor(Math.random() * 5);
  let tt = t;
  for (let k = 0; k < n; k++) {
    // Gió lên rồi lặng: giữa chùm chạm dày và mạnh hơn hai đầu.
    const swell = Math.sin((Math.PI * (k + 0.5)) / n);
    chimeHit(c, out, tt, CHIMES[Math.floor(Math.random() * CHIMES.length)], 0.03 + 0.05 * swell);
    tt += 0.07 + Math.random() * 0.28;
  }
}

// Mõ chùa vọng từ gian sau: một hồi gõ chậm, đều, cuối hồi dồn nhẹ.
function moKnock(c, out, t, peak) {
  const o = c.createOscillator(), g = c.createGain(), o2 = c.createOscillator(), g2 = c.createGain();
  o.type = "triangle"; o.frequency.setValueAtTime(560, t); o.frequency.exponentialRampToValueAtTime(520, t + 0.18);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  o2.frequency.value = 1480; g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(peak * 0.25, t + 0.002); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g).connect(out); o2.connect(g2).connect(out);
  o.start(t); o.stop(t + 0.25); o2.start(t); o2.stop(t + 0.08);
}
function moRound(c, out, t) {
  const n = 6 + Math.floor(Math.random() * 5);
  let tt = t, gap = 0.95 + Math.random() * 0.2;
  for (let k = 0; k < n; k++) {
    moKnock(c, out, tt, 0.16 * (k === 0 ? 1.2 : 1) * (0.85 + Math.random() * 0.3));
    if (k >= n - 3) gap *= 0.72; // dồn ở cuối hồi
    tt += gap;
  }
  return tt - t;
}

// Dựng toàn bộ tiếng nền lên `out`. Trả về { dry, wet } để nối bộ âm lượng.
function ambienceGraph(c, out) {
  const wet = reverb(c), wetG = c.createGain(), dry = c.createGain();
  wetG.gain.value = 0.55; dry.gain.value = 0.6;
  wet.connect(wetG).connect(out); dry.connect(out);
  const bus = c.createGain(); bus.connect(dry); bus.connect(wet);
  return bus;
}

let ambStarted = false, ambBusInner = null;
const ambTimers = [];
// Mỗi lớp tiếng có nhịp riêng nên không bao giờ lặp đều.
const LAYERS = [
  { first: 4000, min: 7000, max: 16000, play: (c, out, t) => (Math.random() < 0.35 ? bowl(c, out, t, Math.random() < 0.5 ? 196 : 146.83, 0.1) : zhengPhrase(c, out, t)) },
  { first: 9000, min: 13000, max: 26000, play: windChimes },
  { first: 22000, min: 38000, max: 65000, play: moRound }
];
function loop(layer, i, delay) {
  ambTimers[i] = setTimeout(() => {
    if (ctx && on && ctx.state === "running") layer.play(ctx, ambBusInner, now() + 0.05);
    loop(layer, i, layer.min + Math.random() * (layer.max - layer.min));
  }, delay);
}
// ---------- nhạc nền ----------
// Phát qua thẻ <audio> (stream dần, không giải mã cả bài vào RAM) rồi nối vào cùng chuỗi trộn với hiệu ứng.
let music = null, musicGain = null, musicOk = false, synthStarted = false;
function startMusic() {
  if (music) return;
  music = new Audio(); music.src = MUSIC_SRC; music.loop = true; music.preload = "auto";
  musicGain = ctx.createGain(); musicGain.gain.value = 0;
  try { ctx.createMediaElementSource(music).connect(musicGain).connect(mixIn); } catch { return fallbackToSynth(); }
  music.addEventListener("playing", () => {
    musicOk = true;
    musicGain.gain.cancelScheduledValues(now());
    musicGain.gain.setTargetAtTime(MUSIC_LEVEL, now(), 1.2); // mở dần ~4 giây
  });
  music.addEventListener("error", fallbackToSynth);
  playMusic();
}
function playMusic() { if (music && on && !document.hidden) music.play().catch(() => {}); }
function fallbackToSynth() {
  musicOk = false;
  if (musicGain) musicGain.gain.setTargetAtTime(0, now(), 0.2);
  startSynthAmbience();
}
// Công đường lặng: nhạc lắng xuống lúc con dấu đập, rồi dâng lại.
function duckMusic(t) {
  if (!musicOk) return;
  const g = musicGain.gain;
  g.cancelScheduledValues(t - 0.3); g.setValueAtTime(MUSIC_LEVEL, t - 0.3);
  g.linearRampToValueAtTime(MUSIC_LEVEL * 0.3, t);
  g.setTargetAtTime(MUSIC_LEVEL, t + 0.6, 1.1);
}

function startAmbience() {
  if (ambStarted) return; ambStarted = true;
  startMusic();
}
function startSynthAmbience() {
  if (synthStarted) return; synthStarted = true;
  ambBusInner = ambienceGraph(ctx, ambBus);
  noise({ t: now(), peak: 0.15, attack: 0.01, decay: 1e5, type: "lowpass", f: 380, q: 0.5, out: ambBus, buf: brownBuf }); // hơi phòng
  drone(ctx, ambBusInner, now());
  ambBus.gain.setTargetAtTime(AMB_LEVEL, now(), 2.5);
  bowl(ctx, ambBusInner, now() + 1.5);
  LAYERS.forEach((l, i) => loop(l, i, l.first));
}

// Bản nghe thử: dựng `seconds` giây tiếng nền vào OfflineAudioContext.
export function renderAmbiencePreview(c, seconds) {
  const out = c.createGain(); out.gain.value = 0.32 * 0.9 * 2; out.connect(c.destination);
  const bus = ambienceGraph(c, out);
  drone(c, bus, 0);
  bowl(c, bus, 0.8);
  LAYERS.forEach((l) => {
    // Bản nghe thử ngắn nên rút nhịp lại một nửa để nghe đủ các lớp.
    for (let t = l.first / 2000; t < seconds - 5; t += (l.min + Math.random() * (l.max - l.min)) / 2000) l.play(c, bus, t);
  });
}

// Dựng thử một đoạn vào OfflineAudioContext để đo mức âm (dùng khi chỉnh tiếng, trang không gọi tới).
// legacy=true dựng lại chuỗi nén cũ để so độ to.
export function renderProbe(c, { legacy = false, seconds = 8 } = {}) {
  const saved = { ctx, sfxBus, ambBus, noiseBuf, brownBuf, ambBusInner };
  ctx = c;
  let mix;
  if (legacy) { mix = c.createDynamicsCompressor(); mix.threshold.value = -14; mix.ratio.value = 4; mix.connect(c.destination); }
  else mix = mixChain(c, c.destination);
  const g = c.createGain(); g.gain.value = 0.9; g.connect(mix);
  sfxBus = c.createGain(); sfxBus.gain.value = legacy ? 1 : SFX_LEVEL; sfxBus.connect(g);
  ambBus = c.createGain(); ambBus.gain.value = legacy ? 0.32 : AMB_LEVEL; ambBus.connect(g);
  noiseBuf = makeNoise(1.5, false); brownBuf = makeNoise(6, true);
  const bus = ambienceGraph(c, ambBus);
  noise({ t: 0, peak: 0.15, attack: 0.01, decay: seconds, type: "lowpass", f: 380, q: 0.5, out: ambBus, buf: brownBuf });
  drone(c, bus, 0); windChimes(c, bus, 0.3); zheng(c, bus, 1.2, 440); zheng(c, bus, 1.6, 369.99);
  // Khoảnh khắc phán như trên trang: mõ, rồi chuông 0,22s, gió 0,5s, cộp 0,92s.
  const r = 4;
  for (let i = 0; i < 3; i++) S.mo(r - 2 + i * 0.55, i === 2);
  S.bell(r + 0.22); S.whoosh(r + 0.5); S.stamp(r + 0.92);
  ({ ctx, sfxBus, ambBus, noiseBuf, brownBuf, ambBusInner } = saved);
}

// Dựng một chuỗi hiệu ứng vào OfflineAudioContext để nghe thử ngoài trang: plan = [[giây, tên, ...tham số], ...].
export function renderSfx(c, plan) {
  const saved = { ctx, sfxBus, stampBus, noiseBuf, lastKey };
  ctx = c; lastKey = -1;
  const mix = mixChain(c, c.destination), g = c.createGain(); g.gain.value = 0.9; g.connect(mix);
  sfxBus = c.createGain(); sfxBus.gain.value = SFX_LEVEL; sfxBus.connect(g);
  stampBus = makeStampBus(c, sfxBus); noiseBuf = makeNoise(1.5, false);
  plan.forEach(([t, name, ...args]) => S[name]?.(t, ...args));
  ({ ctx, sfxBus, stampBus, noiseBuf, lastKey } = saved);
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
    if (on) { this.unlock(); master.gain.setTargetAtTime(0.9, now(), 0.05); playMusic(); }
    else if (ctx) { master.gain.setTargetAtTime(0, now(), 0.05); music?.pause(); }
    return on;
  },
  // Phát một tiếng sau `delay` giây; im lặng nếu đang tắt hoặc trình duyệt chưa cho phát.
  play(name, delay = 0, ...args) {
    if (!on || !ctx || ctx.state !== "running") return;
    S[name]?.(now() + delay, ...args);
    if (name === "stamp") duckMusic(now() + delay);
  }
};

// Tab ẩn thì tạm dừng cho đỡ tốn pin.
document.addEventListener("visibilitychange", () => {
  if (!ctx) return;
  if (document.hidden) { ctx.suspend(); music?.pause(); } else if (on) { ctx.resume(); playMusic(); }
});
