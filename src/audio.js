// 効果音はファイルを使わずその場で合成する。
let audioCtx = null;
let master = null;
let muted = false;

try {
  muted = localStorage.getItem('rengeki-muted') === '1';
} catch { /* 保存できない環境でも動く */ }

export function unlockAudio() {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
      master = audioCtx.createGain();
      master.gain.value = 0.55;
      master.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* 音が出なくてもゲームは続ける */ }
}

export const isMuted = () => muted;
export function setMuted(v) {
  muted = v;
  try { localStorage.setItem('rengeki-muted', v ? '1' : '0'); } catch { /* 無視 */ }
}

function tone(freq, dur, { type = 'square', vol = 0.2, slide = 0, delay = 0 } = {}) {
  if (!audioCtx || muted) return;
  const t = audioCtx.currentTime + delay;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

let noiseBuf = null;
function noise(dur, { vol = 0.3, freq = 1800, q = 0.8, type = 'bandpass', delay = 0 } = {}) {
  if (!audioCtx || muted) return;
  if (!noiseBuf) {
    noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = audioCtx.currentTime + delay;
  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuf;
  const f = audioCtx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

const SOUNDS = {
  whoosh: (e) => noise(0.09 + e.rank * 0.02, { vol: 0.05 + e.rank * 0.02, freq: 2400 - e.rank * 300 }),
  l: () => { noise(0.07, { vol: 0.35, freq: 2600 }); tone(320, 0.05, { vol: 0.12, slide: -160 }); },
  m: () => { noise(0.11, { vol: 0.45, freq: 1500 }); tone(190, 0.1, { vol: 0.2, slide: -110 }); },
  h: () => { noise(0.2, { vol: 0.6, freq: 800 }); tone(110, 0.2, { vol: 0.32, slide: -70, type: 'sawtooth' }); },
  s: () => { noise(0.34, { vol: 0.7, freq: 500, q: 0.5 }); tone(70, 0.4, { vol: 0.4, slide: -40, type: 'sawtooth' }); },
  block: () => { noise(0.06, { vol: 0.35, freq: 4200, q: 3 }); tone(880, 0.05, { vol: 0.06 }); },
  jump: () => tone(240, 0.11, { type: 'sine', vol: 0.12, slide: 300 }),
  land: () => noise(0.06, { vol: 0.14, freq: 300, type: 'lowpass' }),
  dash: () => noise(0.14, { vol: 0.13, freq: 1000 }),
  proj: () => { tone(520, 0.2, { type: 'sawtooth', vol: 0.08, slide: -300 }); noise(0.2, { vol: 0.12, freq: 1800 }); },
  super: () => { [196, 294, 392, 587].forEach((f, i) => tone(f, 0.5, { type: 'sawtooth', vol: 0.1, delay: i * 0.06 })); noise(0.6, { vol: 0.3, freq: 3000 }); },
  grab: () => tone(150, 0.1, { vol: 0.2 }),
  tech: () => { noise(0.1, { vol: 0.4, freq: 3400, q: 2 }); tone(660, 0.14, { vol: 0.1 }); },
  armor: () => { tone(1200, 0.2, { type: 'triangle', vol: 0.18, slide: -600 }); noise(0.1, { vol: 0.3, freq: 3000 }); },
  bounce: () => noise(0.16, { vol: 0.4, freq: 260, type: 'lowpass' }),
  ko: () => { tone(90, 1.1, { vol: 0.42, slide: -60, type: 'sawtooth' }); noise(0.9, { vol: 0.55, freq: 700, q: 0.4 }); },
  bell: () => { tone(740, 0.5, { type: 'triangle', vol: 0.22 }); tone(1110, 0.4, { type: 'sine', vol: 0.12 }); },
  fight: () => { tone(330, 0.1, { vol: 0.16 }); tone(660, 0.3, { vol: 0.2, delay: 0.09 }); noise(0.3, { vol: 0.3, freq: 2000, delay: 0.09 }); },
  ui: () => tone(620, 0.05, { type: 'triangle', vol: 0.14 }),
};

export function playSound(name, ev = {}) {
  const fn = SOUNDS[name];
  if (fn) fn(ev);
}
