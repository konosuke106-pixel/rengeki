// 画面描画。戦闘の結果には一切影響しない（見た目だけの担当）。
import { VIEW_W, VIEW_H, GROUND_Y, STAGE_HALF, METER_MAX, SUPER_COST } from './config.js';
import { CHARS } from './characters.js';
import { moveOf, activeBoxes, hurtboxOf } from './sim.js';
import { POSES, clonePose, blendPose, targetPose } from './poses.js';
import { playSound } from './audio.js';

const INK = '#15101c';
const PAPER = '#f5ecd6';
const DISPLAY = '"Dela Gothic One", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
const UI_FONT = '"Zen Kaku Gothic New", "Hiragino Sans", "Yu Gothic", sans-serif';

const SFX_TEXT = { l: ['パシッ', 'ビシッ'], m: ['バキッ', 'ドカッ'], h: ['ドゴォ', 'ズガッ'], s: ['ズドン', 'ゴォッ'] };

const STAGES = {
  sunset: {
    sky: ['#f6bb45', '#f2922f', '#e45a2b', '#b5303a'], sun: '#ffe9b4', sunXY: [860, 250], sunR: 150,
    far: '#7d2440', near: '#3f1531', floor: '#2a1024', floorLine: '#51203f', name: '夕焼け峠',
  },
  foundry: {
    sky: ['#254347', '#35605e', '#6f9682', '#dcc985'], sun: '#ffd983', sunXY: [340, 330], sunR: 88,
    far: '#2c4a4a', near: '#16282b', floor: '#141f22', floorLine: '#2f4a4a', name: '鉄の製錬所', stacks: true,
  },
  rain: {
    sky: ['#12163c', '#1f2864', '#374796', '#7083c8'], sun: '#e4eaff', sunXY: [930, 170], sunR: 96,
    far: '#1b2157', near: '#0e1136', floor: '#0b0d2a', floorLine: '#2a3380', name: '雨の社', rain: true, torii: true,
  },
};

function seeded(seed) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

function ridge(ctx, color, width, height, base, amp, seed) {
  const r = seeded(seed);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, height);
  let x = 0;
  ctx.lineTo(0, base);
  while (x < width) {
    const step = 50 + r() * 110;
    x += step;
    ctx.lineTo(x, base - r() * amp);
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
}

function makeLayer(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d'));
  return c;
}

function buildStage(id) {
  const st = STAGES[id];
  const sky = makeLayer(VIEW_W, VIEW_H, (ctx) => {
    // 木版画のように色の帯で塗り分ける
    const bands = st.sky;
    const bandH = GROUND_Y / bands.length;
    bands.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, i * bandH, VIEW_W, bandH + 1);
    });
    ctx.fillStyle = st.sun;
    ctx.beginPath();
    ctx.arc(st.sunXY[0], st.sunXY[1], st.sunR, 0, Math.PI * 2);
    ctx.fill();
    // 紙の質感
    const r = seeded(7);
    ctx.fillStyle = 'rgba(21,16,28,.05)';
    for (let i = 0; i < 2600; i++) ctx.fillRect(r() * VIEW_W, r() * VIEW_H, 2, 2);
  });
  const far = makeLayer(2300, VIEW_H, (ctx) => {
    ridge(ctx, st.far, 2300, VIEW_H, 470, 150, id.length * 11 + 3);
  });
  const near = makeLayer(2700, VIEW_H, (ctx) => {
    ridge(ctx, st.near, 2700, VIEW_H, 560, 90, id.length * 7 + 9);
    if (st.stacks) {
      ctx.fillStyle = st.near;
      [240, 330, 810, 1500, 1620, 2240].forEach((x, i) => {
        const h = 180 + (i % 3) * 70;
        ctx.fillRect(x, 560 - h, 54, h);
        ctx.fillRect(x - 8, 560 - h, 70, 16);
      });
      ctx.fillRect(1000, 410, 340, 170);
      ctx.fillStyle = '#e4842b';
      for (let i = 0; i < 5; i++) ctx.fillRect(1024 + i * 62, 450, 34, 44);
    }
    if (st.torii) {
      ctx.fillStyle = st.near;
      [[520, 1], [1650, 0.8]].forEach(([x, k]) => {
        ctx.fillRect(x, 420 - 40 * k, 24 * k, 200);
        ctx.fillRect(x + 190 * k, 420 - 40 * k, 24 * k, 200);
        ctx.fillRect(x - 46 * k, 372, 304 * k, 22 * k);
        ctx.fillRect(x - 20 * k, 412, 254 * k, 14 * k);
      });
    }
  });
  const floor = makeLayer(2600, VIEW_H - GROUND_Y + 8, (ctx) => {
    const h = ctx.canvas.height;
    ctx.fillStyle = st.floor;
    ctx.fillRect(0, 0, 2600, h);
    ctx.strokeStyle = st.floorLine;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(2600, 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    for (let x = -600; x < 3200; x += 90) {
      ctx.beginPath();
      ctx.moveTo(x, 2);
      ctx.lineTo(1300 + (x - 1300) * 1.7, h);
      ctx.stroke();
    }
  });
  return { sky, far, near, floor, def: st };
}

// 骨格を計算する。座標は腰が原点、上が +y
function solve(pose, ch) {
  const k = ch.build;
  const L = { torso: 64, up: 37, fore: 36, thigh: 47, shin: 49, head: 19 };
  const rad = (d) => d * Math.PI / 180;
  const seg = (o, deg, len) => ({ x: o.x + Math.sin(rad(deg)) * len, y: o.y - Math.cos(rad(deg)) * len });
  const hip = { x: 0, y: 0 };
  const top = { x: Math.sin(rad(pose.t)) * L.torso, y: Math.cos(rad(pose.t)) * L.torso };
  const shoulder = { x: top.x * 0.9, y: top.y * 0.9 };
  const head = { x: top.x + Math.sin(rad(pose.t * 0.5)) * (L.head + 6), y: top.y + Math.cos(rad(pose.t * 0.5)) * (L.head + 6) };
  const limb = (o, a, l1, l2) => {
    const mid = seg(o, a[0], l1);
    return { a: o, b: mid, c: seg(mid, a[1], l2) };
  };
  const armF = limb(shoulder, pose.af, L.up, L.fore);
  const armB = limb({ x: shoulder.x - 5, y: shoulder.y }, pose.ab, L.up, L.fore);
  const legF = limb({ x: 3, y: 0 }, pose.lf, L.thigh, L.shin);
  const legB = limb({ x: -3, y: 0 }, pose.lb, L.thigh, L.shin);
  const low = Math.min(legF.c.y, legB.c.y, legF.b.y, legB.b.y, hip.y - 10, shoulder.y - 12, head.y - L.head);
  return { hip, top, shoulder, head, armF, armB, legF, legB, low, k, headR: L.head };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 1;
    this.stage = null;
    this.reset();
  }

  reset() {
    this.parts = [];
    this.texts = [];
    this.rings = [];
    this.shake = 0;
    this.flash = 0;
    this.camX = 0;
    this.poses = [clonePose(POSES.idle), clonePose(POSES.idle)];
    this.hpShow = [1, 1];
    this.combos = [null, null];
    this.banner = null;
    this.superCut = null;
    this.clock = 0;
    this.rainDrops = null;
  }

  setStage(id) {
    this.stage = buildStage(id);
  }

  resize(cssW, cssH) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.scale = this.canvas.width / VIEW_W;
  }

  // 戦闘側から届いた出来事を、エフェクトと音に変換する
  consume(events, s) {
    for (const e of events) {
      const sy = GROUND_Y - (e.y || 0);
      switch (e.t) {
        case 'hit':
          this.hitFx(e, sy);
          if (e.hits >= 2) this.combos[e.by] = { hits: e.hits, dmg: e.combo, t: 110, pop: 1 };
          if (e.counter) this.pushText('カウンター', e.x, sy - 60, '#f6c445', 34, 0);
          break;
        case 'block':
          this.spark(e.x, sy, 8, '#bfe3ff', 7);
          this.pushText('ガッ', e.x, sy - 30, '#bfe3ff', 26, -0.1);
          playSound('block');
          this.shake = Math.max(this.shake, 2);
          break;
        case 'whoosh': playSound('whoosh', e); break;
        case 'jump': playSound('jump'); this.dust(e.x, 6); break;
        case 'land': playSound('land'); this.dust(e.x, 5); break;
        case 'dash': playSound('dash'); this.dust(e.x, 8); break;
        case 'proj': playSound('proj'); break;
        case 'super':
          playSound('super');
          this.superCut = { t: 44, by: e.by, name: e.name, char: s.ps[e.by].char };
          this.flash = 0.6;
          break;
        case 'grab': playSound('grab'); break;
        case 'throwHit':
          playSound('h');
          this.shake = Math.max(this.shake, 12);
          this.spark(e.x, sy, 22, '#ffffff', 13);
          this.pushText('ドゴォ', e.x, sy - 40, '#ffffff', 58, 0.1);
          break;
        case 'tech':
          playSound('tech');
          this.spark(e.x, sy, 14, '#ffffff', 9);
          this.pushText('投げ抜け', e.x, sy - 40, '#ffffff', 34, 0);
          break;
        case 'armor':
          playSound('armor');
          this.spark(e.x, sy, 14, '#ffd983', 10);
          this.pushText('耐えた', e.x, sy - 40, '#ffd983', 34, -0.05);
          break;
        case 'clash':
          playSound('tech');
          this.spark(e.x, sy, 18, '#ffffff', 10);
          break;
        case 'bounce':
        case 'down':
          playSound('bounce');
          this.dust(e.x, 12);
          this.shake = Math.max(this.shake, e.t === 'bounce' ? 7 : 4);
          break;
        case 'wall':
          playSound('h');
          this.shake = Math.max(this.shake, 12);
          this.spark(e.x, sy, 14, '#ffffff', 10);
          break;
        case 'recover': this.spark(e.x, GROUND_Y - e.y - 80, 8, '#ffffff', 5); break;
        case 'round':
          playSound('bell');
          this.banner = { text: `第${'一二三四五'[e.n - 1] || e.n}戦`, sub: `ROUND ${e.n}`, t: 72, big: false };
          break;
        case 'fight':
          playSound('fight');
          this.banner = { text: '開戦！', sub: 'FIGHT', t: 40, big: true };
          break;
        case 'ko':
          playSound('ko');
          this.flash = 1;
          this.shake = 22;
          this.banner = { text: '決着', sub: 'K.O.', t: 90, big: true };
          break;
        case 'timeup':
          playSound('bell');
          this.banner = { text: '時間切れ', sub: 'TIME UP', t: 90, big: true };
          break;
        case 'roundWin':
          playSound('bell');
          this.banner = { text: `${CHARS[s.ps[e.winner].char].name} 勝利`, sub: '', t: 85, big: false };
          break;
        default: break;
      }
    }
  }

  hitFx(e, sy) {
    const lv = { l: 1, m: 2, h: 3, s: 4 }[e.fx] || 2;
    playSound(e.fx);
    const pal = lv >= 3 ? '#fff4c9' : '#ffffff';
    this.spark(e.x, sy, 6 + lv * 5, pal, 5 + lv * 3);
    this.rings.push({ x: e.x, y: sy, r: 10, max: 34 + lv * 26, life: 1, color: lv >= 3 ? '#f6c445' : '#ffffff' });
    this.shake = Math.max(this.shake, lv * lv * 1.2 + 1);
    if (lv >= 3) this.flash = Math.max(this.flash, 0.12 * lv);
    const list = SFX_TEXT[e.fx] || SFX_TEXT.m;
    const word = list[e.hits % list.length];
    this.pushText(word, e.x + (e.by === 0 ? 24 : -24), sy - 34 - lv * 6, lv >= 3 ? '#f6c445' : '#ffffff', 22 + lv * 12, e.by === 0 ? -0.14 : 0.14);
    // 墨の飛沫
    for (let i = 0; i < lv * 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 3 + Math.random() * 7;
      this.parts.push({ x: e.x, y: sy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, g: 0.35, r: 2 + Math.random() * 4, life: 28, max: 28, color: INK, kind: 'ink' });
    }
  }

  spark(x, y, n, color, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random());
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0, r: 3 + Math.random() * 3, life: 11 + Math.random() * 7, max: 18, color, kind: 'shard', a });
    }
  }

  dust(x, n) {
    for (let i = 0; i < n; i++) {
      this.parts.push({ x: x + (Math.random() - 0.5) * 40, y: GROUND_Y - 2, vx: (Math.random() - 0.5) * 4, vy: -Math.random() * 1.8, g: 0, r: 5 + Math.random() * 8, life: 20, max: 20, color: PAPER, kind: 'dust' });
    }
  }

  pushText(text, x, y, color, size, rot) {
    this.texts.push({ text, x, y, color, size, rot, life: 30, max: 30 });
  }

  // 1描画フレーム分のアニメーションを進める（戦闘が止まっている間も動く）
  tick(s) {
    this.clock++;
    for (const q of this.parts) {
      q.x += q.vx;
      q.y += q.vy;
      q.vy += q.g;
      q.vx *= q.kind === 'dust' ? 0.95 : 0.9;
      if (q.kind !== 'ink') q.vy *= 0.9;
      q.life--;
    }
    this.parts = this.parts.filter((q) => q.life > 0);
    for (const t of this.texts) t.life--;
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const r of this.rings) { r.life -= 0.09; r.r += (r.max - r.r) * 0.3; }
    this.rings = this.rings.filter((r) => r.life > 0);
    this.shake *= 0.84;
    if (this.shake < 0.3) this.shake = 0;
    this.flash *= 0.84;
    if (this.flash < 0.02) this.flash = 0;
    if (this.banner && --this.banner.t <= 0) this.banner = null;
    if (this.superCut && --this.superCut.t <= 0) this.superCut = null;
    this.combos.forEach((c, i) => {
      if (c) {
        c.pop *= 0.8;
        if (--c.t <= 0) this.combos[i] = null;
      }
    });

    s.ps.forEach((p, i) => {
      const ratio = p.hp / CHARS[p.char].hp;
      if (this.hpShow[i] < ratio) this.hpShow[i] = ratio;
      else if (p.st !== 'hit' && p.st !== 'hitair') this.hpShow[i] += (ratio - this.hpShow[i]) * 0.04;
      const fast = p.st === 'attack' || p.st === 'hit' || p.st === 'hitair' || p.st === 'block' || p.st === 'thrown' || p.st === 'throwing';
      if (s.freeze <= 0 || i === s.freezeBy) blendPose(this.poses[i], targetPose(p, moveOf(p)), fast ? 0.62 : 0.24);
    });

    const mid = (s.ps[0].x + s.ps[1].x) / 2;
    const lim = STAGE_HALF - VIEW_W / 2 + 60;
    const tx = Math.max(-lim, Math.min(lim, mid));
    this.camX += (tx - this.camX) * 0.16;
  }

  draw(s, opts = {}) {
    const ctx = this.ctx;
    const sc = this.scale;
    ctx.setTransform(sc, 0, 0, sc, 0, 0);
    const shx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const shy = this.shake ? (Math.random() - 0.5) * this.shake : 0;

    this.drawStage(s, shx, shy);
    ctx.save();
    ctx.translate(VIEW_W / 2 - this.camX + shx, shy);

    // 超必殺の暗転
    const inSuper = s.freeze > 0;
    const ps = s.ps;
    const order = ps[0].st === 'attack' && ps[1].st !== 'attack' ? [1, 0] : [0, 1];
    if (inSuper) order.sort((a, b) => (a === s.freezeBy ? 1 : b === s.freezeBy ? -1 : 0));

    for (const i of order) this.drawShadow(ps[i]);
    for (const i of order) this.drawFighter(s, ps[i], i);
    for (const q of s.projs) this.drawProjectile(q, s);
    for (const i of order) this.drawSwoosh(ps[i]);
    this.drawParticles();
    if (opts.hitboxes) this.drawHitboxes(s);
    ctx.restore();

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,250,235,${this.flash * 0.75})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.superCut) this.drawSuperCut();
    this.drawHud(s, opts);
    this.drawBanner();
  }

  drawStage(s, shx, shy) {
    const ctx = this.ctx;
    const st = this.stage;
    if (!st) {
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      return;
    }
    ctx.drawImage(st.sky, 0, 0);
    const norm = this.camX;
    ctx.drawImage(st.far, -515 - norm * 0.18 + shx * 0.3, shy * 0.3);
    ctx.drawImage(st.near, -710 - norm * 0.4 + shx * 0.5, shy * 0.5);
    ctx.drawImage(st.floor, -660 - norm + shx, GROUND_Y + shy);
    if (st.def.rain) {
      if (!this.rainDrops) {
        const r = seeded(99);
        this.rainDrops = Array.from({ length: 90 }, () => ({ x: r() * VIEW_W, y: r() * VIEW_H, v: 14 + r() * 10 }));
      }
      ctx.strokeStyle = 'rgba(190,210,255,.42)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const d of this.rainDrops) {
        d.y += d.v;
        d.x -= d.v * 0.25;
        if (d.y > VIEW_H) { d.y = -20; d.x = Math.random() * VIEW_W * 1.2; }
        if (d.x < 0) d.x += VIEW_W;
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + 5, d.y - 20);
      }
      ctx.stroke();
    }
    if (s.freeze > 0) {
      ctx.fillStyle = 'rgba(21,16,28,.62)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  drawShadow(p) {
    const ctx = this.ctx;
    const k = Math.max(0.35, 1 - p.y / 400);
    ctx.fillStyle = 'rgba(10,6,14,.5)';
    ctx.beginPath();
    ctx.ellipse(p.x, GROUND_Y + 6, 64 * k, 11 * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawFighter(s, p, i) {
    const ch = CHARS[p.char];
    const pal = ch.palettes[p.palette];
    const pose = this.poses[i];
    const whiteFlash = p.hitstop > 0 && (p.st === 'hit' || p.st === 'hitair');
    const blockFlash = p.st === 'block' && p.hitstop > 0;
    const ghost = p.st !== 'down' && p.st !== 'getup' && p.inv > 0 && this.clock % 4 < 2 && p.st !== 'thrown';
    this.ctx.save();
    if (ghost) this.ctx.globalAlpha = 0.55;
    const shakeX = p.hitstop > 0 && (p.st === 'hit' || p.st === 'hitair') ? (this.clock % 2 ? 4 : -4) : 0;
    paintFighter(this.ctx, ch, pal, pose, p.x + shakeX, GROUND_Y - p.y, p.facing, {
      flash: whiteFlash ? '#ffffff' : blockFlash ? '#bfe3ff' : null,
      vx: p.vx,
      clock: this.clock,
      aura: s.freeze > 0 && s.freezeBy === i,
    });
    this.ctx.restore();
  }

  drawSwoosh(p) {
    const ctx = this.ctx;
    for (const { b, rect } of activeBoxes(p)) {
      if (b.throw) continue;
      const cx = (rect.x0 + rect.x1) / 2;
      const cy = GROUND_Y - (rect.y0 + rect.y1) / 2;
      const w = (rect.x1 - rect.x0) / 2;
      const h = (rect.y1 - rect.y0) / 2;
      const pal = CHARS[p.char].palettes[p.palette];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(p.facing, 1);
      ctx.fillStyle = pal.trim;
      ctx.beginPath();
      ctx.moveTo(-w, -h);
      ctx.quadraticCurveTo(w * 1.5, -h * 0.8, w, h * 0.3);
      ctx.quadraticCurveTo(w * 0.55, -h * 0.1, -w, -h);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
  }

  drawProjectile(q, s) {
    const ctx = this.ctx;
    const x = q.x;
    const y = GROUND_Y - q.y - q.h / 2;
    const pal = CHARS[s.ps[q.owner].char].palettes[s.ps[q.owner].palette];
    const dir = q.vx >= 0 ? 1 : -1;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    if (q.kind === 'fire') {
      ctx.scale(dir, 1);
      for (let i = 2; i >= 0; i--) {
        const r = q.w / 2 * (1 - i * 0.26);
        ctx.fillStyle = [pal.trim, '#fff2c0', pal.gi][i];
        ctx.beginPath();
        const spikes = 9;
        for (let k = 0; k <= spikes * 2; k++) {
          const a = k / (spikes * 2) * Math.PI * 2 + q.age * 0.28;
          const rr = k % 2 ? r : r * 0.68;
          const px = Math.cos(a) * rr * (a % 6 < 3 ? 1.1 : 1);
          const py = Math.sin(a) * rr;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        if (i === 2) ctx.stroke();
      }
    } else if (q.kind === 'quake') {
      ctx.translate(0, q.h / 2);
      ctx.fillStyle = pal.gi;
      for (let i = -2; i <= 2; i++) {
        const h = 26 + 26 * Math.abs(Math.sin(q.age * 0.5 + i));
        ctx.beginPath();
        ctx.moveTo(i * 22 - 14, 0);
        ctx.lineTo(i * 22, -h);
        ctx.lineTo(i * 22 + 14, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else if (q.kind === 'water') {
      ctx.scale(dir, 1);
      ctx.fillStyle = pal.trim;
      ctx.beginPath();
      ctx.moveTo(-12, -q.h / 2);
      ctx.quadraticCurveTo(q.w, 0, -12, q.h / 2);
      ctx.quadraticCurveTo(10, 0, -12, -q.h / 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = pal.gi;
      ctx.beginPath();
      ctx.moveTo(0, -q.h / 2);
      ctx.quadraticCurveTo(q.w / 2, q.h / 4, 0, q.h / 2);
      ctx.quadraticCurveTo(-q.w / 2, q.h / 4, 0, -q.h / 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  drawParticles() {
    const ctx = this.ctx;
    for (const r of this.rings) {
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = Math.max(0, r.life);
      ctx.lineWidth = 7 * r.life + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const q of this.parts) {
      const k = q.life / q.max;
      ctx.globalAlpha = q.kind === 'dust' ? k * 0.55 : 1;
      ctx.fillStyle = q.color;
      if (q.kind === 'shard') {
        const len = q.r * 3.6 * k + 2;
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(q.a);
        ctx.beginPath();
        ctx.moveTo(len, 0);
        ctx.lineTo(-len * 0.4, q.r * 0.7);
        ctx.lineTo(-len * 0.4, -q.r * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.kind === 'dust' ? q.r * (1.6 - k * 0.6) : q.r * k, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const t of this.texts) {
      const k = t.life / t.max;
      const grow = k > 0.82 ? 1 + (k - 0.82) * 3.2 : 1;
      ctx.save();
      ctx.translate(t.x, t.y - (1 - k) * 22);
      ctx.rotate(t.rot);
      ctx.scale(grow, grow);
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.font = `${t.size}px ${DISPLAY}`;
      ctx.lineWidth = t.size * 0.28;
      ctx.strokeStyle = INK;
      ctx.strokeText(t.text, 0, 0);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawHitboxes(s) {
    const ctx = this.ctx;
    ctx.lineWidth = 2;
    for (const p of s.ps) {
      const h = hurtboxOf(p);
      ctx.strokeStyle = '#37e0a0';
      ctx.fillStyle = 'rgba(55,224,160,.18)';
      ctx.fillRect(h.x0, GROUND_Y - h.y1, h.x1 - h.x0, h.y1 - h.y0);
      ctx.strokeRect(h.x0, GROUND_Y - h.y1, h.x1 - h.x0, h.y1 - h.y0);
      for (const { rect: r } of activeBoxes(p)) {
        ctx.strokeStyle = '#ff3b5c';
        ctx.fillStyle = 'rgba(255,59,92,.3)';
        ctx.fillRect(r.x0, GROUND_Y - r.y1, r.x1 - r.x0, r.y1 - r.y0);
        ctx.strokeRect(r.x0, GROUND_Y - r.y1, r.x1 - r.x0, r.y1 - r.y0);
      }
    }
  }

  drawSuperCut() {
    const ctx = this.ctx;
    const c = this.superCut;
    const k = Math.min(1, (44 - c.t) / 7);
    const ch = CHARS[c.char];
    const pal = ch.palettes[0];
    // 集中線
    ctx.save();
    ctx.translate(VIEW_W / 2, VIEW_H / 2);
    ctx.fillStyle = 'rgba(245,236,214,.5)';
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2 + (this.clock % 3) * 0.05;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.013) * 900, Math.sin(a - 0.013) * 900);
      ctx.lineTo(Math.cos(a) * 280, Math.sin(a) * 180);
      ctx.lineTo(Math.cos(a + 0.013) * 900, Math.sin(a + 0.013) * 900);
      ctx.fill();
    }
    ctx.restore();
    const bandY = 244;
    const bandH = 150;
    ctx.save();
    ctx.translate(c.by === 0 ? -VIEW_W * (1 - k) : VIEW_W * (1 - k), 0);
    ctx.fillStyle = INK;
    ctx.fillRect(0, bandY - 8, VIEW_W, bandH + 16);
    ctx.fillStyle = pal.gi;
    ctx.fillRect(0, bandY, VIEW_W, bandH);
    ctx.fillStyle = pal.dark;
    ctx.font = `150px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch.kana.repeat(5), VIEW_W / 2, bandY + bandH / 2 + 6);
    ctx.lineJoin = 'round';
    ctx.font = `82px ${DISPLAY}`;
    ctx.lineWidth = 16;
    ctx.strokeStyle = INK;
    ctx.strokeText(c.name, VIEW_W / 2, bandY + bandH / 2);
    ctx.fillStyle = PAPER;
    ctx.fillText(c.name, VIEW_W / 2, bandY + bandH / 2);
    ctx.restore();
  }

  drawHud(s, opts) {
    const ctx = this.ctx;
    const barW = 500;
    const barH = 30;
    const top = 28;
    s.ps.forEach((p, i) => {
      const ch = CHARS[p.char];
      const ratio = p.hp / ch.hp;
      const left = i === 0;
      const x0 = left ? 44 : VIEW_W - 44 - barW;
      const skew = 16;
      const path = (x, w, inset = 0) => {
        ctx.beginPath();
        if (left) {
          ctx.moveTo(x + skew, top + inset);
          ctx.lineTo(x + w, top + inset);
          ctx.lineTo(x + w - skew * 0 , top + barH - inset);
          ctx.lineTo(x, top + barH - inset);
        } else {
          ctx.moveTo(x, top + inset);
          ctx.lineTo(x + w - skew, top + inset);
          ctx.lineTo(x + w, top + barH - inset);
          ctx.lineTo(x, top + barH - inset);
        }
        ctx.closePath();
      };
      ctx.fillStyle = INK;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 8;
      ctx.lineJoin = 'round';
      path(x0, barW);
      ctx.stroke();
      ctx.fill();
      // 減った分（白）→ 残り（色）
      const showW = barW * Math.max(this.hpShow[i], ratio);
      const curW = barW * ratio;
      ctx.fillStyle = PAPER;
      path(left ? x0 + barW - showW : x0, showW, 2);
      ctx.fill();
      ctx.fillStyle = ratio < 0.28 ? '#f03a2e' : '#f6c445';
      path(left ? x0 + barW - curW : x0, curW, 2);
      ctx.fill();
      // 名前
      ctx.font = `26px ${DISPLAY}`;
      ctx.textAlign = left ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 7;
      ctx.strokeStyle = INK;
      const nameX = left ? x0 + 6 : x0 + barW - 6;
      const label = ch.name;
      ctx.strokeText(label, nameX, top + barH + 25);
      ctx.fillStyle = PAPER;
      ctx.fillText(label, nameX, top + barH + 25);
      // ラウンド取得の印
      for (let w = 0; w < 2; w++) {
        const cx = left ? x0 + barW - 16 - w * 30 : x0 + 16 + w * 30;
        ctx.beginPath();
        ctx.arc(cx, top + barH + 21, 10, 0, Math.PI * 2);
        ctx.fillStyle = w < p.wins ? '#f03a2e' : 'rgba(21,16,28,.75)';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = PAPER;
        ctx.stroke();
      }
      // 超必殺ゲージ
      // タッチボタンに隠れないよう、体力バーのすぐ下に置く
      const mw = 300;
      const mh = 14;
      const mx = left ? 48 : VIEW_W - 48 - mw;
      const my = top + barH + 46;
      ctx.fillStyle = INK;
      ctx.fillRect(mx - 3, my - 3, mw + 6, mh + 6);
      const bars = Math.floor(p.meter / SUPER_COST);
      const frac = p.meter / METER_MAX;
      ctx.fillStyle = bars >= 1 ? (this.clock % 20 < 10 ? '#ff7a2e' : '#f6c445') : '#7c6aa6';
      const mFill = mw * frac;
      ctx.fillRect(left ? mx : mx + mw - mFill, my, mFill, mh);
      ctx.fillStyle = INK;
      ctx.fillRect(mx + mw / 2 - 2, my, 4, mh);
      ctx.font = `24px ${DISPLAY}`;
      ctx.textAlign = left ? 'left' : 'right';
      ctx.lineWidth = 6;
      ctx.strokeStyle = INK;
      const barLabel = `超 ${bars}`;
      const labelX = left ? mx + mw + 12 : mx - 12;
      ctx.strokeText(barLabel, labelX, my + 8);
      ctx.fillStyle = bars >= 1 ? '#f6c445' : PAPER;
      ctx.fillText(barLabel, labelX, my + 8);
      // コンボ表示
      const c = this.combos[i];
      if (c) {
        const cx = left ? 52 : VIEW_W - 52;
        const size = 76 + c.pop * 34 + Math.min(40, c.hits * 2);
        ctx.textAlign = left ? 'left' : 'right';
        ctx.save();
        ctx.translate(cx, 232);
        ctx.rotate(left ? -0.05 : 0.05);
        ctx.font = `${size}px ${DISPLAY}`;
        ctx.lineWidth = size * 0.22;
        ctx.strokeStyle = INK;
        ctx.strokeText(c.hits, 0, 0);
        ctx.fillStyle = c.hits >= 10 ? '#f03a2e' : c.hits >= 5 ? '#f6c445' : PAPER;
        ctx.fillText(c.hits, 0, 0);
        const offset = ctx.measureText(String(c.hits)).width + 12;
        ctx.font = `30px ${DISPLAY}`;
        ctx.lineWidth = 8;
        ctx.strokeText('連撃', left ? offset : -offset, 8);
        ctx.fillStyle = PAPER;
        ctx.fillText('連撃', left ? offset : -offset, 8);
        ctx.font = `24px ${DISPLAY}`;
        ctx.lineWidth = 7;
        ctx.strokeText(`${c.dmg} ダメージ`, 0, 58 + size * 0.1);
        ctx.fillStyle = '#ffd983';
        ctx.fillText(`${c.dmg} ダメージ`, 0, 58 + size * 0.1);
        ctx.restore();
      }
    });
    // 時計
    const cx = VIEW_W / 2;
    ctx.beginPath();
    ctx.arc(cx, 48, 40, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = PAPER;
    ctx.stroke();
    ctx.fillStyle = s.time < 600 && !s.training ? '#f03a2e' : PAPER;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (s.training) {
      ctx.font = `20px ${DISPLAY}`;
      ctx.fillText('練習', cx, 50);
    } else {
      ctx.font = `42px ${DISPLAY}`;
      ctx.fillText(String(Math.ceil(s.time / 60)), cx, 50);
    }
    if (opts.note) {
      ctx.font = `600 18px ${UI_FONT}`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.strokeText(opts.note, cx, VIEW_H - 22);
      ctx.fillStyle = PAPER;
      ctx.fillText(opts.note, cx, VIEW_H - 22);
    }
  }

  drawBanner() {
    const b = this.banner;
    if (!b) return;
    const ctx = this.ctx;
    const size = b.big ? 148 : 104;
    ctx.save();
    ctx.translate(VIEW_W / 2, VIEW_H / 2 - 40);
    const pop = Math.min(1, b.t / 8);
    ctx.scale(pop, pop);
    ctx.rotate(-0.03);
    ctx.fillStyle = INK;
    ctx.fillRect(-VIEW_W, -size * 0.72, VIEW_W * 2, size * 1.44);
    ctx.fillStyle = '#f03a2e';
    ctx.fillRect(-VIEW_W, -size * 0.72, VIEW_W * 2, 7);
    ctx.fillRect(-VIEW_W, size * 0.72 - 7, VIEW_W * 2, 7);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${size}px ${DISPLAY}`;
    ctx.fillStyle = PAPER;
    ctx.fillText(b.text, 0, b.sub ? -8 : 4);
    if (b.sub) {
      ctx.font = `700 ${Math.round(size * 0.18)}px ${UI_FONT}`;
      ctx.fillStyle = '#f6c445';
      ctx.fillText(b.sub.split('').join(' '), 0, size * 0.5);
    }
    ctx.restore();
  }
}

// キャラ1体を描く。キャラ選択画面の肖像でも使う
export function paintFighter(ctx, ch, pal, pose, x, groundScreenY, facing, o = {}) {
  const sk = solve(pose, ch);
  const k = sk.k;
  const flash = o.flash;
  const toX = (px) => x + facing * px;
  const toY = (py) => groundScreenY - (py - sk.low);
  const P = (pt) => [toX(pt.x), toY(pt.y)];
  const stroke = (a, b, w, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(...P(a));
    ctx.lineTo(...P(b));
    ctx.stroke();
  };
  const limb = (l, w1, w2, color, end, endR) => {
    const out = 8;
    stroke(l.a, l.b, w1 * k + out, INK);
    stroke(l.b, l.c, w2 * k + out, INK);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(...P(l.c), (endR * k) + out / 2, 0, Math.PI * 2);
    ctx.fill();
    stroke(l.a, l.b, w1 * k, flash || color);
    stroke(l.b, l.c, w2 * k, flash || color);
    ctx.fillStyle = flash || end;
    ctx.beginPath();
    ctx.arc(...P(l.c), endR * k, 0, Math.PI * 2);
    ctx.fill();
  };

  if (o.aura) {
    ctx.fillStyle = pal.trim;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    const c = P({ x: sk.top.x * 0.5, y: sk.top.y * 0.5 });
    ctx.arc(c[0], c[1], 118 + Math.sin((o.clock || 0) * 0.8) * 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // 奥の手足
  limb(sk.legB, 21, 16, pal.dark, INK, 9);
  limb(sk.armB, 15, 13, ch.id === 'goutetsu' ? pal.dark : pal.dark, pal.dark, 8);

  // なびく布（キャラの見分けどころ）
  const clock = o.clock || 0;
  if (ch.id === 'kagari' || ch.id === 'shizuku') {
    const root = ch.id === 'kagari' ? { x: sk.top.x - 4, y: sk.top.y + 2 } : { x: sk.head.x - 10, y: sk.head.y + 8 };
    const len = ch.id === 'kagari' ? 18 : 15;
    const pts = [root];
    let wave = clock * 0.2;
    for (let i = 1; i <= 6; i++) {
      wave += 0.7;
      const prev = pts[i - 1];
      const drag = -facing * (o.vx || 0) * 1.2;
      pts.push({ x: prev.x - len + drag * 0.5, y: prev.y + Math.sin(wave) * 6 - i * (ch.id === 'shizuku' ? 3.4 : 1.2) });
    }
    const color = ch.id === 'kagari' ? pal.trim : pal.hair;
    for (const [w, c] of [[(ch.id === 'kagari' ? 11 : 15) + 7, INK], [ch.id === 'kagari' ? 11 : 15, flash || color]]) {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      pts.forEach((q, i) => {
        const [sx, sy] = P(q);
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
    }
  }

  // 手前の脚
  limb(sk.legF, 23, 18, pal.gi, INK, 10);

  // 胴体
  const px = -Math.cos(pose.t * Math.PI / 180);
  const py = Math.sin(pose.t * Math.PI / 180);
  const wHip = 17 * k;
  const wTop = 24 * k;
  const poly = [
    { x: sk.hip.x + px * wHip, y: sk.hip.y + py * wHip },
    { x: sk.top.x + px * wTop, y: sk.top.y + py * wTop },
    { x: sk.top.x - px * wTop, y: sk.top.y - py * wTop },
    { x: sk.hip.x - px * wHip, y: sk.hip.y - py * wHip },
  ];
  ctx.beginPath();
  poly.forEach((q, i) => {
    const [sx, sy] = P(q);
    if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
  });
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 8;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = flash || pal.gi;
  ctx.fill();
  // 帯
  stroke(
    { x: sk.hip.x + px * wHip + sk.top.x * 0.1, y: sk.hip.y + py * wHip + sk.top.y * 0.1 },
    { x: sk.hip.x - px * wHip + sk.top.x * 0.1, y: sk.hip.y - py * wHip + sk.top.y * 0.1 },
    12,
    flash || pal.trim,
  );
  // 胸元の素肌
  if (!flash) {
    ctx.fillStyle = pal.skin;
    const cMid = { x: sk.top.x * 0.84 - px * -6 * k, y: sk.top.y * 0.84 - py * -6 * k };
    ctx.beginPath();
    ctx.arc(...P(cMid), 10 * k, 0, Math.PI * 2);
    ctx.fill();
  }

  // 頭
  const headR = sk.headR * (ch.id === 'goutetsu' ? 1.1 : 1);
  const hp = P(sk.head);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(hp[0], hp[1], headR + 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = flash || pal.skin;
  ctx.beginPath();
  ctx.arc(hp[0], hp[1], headR, 0, Math.PI * 2);
  ctx.fill();
  if (!flash) {
    // 髪・装飾
    ctx.fillStyle = pal.hair;
    ctx.beginPath();
    if (ch.id === 'goutetsu') {
      // 顎ひげ
      ctx.arc(hp[0] + facing * 4, hp[1] + 7, headR * 0.82, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.fill();
    } else {
      const start = facing > 0 ? Math.PI * 0.78 : -Math.PI * 0.02 - Math.PI * 0.0;
      const a0 = facing > 0 ? start : Math.PI * 1.02 + Math.PI * 0.2 - Math.PI * 0.0;
      void a0;
      ctx.arc(hp[0], hp[1], headR + 1, Math.PI * 1.02, Math.PI * 1.98);
      ctx.lineTo(hp[0] - facing * headR, hp[1] + 4);
      ctx.fill();
    }
    // はちまき
    ctx.strokeStyle = ch.id === 'goutetsu' ? pal.trim : pal.gi;
    ctx.lineWidth = 6;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(hp[0] - headR + 1, hp[1] - 5);
    ctx.lineTo(hp[0] + headR - 1, hp[1] - 5);
    ctx.stroke();
    // 目
    ctx.fillStyle = INK;
    ctx.fillRect(hp[0] + facing * 7 - 3, hp[1] + 1, 7, 3.5);
  }
  // ゴウテツの肩当て
  if (ch.id === 'goutetsu' && !flash) {
    const sp = P(sk.shoulder);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(sp[0], sp[1], 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.trim;
    ctx.beginPath();
    ctx.arc(sp[0], sp[1], 21, 0, Math.PI * 2);
    ctx.fill();
  }

  // 手前の腕
  limb(sk.armF, 16, 14, pal.gi, pal.trim, 10);
}
