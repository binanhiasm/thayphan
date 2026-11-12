// Âm thanh quán trà, tổng hợp bằng Web Audio: không file âm thanh, không bản quyền, gần như không tốn dung lượng.
// Trình duyệt chỉ cho phát tiếng sau lần chạm hoặc gõ phím đầu tiên, nên mọi thứ khởi động ở unlock().
// Người dùng tắt/bật bằng nút loa; lựa chọn được nhớ trên máy.

let ctx = null, master = null, sfxBus = null, sfxVerb = null, ambBus = null, noiseBuf = null, brownBuf = null;
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
  const comp = mixChain(ctx, master);
  wireSfx(comp);
  ambBus = ctx.createGain(); ambBus.gain.value = 0; ambBus.connect(comp);
  noiseBuf = makeNoise(1.5, false);
  brownBuf = makeNoise(6, true);
  return true;
}

// Nén nhẹ rồi chặn đỉnh, để trống và cồng không làm vỡ tiếng trên loa điện thoại.
function mixChain(c, out) {
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
  const lim = c.createDynamicsCompressor(); lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
  const trim = c.createGain(); trim.gain.value = 0.85;
  comp.connect(lim).connect(trim).connect(out);
  return comp;
}

// Bus hiệu ứng: tiếng khô + một lớp vang riêng cho cồng và trống.
function wireSfx(out) {
  sfxBus = ctx.createGain(); sfxBus.connect(out);
  const v = reverb(ctx, 3.8), vg = ctx.createGain(); vg.gain.value = 0.5;
  v.connect(vg).connect(out);
  sfxVerb = v;
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
  // Trống lớn (kiểu taiko): thân trầm + mặt da + vang.
  drum(t = now(), peak = 1, f = 70) {
    tone({ f: f * 1.6, f2: f, t, peak, attack: 0.002, decay: 0.08 });          // cú nện đầu, cao độ rơi nhanh
    tone({ f, f2: f * 0.7, t: t + 0.004, peak: peak * 0.9, attack: 0.004, decay: 0.7 }); // thân trống
    tone({ type: "triangle", f: f * 2.3, f2: f * 1.2, t, peak: peak * 0.3, decay: 0.12 });
    noise({ t, peak: peak * 0.45, decay: 0.05, type: "lowpass", f: 600 });     // mặt da
    noise({ t, peak: peak * 0.12, decay: 0.03, type: "highpass", f: 2500 });   // dùi chạm
    tone({ f, f2: f * 0.7, t, peak: peak * 0.6, attack: 0.004, decay: 1.2, out: sfxVerb });
  },
  // Hợp âm đồng trầm (kiểu nhạc phim): chồng sóng răng cưa lệch nhẹ, bộ lọc mở rồi khép.
  brass(t = now(), dur = 2.8, peak = 0.22, open = 2600, rise = 0) {
    const lp = ctx.createBiquadFilter(), g = ctx.createGain();
    lp.type = "lowpass"; lp.Q.value = 1.2;
    if (rise) { lp.frequency.setValueAtTime(180, t); lp.frequency.exponentialRampToValueAtTime(open, t + rise); }
    else { lp.frequency.setValueAtTime(open, t); lp.frequency.exponentialRampToValueAtTime(320, t + dur * 0.8); }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (rise || 0.03));
    if (!rise) g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // D1, D2, A2, D3, A3: quãng năm rỗng, nghe cổ và trang nghiêm.
    [36.71, 73.42, 110, 146.83, 220].forEach((f, i) => [-7, 7].forEach((cents) => {
      const o = ctx.createOscillator(); o.type = i === 0 ? "sine" : "sawtooth";
      o.frequency.value = f; o.detune.value = cents;
      const og = ctx.createGain(); og.gain.value = [0.9, 0.5, 0.4, 0.3, 0.18][i];
      o.connect(og).connect(lp); o.start(t); o.stop(t + (rise ? rise + 0.05 : dur + 0.1));
    }));
    lp.connect(g); g.connect(sfxBus);
    const send = ctx.createGain(); send.gain.value = 0.7; g.connect(send).connect(sfxVerb);
    return g;
  },
  // Cồng đồng lớn: tổng hợp FM cho chất kim loại, cao độ trùng xuống, xèo chát, ngân dài.
  gong(t = now(), peak = 0.3, f = 110) {
    [[1, 1.41, 9, 7], [1.5, 2.37, 6, 5], [2.13, 3.17, 4, 3.5]].forEach(([cm, mm, index, dec], i) => {
      const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
      const fc = f * cm;
      car.frequency.setValueAtTime(fc * 1.06, t); car.frequency.exponentialRampToValueAtTime(fc, t + 0.6);
      mod.frequency.setValueAtTime(fc * mm * 1.06, t); mod.frequency.exponentialRampToValueAtTime(fc * mm, t + 0.6);
      mg.gain.setValueAtTime(fc * index, t); mg.gain.exponentialRampToValueAtTime(fc * 0.4, t + dec * 0.6);
      mod.connect(mg).connect(car.frequency);
      const p = peak * [1, 0.6, 0.35][i];
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(p, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      car.connect(g); g.connect(sfxBus);
      const send = ctx.createGain(); send.gain.value = 0.8; g.connect(send).connect(sfxVerb);
      car.start(t); mod.start(t); car.stop(t + dec + 0.1); mod.stop(t + dec + 0.1);
    });
    noise({ t, peak: peak * 0.55, decay: 0.35, f: 5200, q: 0.5 });             // xèo chát lúc đánh
    noise({ t, peak: peak * 0.2, attack: 0.05, decay: 3.5, f: 3600, q: 0.7, out: sfxVerb }); // xèo ngân
  },
  // Khoảnh khắc phán. Mốc 0,92s là lúc con dấu đập xuống trong animation.
  verdict(t = now()) {
    const hit = 0.92, T = t + hit;
    // 1. Dồn: hợp âm đồng dâng lên + trống dồn nhanh dần + xèo dâng, cắt lặng 60ms trước khi đập.
    const swell = S.brass(t, 0, 0.14, 2200, hit - 0.06);
    swell.gain.setValueAtTime(0.14, T - 0.06); swell.gain.exponentialRampToValueAtTime(0.0001, T - 0.03);
    let tt = t + 0.05, gap = 0.16;
    for (let k = 0; tt < T - 0.1; k++) { S.drum(tt, 0.16 + k * 0.05, 96 - k * 2); tt += gap; gap *= 0.82; }
    noise({ t, peak: 0.13, attack: hit - 0.08, decay: 0.02, type: "highpass", f: 3000, f2: 7000, q: 0.5 });
    // 2. Đập: ba trống cái cùng lúc (lệch vài ms cho dày), hợp âm đồng, cồng, cộp con dấu.
    S.drum(T, 0.8, 58); S.drum(T + 0.012, 0.55, 66); S.drum(T + 0.024, 0.45, 50);
    S.brass(T, 3.2, 0.26, 3000);
    S.gong(T + 0.02, 0.3);
    S.stamp(T);
    // 3. Vọng: hai tiếng trống nhỏ dần.
    S.drum(T + 0.62, 0.42, 58); S.drum(T + 1.3, 0.24, 58);
    // Tiếng nền lặng hẳn rồi trở lại chậm.
    if (ambStarted && ambBus) {
      ambBus.gain.cancelScheduledValues(t);
      ambBus.gain.setTargetAtTime(0.03, t, 0.12);
      ambBus.gain.setTargetAtTime(0.32, T + 3, 1.8);
    }
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
function startAmbience() {
  if (ambStarted) return; ambStarted = true;
  ambBusInner = ambienceGraph(ctx, ambBus);
  noise({ t: now(), peak: 0.15, attack: 0.01, decay: 1e5, type: "lowpass", f: 380, q: 0.5, out: ambBus, buf: brownBuf }); // hơi phòng
  drone(ctx, ambBusInner, now());
  ambBus.gain.setTargetAtTime(0.32, now(), 2.5);
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

// Bản nghe thử khoảnh khắc phán, có tiếng nền bên dưới.
export function renderVerdictPreview(c, at = 2.5) {
  const saved = { ctx, sfxBus, sfxVerb, ambBus, noiseBuf, ambStarted };
  ctx = c;
  const out = c.createGain(); out.gain.value = 0.9; out.connect(c.destination);
  const comp = mixChain(c, out);
  wireSfx(comp);
  noiseBuf = makeNoise(1.5, false);
  ambBus = c.createGain(); ambBus.gain.value = 0.32; ambBus.connect(comp);
  const bus = ambienceGraph(c, ambBus); drone(c, bus, 0); windChimes(c, bus, 0.4);
  ambStarted = true;
  for (let i = 0; i < 3; i++) S.mo(at - 2.1 + i * 0.55, i === 2);
  S.verdict(at);
  ({ ctx, sfxBus, sfxVerb, ambBus, noiseBuf, ambStarted } = saved);
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
