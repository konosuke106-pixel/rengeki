// 画面描画。戦闘の結果には一切影響しない（見た目だけの担当）。
import { VIEW_W, VIEW_H, MAX_VIEW_W, GROUND_Y, STAGE_HALF, METER_MAX, SUPER_COST } from './config.js';
import { CHARS } from './characters.js';
import { STAGE_INFO } from './stages.js';
import { moveOf, activeBoxes, hurtboxOf, moveInvincible } from './sim.js';
import { POSES, clonePose, blendPose, targetPose } from './poses.js';
import { playSound } from './audio.js';

const INK = '#15101c';
const PAPER = '#f5ecd6';
const DISPLAY = '"Dela Gothic One", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
const UI_FONT = '"Zen Kaku Gothic New", "Hiragino Sans", "Yu Gothic", sans-serif';

const SKY_PAD = (MAX_VIEW_W - VIEW_W) / 2;
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
  storm: {
    sky: ['#1d1b33', '#2c2a4f', '#4a4472', '#7a6f98'], sun: '#d8d4ff', sunXY: [300, 150], sunR: 60,
    far: '#2a2645', near: '#171528', floor: '#141224', floorLine: '#3c3866', name: '雷雲の頂', rain: true, storm: true, clouds: true,
  },
  bamboo: {
    sky: ['#e9d9a6', '#cfc58a', '#9fb07a', '#6f8f5f'], sun: '#fff3c8', sunXY: [300, 200], sunR: 110,
    far: '#5d7d4e', near: '#2f4a2c', floor: '#26341f', floorLine: '#45603a', name: '竹林の道', bamboo: true,
  },
  moonroof: {
    sky: ['#1c2448', '#2b376a', '#43548e', '#6a7bb0'], sun: '#f4ecd0', sunXY: [900, 170], sunR: 120,
    far: '#2a3360', near: '#161c3a', floor: '#2b3157', floorLine: '#4a548c', name: '月夜の屋根', roofs: true,
  },
  snow: {
    sky: ['#c9d9e8', '#aac3da', '#8aa9c8', '#6c8db3'], sun: '#ffffff', sunXY: [380, 260], sunR: 90,
    far: '#7d9cc0', near: '#e8f1f8', floor: '#dfeaf3', floorLine: '#a9c2d8', name: '雪原', snow: true,
  },
  festival: {
    sky: ['#1a1235', '#2e1f52', '#4b2f6e', '#8a4a7a'], sun: '#ffe9b4', sunXY: [1000, 150], sunR: 80,
    far: '#2a1c45', near: '#1a1030', floor: '#3a2418', floorLine: '#6a4428', name: '祭りの舞台', lanterns: true,
  },
  onirock: {
    sky: ['#3a0f12', '#6b1a1a', '#a3341f', '#e0742e'], sun: '#ffcf6b', sunXY: [640, 400], sunR: 170,
    far: '#4a1414', near: '#220808', floor: '#1c0a0a', floorLine: '#4a1c14', name: '鬼の岩山', spires: true,
  },
  harbor: {
    sky: ['#cfe3ef', '#a9cde2', '#7fb2d3', '#5a93bd'], sun: '#fff6dc', sunXY: [260, 150], sunR: 70,
    far: '#4f7a9a', near: '#3a3f48', floor: '#5a5048', floorLine: '#7a6a5a', name: '港の倉庫', harbor: true,
  },
  autumn: {
    sky: ['#f6d8a0', '#f0b878', '#e08a58', '#c05a48'], sun: '#fff0c8', sunXY: [900, 220], sunR: 100,
    far: '#a04a2a', near: '#6a2418', floor: '#4a2a1a', floorLine: '#7a4a2a', name: '紅葉の山道', leaves: true,
  },
  swamp: {
    sky: ['#2a3a2a', '#3a5038', '#56704a', '#8a9a6a'], sun: '#e0e8c0', sunXY: [380, 200], sunR: 80,
    far: '#2e4030', near: '#1a2a1a', floor: '#1e2a1a', floorLine: '#3a4a2a', name: '霧の沼地', fog: true, deadTrees: true,
  },
  mirror: {
    sky: ['#1c1428', '#2a1e3c', '#3a2a52', '#4e3a6a'], sun: '#e8dcff', sunXY: [640, 140], sunR: 50,
    far: '#241a34', near: '#14101e', floor: '#2a2038', floorLine: '#5a4a7a', name: '鏡の間', mirrors: true,
  },
  skytower: {
    sky: ['#4a9ae0', '#6ab0ea', '#9acaf2', '#d0e6f8'], sun: '#ffffff', sunXY: [980, 160], sunR: 90,
    far: '#f4f8fc', near: '#c8d8e8', floor: '#8a7a6a', floorLine: '#a89a88', name: '雲の上の塔', clouds2: true,
  },
  castle: {
    sky: ['#e8d8b8', '#d8c098', '#c0a070', '#9a7a50'], sun: '#fff4d8', sunXY: [300, 180], sunR: 90,
    far: '#7a6a54', near: '#4a4038', floor: '#5a5048', floorLine: '#7a6e62', name: '城門', walls: true,
  },
  powder: {
    sky: ['#2a1a10', '#3e2614', '#5a3418', '#7a4a20'], sun: '#ffb050', sunXY: [640, 120], sunR: 40,
    far: '#3a2414', near: '#24160c', floor: '#3a2a1a', floorLine: '#5a402a', name: '火薬工房', barrels: true,
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
  const sky = makeLayer(MAX_VIEW_W, VIEW_H, (ctx) => {
    // 木版画のように色の帯で塗り分ける
    const bands = st.sky;
    const bandH = GROUND_Y / bands.length;
    bands.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, i * bandH, MAX_VIEW_W, bandH + 1);
    });
    ctx.fillStyle = st.sun;
    ctx.beginPath();
    ctx.arc(st.sunXY[0] + SKY_PAD, st.sunXY[1], st.sunR, 0, Math.PI * 2);
    ctx.fill();
    if (st.clouds) {
      // 重い雷雲
      const r = seeded(41);
      for (let i = 0; i < 26; i++) {
        ctx.fillStyle = i % 3 ? '#252240' : '#34305a';
        ctx.beginPath();
        ctx.ellipse(r() * MAX_VIEW_W, 40 + r() * 170, 120 + r() * 160, 40 + r() * 30, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 紙の質感
    const r = seeded(7);
    ctx.fillStyle = 'rgba(21,16,28,.05)';
    for (let i = 0; i < 4400; i++) ctx.fillRect(r() * MAX_VIEW_W, r() * VIEW_H, 2, 2);
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
    if (st.bamboo) {
      // 竹の幹と節。手前ほど濃く太い
      const r = seeded(17);
      for (let i = 0; i < 46; i++) {
        const x = r() * 2700;
        const w = 12 + r() * 16;
        ctx.fillStyle = i % 4 ? st.near : '#3f6238';
        ctx.fillRect(x, 0, w, 600);
        ctx.fillStyle = '#1d2f1b';
        for (let y = 40 + r() * 60; y < 560; y += 90 + r() * 40) ctx.fillRect(x - 2, y, w + 4, 5);
      }
    }
    if (st.mirrors) {
      // 縦長の鏡が並ぶ広間
      for (let x = 80; x < 2700; x += 300) {
        ctx.fillStyle = '#0c0816';
        ctx.fillRect(x - 10, 150, 160, 450);
        ctx.fillStyle = '#5a4e7a';
        ctx.fillRect(x, 160, 140, 430);
        ctx.fillStyle = 'rgba(255,255,255,.18)';
        ctx.beginPath();
        ctx.moveTo(x + 20, 590);
        ctx.lineTo(x + 70, 160);
        ctx.lineTo(x + 100, 160);
        ctx.lineTo(x + 50, 590);
        ctx.fill();
      }
    }
    if (st.clouds2) {
      // 雲の海と、遠くの塔
      ctx.fillStyle = st.near;
      ctx.fillRect(1180, 180, 90, 420);
      ctx.beginPath();
      ctx.moveTo(1150, 190);
      ctx.lineTo(1225, 110);
      ctx.lineTo(1300, 190);
      ctx.fill();
      const r = seeded(31);
      for (let i = 0; i < 30; i++) {
        ctx.fillStyle = i % 2 ? '#ffffff' : '#eaf2fa';
        ctx.beginPath();
        ctx.ellipse(r() * 2700, 520 + r() * 60, 120 + r() * 120, 40 + r() * 20, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (st.walls) {
      // 石垣と城門、上に櫓
      ctx.fillStyle = st.near;
      ctx.fillRect(0, 430, 2700, 170);
      ctx.fillStyle = '#3a322c';
      for (let y = 440; y < 600; y += 34) {
        for (let x = (y / 34) % 2 ? 0 : 40; x < 2700; x += 80) ctx.fillRect(x, y, 76, 30);
      }
      ctx.fillStyle = '#20180f';
      ctx.fillRect(1180, 470, 200, 130);
      ctx.fillStyle = st.near;
      ctx.fillRect(1120, 300, 320, 130);
      ctx.beginPath();
      ctx.moveTo(1080, 310);
      ctx.quadraticCurveTo(1280, 230, 1480, 310);
      ctx.fill();
    }
    if (st.barrels) {
      // 火薬の樽と吊りランプ
      for (let i = 0; i < 18; i++) {
        const x = 40 + i * 150 + (i % 2) * 30;
        const y = i % 3 === 0 ? 460 : 510;
        ctx.fillStyle = '#5a3418';
        ctx.fillRect(x, y, 70, 90);
        ctx.fillStyle = '#2a1a0c';
        ctx.fillRect(x, y + 14, 70, 6);
        ctx.fillRect(x, y + 70, 70, 6);
        ctx.fillStyle = '#c03a2a';
        ctx.fillRect(x + 26, y + 34, 18, 18);
      }
      for (let x = 200; x < 2700; x += 500) {
        ctx.strokeStyle = '#1a0e06';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 220);
        ctx.stroke();
        ctx.fillStyle = '#ffb050';
        ctx.beginPath();
        ctx.arc(x, 236, 18, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (st.lanterns) {
      // 屋台の屋根と、張り渡した提灯の列
      ctx.fillStyle = st.near;
      for (let x = 60; x < 2700; x += 420) {
        ctx.fillRect(x, 470, 260, 130);
        ctx.beginPath();
        ctx.moveTo(x - 30, 480);
        ctx.lineTo(x + 130, 420);
        ctx.lineTo(x + 290, 480);
        ctx.fill();
      }
      ctx.strokeStyle = '#120a20';
      ctx.lineWidth = 3;
      for (let row = 0; row < 2; row++) {
        const baseY = 300 + row * 70;
        ctx.beginPath();
        ctx.moveTo(0, baseY);
        for (let x = 0; x <= 2700; x += 90) ctx.lineTo(x, baseY + Math.sin(x / 180) * 24);
        ctx.stroke();
        for (let x = 45 + row * 45; x < 2700; x += 90) {
          const y = baseY + Math.sin(x / 180) * 24 + 22;
          ctx.fillStyle = '#120a20';
          ctx.beginPath();
          ctx.ellipse(x, y, 16, 21, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = (x / 90) % 3 < 1 ? '#ffd36b' : '#ff7a4a';
          ctx.beginPath();
          ctx.ellipse(x, y, 12, 17, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    if (st.spires) {
      // とがった岩の柱
      const r = seeded(23);
      ctx.fillStyle = st.near;
      for (let i = 0; i < 16; i++) {
        const x = r() * 2700;
        const h = 160 + r() * 260;
        const w = 50 + r() * 70;
        ctx.beginPath();
        ctx.moveTo(x - w, 600);
        ctx.lineTo(x - w * 0.2, 560 - h);
        ctx.lineTo(x + w * 0.1, 560 - h + 30);
        ctx.lineTo(x + w, 600);
        ctx.fill();
      }
    }
    if (st.harbor) {
      // 倉庫・積み荷・クレーン
      ctx.fillStyle = st.near;
      [[100, 220], [700, 260], [1400, 230], [2100, 250]].forEach(([x, w]) => {
        ctx.fillRect(x, 400, w * 1.6, 200);
        ctx.beginPath();
        ctx.moveTo(x - 10, 400);
        ctx.lineTo(x + w * 0.8, 350);
        ctx.lineTo(x + w * 1.6 + 10, 400);
        ctx.fill();
      });
      const crates = ['#a8563a', '#3a6a8a', '#c9a23a', '#4a7a4a'];
      for (let i = 0; i < 14; i++) {
        const x = 40 + i * 190 + (i % 3) * 20;
        ctx.fillStyle = crates[i % 4];
        ctx.fillRect(x, 520, 90, 80);
        if (i % 2) ctx.fillRect(x + 20, 460, 70, 60);
        ctx.strokeStyle = 'rgba(0,0,0,.35)';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, 520, 90, 80);
      }
      ctx.strokeStyle = st.near;
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(1240, 600);
      ctx.lineTo(1240, 180);
      ctx.lineTo(1520, 180);
      ctx.moveTo(1240, 260);
      ctx.lineTo(1340, 180);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(1500, 180);
      ctx.lineTo(1500, 330);
      ctx.stroke();
    }
    if (st.deadTrees) {
      // 枯れ木
      ctx.strokeStyle = st.near;
      ctx.lineCap = 'round';
      [[200, 1], [900, 0.8], [1700, 1.1], [2400, 0.9]].forEach(([x, s]) => {
        ctx.lineWidth = 22 * s;
        ctx.beginPath();
        ctx.moveTo(x, 600);
        ctx.lineTo(x + 10 * s, 320);
        ctx.stroke();
        ctx.lineWidth = 9 * s;
        ctx.beginPath();
        ctx.moveTo(x + 6 * s, 420);
        ctx.lineTo(x - 80 * s, 340);
        ctx.moveTo(x + 10 * s, 360);
        ctx.lineTo(x + 100 * s, 290);
        ctx.moveTo(x + 10 * s, 330);
        ctx.lineTo(x - 30 * s, 260);
        ctx.stroke();
      });
    }
    if (st.roofs) {
      // 瓦屋根の並びと五重塔
      ctx.fillStyle = st.near;
      [[0, 470], [420, 500], [860, 455], [1500, 490], [1960, 460], [2380, 500]].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.moveTo(x - 30, 600);
        ctx.lineTo(x - 30, y + 30);
        ctx.quadraticCurveTo(x + 40, y + 20, x + 90, y);
        ctx.lineTo(x + 280, y);
        ctx.quadraticCurveTo(x + 330, y + 20, x + 400, y + 30);
        ctx.lineTo(x + 400, 600);
        ctx.fill();
      });
      for (let i = 0; i < 5; i++) {
        const w = 170 - i * 24;
        const y = 470 - i * 62;
        ctx.fillRect(1260 - w * 0.25, y - 40, w * 0.5, 60);
        ctx.beginPath();
        ctx.moveTo(1260 - w * 0.7, y - 30);
        ctx.quadraticCurveTo(1260, y - 60, 1260 + w * 0.7, y - 30);
        ctx.lineTo(1260 + w * 0.4, y - 48);
        ctx.lineTo(1260 - w * 0.4, y - 48);
        ctx.fill();
      }
      ctx.fillRect(1256, 120, 8, 60);
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

// ステージ選択用の見本の絵。試合中と同じ重ね方で、カメラが真ん中にある時の景色を縮小して描く
export function paintStagePreview(canvas, id) {
  const st = buildStage(id);
  const ctx = canvas.getContext('2d');
  const k = canvas.height / VIEW_H;
  ctx.save();
  ctx.scale(k, k);
  ctx.translate((canvas.width / k - VIEW_W) / 2, 0);
  ctx.drawImage(st.sky, -SKY_PAD, 0);
  ctx.drawImage(st.far, -515, 0);
  ctx.drawImage(st.near, -710, 0);
  ctx.drawImage(st.floor, -660, GROUND_Y);
  ctx.restore();
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
    this.extraX = 0; // 16:9 より細長い画面で、左右に余分に見せる幅
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
    this.snowFlakes = null;
    this.leafList = null;
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
    this.scale = this.canvas.height / VIEW_H;
    this.extraX = Math.max(0, (this.canvas.width / this.scale - VIEW_W) / 2);
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
        case 'gust':
          playSound('whoosh', { rank: 3 });
          this.pushText('突風', this.camX, 110, '#ffffff', 44, 0);
          break;
        case 'drum':
          playSound('bell');
          this.pushText('ドン', this.camX, 120, '#ffe36b', 50, 0);
          break;
        case 'burn':
          this.spark(e.x, sy, 16, '#ff8a2a', 9);
          this.pushText('あちっ', e.x, sy - 50, '#ff8a2a', 34, 0);
          break;
        case 'barrel':
          playSound('s');
          this.shake = Math.max(this.shake, 14);
          this.flash = Math.max(this.flash, 0.35);
          this.spark(e.x, sy, 28, '#ffb030', 14);
          this.rings.push({ x: e.x, y: sy, r: 10, max: 140, life: 1, color: '#ff6a2a' });
          this.pushText('ドカン', e.x, sy - 80, '#ff8a2a', 60, -0.06);
          break;
        case 'mirror':
          this.spark(e.x, sy, 10, '#e8dcff', 8);
          break;
        case 'clone':
          playSound('proj');
          this.spark(e.x, GROUND_Y - 100, 14, '#d9b3ff', 7);
          this.pushText('分身', e.x, GROUND_Y - 230, '#d9b3ff', 30, 0);
          break;
        case 'airdash':
          playSound('dash');
          for (let k = 0; k < 6; k++) this.parts.push({ x: e.x, y: sy + (Math.random() - 0.5) * 60, vx: (Math.random() - 0.5) * 2, vy: 0, g: 0, r: 6, life: 14, max: 14, color: PAPER, kind: 'dust' });
          break;
        case 'gc':
          playSound('armor');
          this.flash = Math.max(this.flash, 0.2);
          this.spark(e.x, sy, 16, '#ffe36b', 10);
          this.pushText('返し', e.x, sy - 60, '#ffe36b', 40, 0);
          break;
        case 'reflect':
          playSound('tech');
          this.spark(e.x, sy, 16, '#ffffff', 10);
          this.pushText('弾いた', e.x, sy - 50, '#ffffff', 34, 0);
          break;
        case 'bomb':
          playSound('s');
          this.shake = Math.max(this.shake, 16);
          this.flash = Math.max(this.flash, 0.4);
          this.spark(e.x, sy, 30, '#ffb030', 15);
          this.rings.push({ x: e.x, y: sy, r: 10, max: 150, life: 1, color: '#ff6a2a' });
          this.pushText('ドカン', e.x, sy - 70, '#ff8a2a', 64, 0.08);
          break;
        case 'chargeMax':
          playSound('armor');
          this.spark(e.x, sy, 12, '#ffffff', 8);
          this.pushText('最大', e.x, sy - 70, '#ffe36b', 34, 0);
          break;
        case 'poison':
          this.pushText('毒', e.x + (Math.random() - 0.5) * 30, sy - 20, '#8fdc3c', 20, 0);
          break;
        case 'parry':
          playSound('armor');
          this.flash = Math.max(this.flash, 0.25);
          this.spark(e.x, sy, 18, '#d9b3ff', 11);
          this.rings.push({ x: e.x, y: sy, r: 10, max: 90, life: 1, color: '#d9b3ff' });
          this.pushText('受け流し', e.x, sy - 50, '#d9b3ff', 40, 0);
          break;
        case 'warp':
          playSound('dash');
          for (const wx of [e.x, e.to]) {
            this.dust(wx, 10);
            this.spark(wx, GROUND_Y - 100, 8, '#e8e2c8', 6);
          }
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
    const lim = Math.max(0, STAGE_HALF - VIEW_W / 2 - this.extraX + 60);
    const tx = Math.max(-lim, Math.min(lim, mid));
    this.camX += (tx - this.camX) * 0.16;
  }

  draw(s, opts = {}) {
    const ctx = this.ctx;
    const sc = this.scale;
    // 1280x720 の枠を画面の中央に置く。左右の余りは -extraX 〜 VIEW_W + extraX に見える
    ctx.setTransform(sc, 0, 0, sc, this.extraX * sc, 0);
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
    this.drawGimmicks(s);
    for (const i of order) this.drawClone(ps[i], i);
    for (const i of order) this.drawFighter(s, ps[i], i);
    for (const q of s.projs) this.drawProjectile(q, s);
    for (const i of order) this.drawSwoosh(ps[i]);
    this.drawParticles();
    if (opts.hitboxes) this.drawHitboxes(s);
    ctx.restore();

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,250,235,${this.flash * 0.75})`;
      this.fillView();
    }
    if (this.superCut) this.drawSuperCut();
    this.drawHud(s, opts);
    this.drawBanner();
  }

  fillView() {
    this.ctx.fillRect(-this.extraX, 0, VIEW_W + this.extraX * 2, VIEW_H);
  }

  drawStage(s, shx, shy) {
    const ctx = this.ctx;
    const st = this.stage;
    if (!st) {
      ctx.fillStyle = INK;
      this.fillView();
      return;
    }
    ctx.drawImage(st.sky, -SKY_PAD, 0);
    const norm = this.camX;
    ctx.drawImage(st.far, -515 - norm * 0.18 + shx * 0.3, shy * 0.3);
    ctx.drawImage(st.near, -710 - norm * 0.4 + shx * 0.5, shy * 0.5);
    ctx.drawImage(st.floor, -660 - norm + shx, GROUND_Y + shy);
    if (st.def.rain) {
      if (!this.rainDrops) {
        const r = seeded(99);
        this.rainDrops = Array.from({ length: 150 }, () => ({ x: r() * MAX_VIEW_W - SKY_PAD, y: r() * VIEW_H, v: 14 + r() * 10 }));
      }
      ctx.strokeStyle = 'rgba(190,210,255,.42)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const d of this.rainDrops) {
        d.y += d.v;
        d.x -= d.v * 0.25;
        if (d.y > VIEW_H) { d.y = -20; d.x = Math.random() * MAX_VIEW_W * 1.2 - SKY_PAD; }
        if (d.x < -SKY_PAD) d.x += MAX_VIEW_W;
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + 5, d.y - 20);
      }
      ctx.stroke();
    }
    if (st.def.storm && Math.random() < 0.004) this.flash = Math.max(this.flash, 0.3);
    if (st.def.snow) {
      if (!this.snowFlakes) {
        const r = seeded(77);
        this.snowFlakes = Array.from({ length: 110 }, () => ({ x: r() * MAX_VIEW_W - SKY_PAD, y: r() * VIEW_H, v: 1 + r() * 2, s: 2 + r() * 4, p: r() * 6 }));
      }
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      for (const f of this.snowFlakes) {
        f.y += f.v;
        f.x += Math.sin(this.clock * 0.03 + f.p) * 0.8 - 0.4;
        if (f.y > VIEW_H) { f.y = -10; f.x = Math.random() * MAX_VIEW_W - SKY_PAD; }
        if (f.x < -SKY_PAD) f.x += MAX_VIEW_W;
        ctx.fillRect(f.x, f.y, f.s, f.s);
      }
    }
    if (st.def.leaves) {
      // 舞い落ちる紅葉
      if (!this.leafList) {
        const r = seeded(55);
        this.leafList = Array.from({ length: 46 }, () => ({ x: r() * MAX_VIEW_W - SKY_PAD, y: r() * VIEW_H, v: 1.2 + r() * 1.6, a: r() * 6, c: r() < 0.5 ? '#e0452b' : r() < 0.5 ? '#f08a2a' : '#c9302a' }));
      }
      for (const f of this.leafList) {
        f.y += f.v;
        f.a += 0.05;
        f.x += Math.sin(this.clock * 0.02 + f.a) * 1.2 - 0.5;
        if (f.y > VIEW_H) { f.y = -10; f.x = Math.random() * MAX_VIEW_W - SKY_PAD; }
        if (f.x < -SKY_PAD) f.x += MAX_VIEW_W;
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.a);
        ctx.fillStyle = f.c;
        ctx.beginPath();
        ctx.ellipse(0, 0, 8, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    if (st.def.fog) {
      // ゆっくり流れる霧の帯
      ctx.fillStyle = 'rgba(200,220,190,.16)';
      for (let i = 0; i < 4; i++) {
        const y = 380 + i * 70;
        const x = ((this.clock * (0.3 + i * 0.15) + i * 400) % (MAX_VIEW_W + 800)) - SKY_PAD - 400;
        ctx.beginPath();
        ctx.ellipse(x, y, 520, 34, 0, 0, Math.PI * 2);
        ctx.ellipse(x - MAX_VIEW_W * 0.6, y + 20, 420, 28, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (s.freeze > 0) {
      ctx.fillStyle = 'rgba(21,16,28,.62)';
      this.fillView();
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

  // ステージの仕掛け：予告の印と、落ちてくる物・横切る物・揺れる荷物・樽
  drawGimmicks(s) {
    if (!s.gimmicks || !s.gim) return;
    const ctx = this.ctx;
    const G = s.gim;
    const def = (STAGE_INFO[s.stage] && STAGE_INFO[s.stage].gim) || {};
    const blink = this.clock % 10 < 5;

    // 突風：予告中は矢印、吹いている間は風の筋
    if (G.wind) {
      if (G.wind.warn > 0) {
        ctx.save();
        ctx.translate(this.camX, 150);
        ctx.scale(G.wind.dir, 1);
        ctx.globalAlpha = blink ? 0.9 : 0.4;
        ctx.fillStyle = PAPER;
        ctx.beginPath();
        ctx.moveTo(-120, -14);
        ctx.lineTo(60, -14);
        ctx.lineTo(60, -36);
        ctx.lineTo(120, 0);
        ctx.lineTo(60, 36);
        ctx.lineTo(60, 14);
        ctx.lineTo(-120, 14);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (this.clock % 2 === 0) {
        for (let k = 0; k < 3; k++) {
          this.parts.push({ x: this.camX - G.wind.dir * (VIEW_W / 2 + 100), y: 120 + Math.random() * 480, vx: G.wind.dir * (24 + Math.random() * 10), vy: 0, g: 0, r: 3, life: 60, max: 60, color: 'rgba(255,255,255,.7)', kind: 'shard', a: G.wind.dir > 0 ? 0 : Math.PI });
        }
      }
    }

    for (const h of G.haz) {
      const spec = h.type === 'spot' ? def.spot : def.mover;
      if (!spec) continue;
      if (h.warn > 0) {
        // 予告：落ちる場所に点滅する印、横切る物は入ってくる側に矢印
        ctx.save();
        ctx.globalAlpha = blink ? 0.85 : 0.35;
        if (h.type === 'spot') {
          ctx.fillStyle = h.kind === 'fog' ? '#8fdc3c' : '#ff4a2a';
          ctx.beginPath();
          ctx.ellipse(h.x, GROUND_Y + 4, h.w / 2, 12, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = `48px ${DISPLAY}`;
          ctx.textAlign = 'center';
          ctx.fillText('!', h.x, GROUND_Y - 200);
        } else {
          const ex = Math.max(-STAGE_HALF + 30, Math.min(STAGE_HALF - 30, h.x));
          ctx.translate(ex, GROUND_Y - 70);
          ctx.scale(Math.sign(h.vx), 1);
          ctx.fillStyle = '#ff4a2a';
          ctx.beginPath();
          ctx.moveTo(-30, -20);
          ctx.lineTo(20, 0);
          ctx.lineTo(-30, 20);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        continue;
      }
      const k = h.type === 'spot' ? 1 - h.active / spec.active : 0;
      ctx.save();
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      if (h.kind === 'bolt') {
        for (const [w, c] of [[30, INK], [18, '#ffe36b'], [7, '#ffffff']]) {
          ctx.strokeStyle = c;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(h.x, 0);
          for (let i = 1, y = 60; y < GROUND_Y; i++, y += 70) ctx.lineTo(h.x + (i % 2 ? 26 : -26), y);
          ctx.lineTo(h.x, GROUND_Y);
          ctx.stroke();
        }
        if (k < 0.3) this.flash = Math.max(this.flash, 0.25);
      } else if (h.kind === 'bamboo') {
        // 竹：根元を軸に倒れてくる
        ctx.translate(h.x - 160, GROUND_Y);
        ctx.rotate(-Math.PI / 2 + Math.min(1, k * 1.6) * (Math.PI / 2 - 0.05));
        ctx.fillStyle = '#5a8a3a';
        ctx.fillRect(0, -14, 340, 28);
        ctx.strokeRect(0, -14, 340, 28);
        ctx.fillStyle = '#2f4a2c';
        for (let x = 60; x < 340; x += 70) ctx.fillRect(x, -16, 6, 32);
      } else if (h.kind === 'tile') {
        const y = GROUND_Y - 600 * (1 - Math.min(1, k * 1.4));
        ctx.fillStyle = '#3a3a52';
        for (const dx of [-16, 14]) {
          ctx.fillRect(h.x + dx - 14, y - 18, 28, 18);
          ctx.strokeRect(h.x + dx - 14, y - 18, 28, 18);
        }
      } else if (h.kind === 'arrows') {
        const fall = Math.min(1, k * 1.5);
        ctx.strokeStyle = '#3a2a1a';
        ctx.lineWidth = 4;
        for (let i = 0; i < 9; i++) {
          const ax = h.x - h.w / 2 + 14 + i * (h.w - 28) / 8;
          const ay = GROUND_Y - 520 * (1 - fall) - (i % 3) * 30;
          ctx.beginPath();
          ctx.moveTo(ax, ay - 60);
          ctx.lineTo(ax, ay);
          ctx.stroke();
          ctx.fillStyle = '#d8dde3';
          ctx.beginPath();
          ctx.moveTo(ax - 6, ay - 8);
          ctx.lineTo(ax, ay + 8);
          ctx.lineTo(ax + 6, ay - 8);
          ctx.fill();
        }
      } else if (h.kind === 'fog') {
        ctx.globalAlpha = 0.45 * Math.min(1, h.active / 20);
        for (let i = 0; i < 7; i++) {
          ctx.fillStyle = i % 2 ? '#6fae2e' : '#a6e04a';
          ctx.beginPath();
          ctx.arc(h.x - h.w / 2 + 25 + i * (h.w - 50) / 6, GROUND_Y - 60 - Math.sin(this.clock * 0.05 + i) * 20, 60, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (h.kind === 'boulder') {
        ctx.translate(h.x, GROUND_Y - h.h / 2);
        ctx.rotate(h.x / 45);
        ctx.fillStyle = '#5a4a40';
        ctx.beginPath();
        for (let i = 0; i < 9; i++) {
          const a = i / 9 * Math.PI * 2;
          const r = h.h / 2 * (i % 2 ? 0.92 : 1);
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (h.kind === 'whirl') {
        ctx.strokeStyle = 'rgba(255,240,210,.8)';
        ctx.lineWidth = 4;
        for (let i = 0; i < 6; i++) {
          const y = GROUND_Y - 20 - i * 34;
          const r = 14 + i * 9;
          ctx.beginPath();
          ctx.ellipse(h.x + Math.sin(this.clock * 0.3 + i) * 8, y, r, 8, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (this.clock % 3 === 0) this.parts.push({ x: h.x, y: GROUND_Y - Math.random() * 180, vx: (Math.random() - 0.5) * 6, vy: -1, g: 0, r: 5, life: 20, max: 20, color: '#e0452b', kind: 'shard', a: Math.random() * 6 });
      }
      ctx.restore();
    }

    // 揺れる荷物：上から綱で吊るされている
    if (def.crate && G.crateX !== undefined) {
      const c = def.crate;
      const top = GROUND_Y - c.y - c.h;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(G.crateX, top);
      ctx.stroke();
      ctx.fillStyle = '#a8563a';
      ctx.fillRect(G.crateX - c.w / 2, top, c.w, c.h);
      ctx.lineWidth = 5;
      ctx.strokeRect(G.crateX - c.w / 2, top, c.w, c.h);
      ctx.beginPath();
      ctx.moveTo(G.crateX - c.w / 2, top);
      ctx.lineTo(G.crateX + c.w / 2, top + c.h);
      ctx.stroke();
    }

    // 火薬樽：壊れている間は、元に戻る少し前から薄く見える
    if (def.barrels) {
      const b = def.barrels;
      for (const br of G.barrels) {
        if (br.cd > 60) continue;
        ctx.save();
        ctx.globalAlpha = br.cd > 0 ? 0.35 : 1;
        ctx.fillStyle = '#c0301e';
        ctx.fillRect(br.x - b.w / 2, GROUND_Y - b.h, b.w, b.h);
        ctx.lineWidth = 4;
        ctx.strokeStyle = INK;
        ctx.strokeRect(br.x - b.w / 2, GROUND_Y - b.h, b.w, b.h);
        ctx.fillStyle = INK;
        ctx.fillRect(br.x - b.w / 2, GROUND_Y - b.h + 12, b.w, 5);
        ctx.fillRect(br.x - b.w / 2, GROUND_Y - 17, b.w, 5);
        ctx.fillStyle = '#ffe36b';
        ctx.font = `28px ${DISPLAY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('火', br.x, GROUND_Y - b.h / 2);
        ctx.restore();
      }
    }
  }

  // 分身：本体と同じ姿で、半透明の紫がかった影として描く
  drawClone(p, i) {
    if (!p.clone) return;
    const ch = CHARS[p.char];
    const pal = ch.palettes[p.palette];
    const ctx = this.ctx;
    const fade = Math.min(1, p.clone.life / 40);
    ctx.save();
    ctx.globalAlpha = (0.42 + 0.08 * Math.sin(this.clock * 0.2)) * fade;
    const echoPose = p.st === 'attack' && moveOf(p) && moveOf(p).spawn ? this.poses[i] : POSES.parry;
    paintFighter(ctx, ch, { ...pal, gi: pal.trim, dark: pal.dark }, echoPose, p.clone.x, GROUND_Y, p.clone.facing, { clock: this.clock });
    ctx.restore();
  }

  drawFighter(s, p, i) {
    const ch = CHARS[p.char];
    const pal = ch.palettes[p.palette];
    const pose = this.poses[i];
    const whiteFlash = p.hitstop > 0 && (p.st === 'hit' || p.st === 'hitair');
    const blockFlash = p.st === 'block' && p.hitstop > 0;
    const ghost = p.st !== 'down' && p.st !== 'getup' && (p.inv > 0 || moveInvincible(p)) && this.clock % 4 < 2 && p.st !== 'thrown';
    this.ctx.save();
    if (ghost) this.ctx.globalAlpha = 0.55;
    const shakeX = p.hitstop > 0 && (p.st === 'hit' || p.st === 'hitair') ? (this.clock % 2 ? 4 : -4) : 0;
    paintFighter(this.ctx, ch, pal, pose, p.x + shakeX, GROUND_Y - p.y, p.facing, {
      flash: whiteFlash ? '#ffffff' : blockFlash ? '#bfe3ff' : null,
      vx: p.vx,
      clock: this.clock,
      aura: s.freeze > 0 && s.freezeBy === i,
      rage: ch.rage && p.hp > 0 && p.hp < ch.hp * 0.5,
      airborne: p.y > 0,
    });
    this.ctx.restore();
    // くっついた時限爆弾：頭の上で点滅し、爆発が近いほど速くなる
    if (p.bombT > 0) {
      const ctx = this.ctx;
      const bx = p.x;
      const by = GROUND_Y - p.y - ch.h - 34;
      const blink = p.bombT < 30 ? this.clock % 4 < 2 : this.clock % 12 < 6;
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(bx, by, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = blink ? '#ff4a2a' : '#5a5a5a';
      ctx.beginPath();
      ctx.arc(bx - 4, by - 4, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c9a46a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bx + 8, by - 12);
      ctx.quadraticCurveTo(bx + 16, by - 26, bx + 22, by - 20);
      ctx.stroke();
      ctx.fillStyle = '#ffe36b';
      ctx.beginPath();
      ctx.arc(bx + 22, by - 20, 4 + (this.clock % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    if (p.frozen > 0 && p.st === 'hit') this.drawIceBlock(p, ch);
    // 毒：頭の上に緑の泡が立つ
    if (p.poison > 0 && this.clock % 5 === 0) {
      this.parts.push({ x: p.x + (Math.random() - 0.5) * 50, y: GROUND_Y - p.y - ch.h * 0.9, vx: (Math.random() - 0.5) * 0.6, vy: -1.6, g: 0, r: 4 + Math.random() * 5, life: 26, max: 26, color: '#8fdc3c', kind: 'bubble' });
    }
    // 溜め：手元に光の輪が広がる
    const m = moveOf(p);
    // 溜めている間、技のコマは charge.at の1つ手前で止まっている
    if (p.st === 'attack' && m && m.charge && p.f < m.charge.at && p.chargeF > 0) {
      const c = p.chargeF / m.charge.max;
      const ctx = this.ctx;
      const cx = p.x + p.facing * 50;
      const cy = GROUND_Y - p.y - 120;
      ctx.save();
      ctx.strokeStyle = c >= 1 ? '#ffffff' : pal.trim;
      for (let r = 0; r < 3; r++) {
        ctx.globalAlpha = 0.8 - r * 0.22;
        ctx.lineWidth = 4 + c * 4;
        ctx.beginPath();
        ctx.arc(cx, cy, 16 + c * 46 + r * 12 + (this.clock % 6) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // 凍った相手を包む氷
  drawIceBlock(p, ch) {
    const ctx = this.ctx;
    const w = ch.w * 1.9;
    const h = ch.h * 1.08;
    const x = p.x - w / 2;
    const y = GROUND_Y - p.y - h;
    const melt = Math.min(1, p.frozen / 12);
    ctx.save();
    ctx.globalAlpha = 0.55 * melt + 0.15;
    ctx.fillStyle = '#bfe6ff';
    ctx.beginPath();
    ctx.moveTo(x + 8, y + h);
    ctx.lineTo(x, y + h * 0.35);
    ctx.lineTo(x + w * 0.3, y);
    ctx.lineTo(x + w * 0.78, y + 10);
    ctx.lineTo(x + w, y + h * 0.4);
    ctx.lineTo(x + w - 6, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = melt;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w * 0.2, y + h * 0.3);
    ctx.lineTo(x + w * 0.35, y + h * 0.15);
    ctx.moveTo(x + w * 0.6, y + h * 0.7);
    ctx.lineTo(x + w * 0.8, y + h * 0.5);
    ctx.stroke();
    ctx.restore();
  }

  drawSwoosh(p) {
    const ctx = this.ctx;
    const mv = moveOf(p);
    // 鎖の技は当たった後も、判定が出ている間は鎖を描く（当たった判定は activeBoxes から外れるため別に集める）
    const list = mv && mv.chain && p.st === 'attack'
      ? mv.boxes.filter((b) => p.f >= b.from && p.f <= b.to + 2).map((b) => {
        const cx = p.x + p.facing * b.box[0];
        return { b, rect: { x0: cx - b.box[2] / 2, x1: cx + b.box[2] / 2, y0: p.y + b.box[1], y1: p.y + b.box[1] + b.box[3] } };
      })
      : activeBoxes(p);
    for (const { b, rect } of list) {
      if (b.throw) continue;
      // 鎖の技：手元から判定の先まで鎖を伸ばし、先に鎌を描く
      if (mv && mv.chain) {
        const pal = CHARS[p.char].palettes[p.palette];
        const sx = p.x + p.facing * 40;
        const sy = GROUND_Y - p.y - 120;
        const ex = p.facing > 0 ? rect.x1 : rect.x0;
        const ey = GROUND_Y - (rect.y0 + rect.y1) / 2;
        ctx.save();
        ctx.lineCap = 'round';
        for (const [w, c] of [[8, INK], [4, pal.trim]]) {
          ctx.strokeStyle = c;
          ctx.lineWidth = w;
          ctx.setLineDash([9, 5]);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.translate(ex, ey);
        ctx.scale(p.facing, 1);
        ctx.fillStyle = '#d8dde3';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(26, -30, 6, -46);
        ctx.quadraticCurveTo(14, -24, -6, -4);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
        continue;
      }
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
    } else if (q.kind === 'star') {
      // 手裏剣
      ctx.rotate(q.age * 0.6 * dir);
      ctx.fillStyle = '#c9ced6';
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2;
        const rr = k % 2 ? q.w * 0.18 : q.w * 0.62;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (q.kind === 'bolt') {
      // 空から落ちる稲妻。地面までの柱で描く
      const top = -q.h / 2 - 760;
      const bottom = q.h / 2 + q.y;
      const zig = [];
      const r = seeded(q.age * 31 + 7);
      for (let yy = top; yy < bottom; yy += 46) zig.push([(r() - 0.5) * 46, yy]);
      zig.push([0, bottom]);
      for (const [w, c] of [[q.w * 0.42, INK], [q.w * 0.3, pal.trim], [q.w * 0.12, '#ffffff']]) {
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        zig.forEach(([zx, zy], i) => (i ? ctx.lineTo(zx, zy) : ctx.moveTo(zx, zy)));
        ctx.stroke();
      }
      ctx.fillStyle = pal.trim;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.ellipse(0, bottom, q.w * 0.8, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (q.kind === 'shadow') {
      // 地面を這う影
      ctx.scale(dir, 1);
      ctx.translate(0, q.h / 2);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.ellipse(-10, -4, q.w * 0.62, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal.trim;
      for (let i = 0; i < 4; i++) {
        const hx = q.w * 0.4 - i * 20;
        const hh = 24 + 10 * Math.sin(q.age * 0.5 + i);
        ctx.beginPath();
        ctx.moveTo(hx - 8, -4);
        ctx.quadraticCurveTo(hx + 10, -hh * 0.6, hx + 2, -hh);
        ctx.quadraticCurveTo(hx, -hh * 0.4, hx - 14, -4);
        ctx.fill();
      }
    } else if (q.kind === 'ice') {
      ctx.scale(dir, 1);
      ctx.fillStyle = '#d8f0ff';
      ctx.beginPath();
      ctx.moveTo(q.w * 0.6, 0);
      ctx.lineTo(-q.w * 0.2, -q.h / 2);
      ctx.lineTo(-q.w * 0.5, -q.h * 0.15);
      ctx.lineTo(-q.w * 0.3, 0);
      ctx.lineTo(-q.w * 0.5, q.h * 0.2);
      ctx.lineTo(-q.w * 0.2, q.h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(q.w * 0.4, 0);
      ctx.lineTo(-q.w * 0.2, -q.h * 0.25);
      ctx.stroke();
    } else if (q.kind === 'trap') {
      // 地面に置かれた霜。効き始めるまでは薄い
      const armed = q.age >= (q.data.arm || 0);
      const fade = Math.min(1, q.life / 30);
      ctx.translate(0, q.h / 2);
      ctx.globalAlpha = (armed ? 1 : 0.35) * fade;
      ctx.fillStyle = '#9fd4f2';
      ctx.beginPath();
      ctx.ellipse(0, -2, q.w * 0.6, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#eaf7ff';
      for (let i = -2; i <= 2; i++) {
        const hh = (armed ? 22 : 10) + (i % 2 ? 0 : 10) + Math.sin(q.age * 0.12 + i) * 3;
        ctx.beginPath();
        ctx.moveTo(i * 13 - 7, -4);
        ctx.lineTo(i * 13, -4 - hh);
        ctx.lineTo(i * 13 + 7, -4);
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    } else if (q.kind === 'sound') {
      // 音の衝撃波：進む向きにふくらむ弧を重ねる。溜めるほど太く白くなる
      const lv = q.data.level || 0;
      ctx.scale(dir, 1);
      for (let i = 0; i < 3; i++) {
        const off = -i * 18 + (q.age % 6) * 2;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 9 + lv * 8;
        ctx.beginPath();
        ctx.ellipse(off, 0, q.w * 0.35, q.h * 0.5, 0, -1.2, 1.2);
        ctx.stroke();
        ctx.strokeStyle = lv >= 1 ? '#ffffff' : i === 0 ? pal.trim : pal.gi;
        ctx.lineWidth = 4 + lv * 6;
        ctx.stroke();
      }
    } else if (q.kind === 'arrow') {
      // 矢：飛ぶ向きに回す
      ctx.rotate(Math.atan2(-q.vy, q.vx));
      const len = q.data.big ? 120 : 64;
      const w = q.data.big ? 8 : 4;
      ctx.lineCap = 'round';
      for (const [lw, c] of [[w + 5, INK], [w, '#c9a46a']]) {
        ctx.strokeStyle = c;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(-len / 2, 0);
        ctx.lineTo(len / 2, 0);
        ctx.stroke();
      }
      ctx.fillStyle = q.data.big ? '#ffffff' : '#d8dde3';
      ctx.beginPath();
      ctx.moveTo(len / 2 + 16, 0);
      ctx.lineTo(len / 2 - 4, -9);
      ctx.lineTo(len / 2 - 4, 9);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.fillStyle = pal.trim;
      ctx.fillRect(-len / 2 - 2, -8, 14, 16);
      if (q.data.big) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#fff4c9';
        ctx.fillRect(-len * 1.4, -3, len, 6);
      }
    } else if (q.kind === 'mist') {
      // 毒霧：ゆらめく緑の雲
      const fade = Math.min(1, q.life / 12);
      ctx.globalAlpha = 0.75 * fade;
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + q.age * 0.08;
        ctx.fillStyle = i % 2 ? '#6fae2e' : '#a6e04a';
        ctx.beginPath();
        ctx.arc(Math.cos(a) * q.w * 0.25, Math.sin(a) * q.h * 0.25, q.w * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = fade;
      ctx.fillStyle = INK;
      ctx.fillRect(-12, -6, 6, 6);
      ctx.fillRect(6, -6, 6, 6);
    } else if (q.kind === 'blade') {
      // 幻の刃：三日月形
      ctx.scale(dir, 1);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = pal.trim;
      ctx.beginPath();
      ctx.arc(-q.w * 0.2, 0, q.h * 0.5, -1.3, 1.3);
      ctx.arc(-q.w * 0.45, 0, q.h * 0.42, 1.1, -1.1, true);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (q.kind === 'feather') {
      // 風切り羽
      ctx.scale(dir, 1);
      ctx.rotate(Math.sin(q.age * 0.4) * 0.15);
      ctx.fillStyle = pal.trim;
      ctx.beginPath();
      ctx.moveTo(q.w * 0.6, 0);
      ctx.quadraticCurveTo(0, -q.h * 0.8, -q.w * 0.6, 0);
      ctx.quadraticCurveTo(0, q.h * 0.8, q.w * 0.6, 0);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(q.w * 0.6, 0);
      ctx.lineTo(-q.w * 0.8, 0);
      ctx.stroke();
    } else if (q.kind === 'bomb') {
      // 投げた爆弾：黒い玉と火花の付いた導火線
      ctx.rotate(q.age * 0.25 * dir);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(0, 0, q.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a5a5a';
      ctx.beginPath();
      ctx.arc(-5, -5, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe36b';
      ctx.beginPath();
      ctx.arc(q.w / 2 + 4, -q.w / 2, 4 + (q.age % 3), 0, Math.PI * 2);
      ctx.fill();
    } else if (q.kind === 'prison') {
      // 地面から突き出す大きな氷
      const grow = Math.min(1, (q.age + 1) / 5);
      ctx.translate(0, q.h / 2);
      ctx.fillStyle = '#c4ebff';
      for (const [ox, hw, hk] of [[-40, 30, 0.7], [38, 32, 0.8], [0, 40, 1]]) {
        const hh = q.h * hk * grow;
        ctx.beginPath();
        ctx.moveTo(ox - hw, 0);
        ctx.lineTo(ox - hw * 0.6, -hh * 0.8);
        ctx.lineTo(ox, -hh);
        ctx.lineTo(ox + hw * 0.6, -hh * 0.8);
        ctx.lineTo(ox + hw, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
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
      ctx.moveTo(Math.cos(a - 0.013) * 1300, Math.sin(a - 0.013) * 1300);
      ctx.lineTo(Math.cos(a) * 280, Math.sin(a) * 180);
      ctx.lineTo(Math.cos(a + 0.013) * 1300, Math.sin(a + 0.013) * 1300);
      ctx.fill();
    }
    ctx.restore();
    const bandY = 244;
    const bandH = 150;
    ctx.save();
    const fullW = VIEW_W + this.extraX * 2;
    ctx.translate(c.by === 0 ? -fullW * (1 - k) : fullW * (1 - k), 0);
    ctx.fillStyle = INK;
    ctx.fillRect(-this.extraX, bandY - 8, fullW, bandH + 16);
    ctx.fillStyle = pal.gi;
    ctx.fillRect(-this.extraX, bandY, fullW, bandH);
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

// なびく布（はちまき・髪・マフラー）。キャラの見分けどころ
const CLOTH = {
  kagari: { at: 'top', len: 18, n: 6, w: 11, droop: 1.2, color: 'trim' },
  shizuku: { at: 'head', len: 15, n: 6, w: 15, droop: 3.4, color: 'hair' },
  hayate: { at: 'neck', len: 21, n: 8, w: 12, droop: 0.5, color: 'trim' },
  yumi: { at: 'head', len: 14, n: 6, w: 13, droop: 2.6, color: 'hair' },
  tsuzumi: { at: 'top', len: 13, n: 5, w: 9, droop: 1.6, color: 'trim' },
};

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

  // オニの怒り：体力が半分を切ると赤い気がゆらめく
  if (o.rage && !flash) {
    ctx.fillStyle = '#ff3b2f';
    ctx.globalAlpha = 0.22 + 0.1 * Math.sin((o.clock || 0) * 0.3);
    ctx.beginPath();
    const c = P({ x: sk.top.x * 0.5, y: sk.top.y * 0.6 });
    ctx.ellipse(c[0], c[1], 90 * k, 130 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ツバサの翼：背中から生え、空中では大きく広げる
  if (ch.id === 'tsubasa') {
    const base = P({ x: sk.top.x * 0.8 - 8, y: sk.top.y * 0.8 });
    const spread = o.airborne ? 1 : 0.55;
    const flap = Math.sin((o.clock || 0) * (o.airborne ? 0.4 : 0.08)) * 10 * spread;
    for (const [col, sc] of [[INK, 1.12], [flash || pal.trim, 1]]) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(base[0], base[1]);
      ctx.quadraticCurveTo(base[0] - facing * 70 * sc * spread, base[1] - (60 + flap) * sc, base[0] - facing * 110 * sc * spread, base[1] - (30 + flap) * sc);
      ctx.lineTo(base[0] - facing * 80 * sc * spread, base[1] + 4);
      ctx.lineTo(base[0] - facing * 95 * sc * spread, base[1] + 26 * sc);
      ctx.lineTo(base[0] - facing * 50 * sc * spread, base[1] + 20 * sc);
      ctx.closePath();
      ctx.fill();
    }
  }
  // ハゼの腰の爆弾袋
  if (ch.id === 'haze' && !flash) {
    const b = P({ x: sk.hip.x - 18, y: sk.hip.y + 6 });
    ctx.fillStyle = INK;
    for (const [dx, dy] of [[0, 0], [-14, 6]]) {
      ctx.beginPath();
      ctx.arc(b[0] - facing * dx, b[1] + dy, 11, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#f0c030';
    ctx.fillRect(b[0] - 2, b[1] - 16, 4, 6);
  }

  // ツヅミの背中の太鼓
  if (ch.id === 'tsuzumi') {
    const d = P({ x: sk.hip.x - 26, y: sk.hip.y + 30 });
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(d[0], d[1], 25 * k, 30 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = flash || '#b5652d';
    ctx.beginPath();
    ctx.ellipse(d[0], d[1], 21 * k, 26 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = flash || pal.trim;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(d[0] - 18 * k, d[1] - 14 * k);
    ctx.lineTo(d[0] + 18 * k, d[1] + 14 * k);
    ctx.moveTo(d[0] + 18 * k, d[1] - 14 * k);
    ctx.lineTo(d[0] - 18 * k, d[1] + 14 * k);
    ctx.stroke();
  }

  // 奥の手足
  limb(sk.legB, 21, 16, pal.dark, INK, 9);
  limb(sk.armB, 15, 13, ch.id === 'goutetsu' ? pal.dark : pal.dark, pal.dark, 8);

  // なびく布（キャラの見分けどころ）
  const clock = o.clock || 0;
  const cloth = CLOTH[ch.id];
  if (cloth) {
    const root = cloth.at === 'top' ? { x: sk.top.x - 4, y: sk.top.y + 2 }
      : cloth.at === 'neck' ? { x: sk.head.x - 6, y: sk.head.y - 14 }
        : { x: sk.head.x - 10, y: sk.head.y + 8 };
    const len = cloth.len;
    const pts = [root];
    let wave = clock * 0.2;
    for (let i = 1; i <= cloth.n; i++) {
      wave += 0.7;
      const prev = pts[i - 1];
      const drag = -facing * (o.vx || 0) * 1.2;
      pts.push({ x: prev.x - len + drag * 0.5, y: prev.y + Math.sin(wave) * 6 - i * cloth.droop });
    }
    const color = pal[cloth.color];
    for (const [w, c] of [[cloth.w + 7, INK], [cloth.w, flash || color]]) {
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
  if (!flash && ch.id === 'kage') {
    // フードで顔を隠し、目だけ光る
    ctx.fillStyle = pal.dark;
    ctx.beginPath();
    ctx.arc(hp[0], hp[1], headR + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(hp[0] + facing * 6, hp[1] + 2, headR * 0.62, headR * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.trim;
    ctx.fillRect(hp[0] + facing * 5 - 4, hp[1] - 1, 8, 3.5);
    ctx.fillRect(hp[0] + facing * 13 - 3, hp[1] - 1, 6, 3.5);
  } else if (!flash && ch.id === 'hami') {
    // 蛇の頭巾：頭の後ろと上を覆い、頭のてっぺんに蛇の目
    ctx.fillStyle = pal.dark;
    ctx.beginPath();
    ctx.arc(hp[0], hp[1], headR + 4, Math.PI * 1.0, Math.PI * 2.0);
    ctx.lineTo(hp[0] - facing * (headR + 6), hp[1] + headR + 8);
    ctx.lineTo(hp[0] - facing * (headR - 6), hp[1] + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = pal.gi;
    ctx.beginPath();
    ctx.ellipse(hp[0] + facing * 6, hp[1] - headR - 2, 12, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.trim;
    ctx.fillRect(hp[0] + facing * 4 - 2, hp[1] - headR - 5, 4, 4);
    ctx.fillRect(hp[0] + facing * 12 - 2, hp[1] - headR - 5, 4, 4);
    ctx.fillStyle = INK;
    ctx.fillRect(hp[0] + facing * 7 - 3, hp[1] + 1, 7, 3.5);
  } else if (!flash) {
    // 髪・装飾
    ctx.fillStyle = pal.hair;
    ctx.beginPath();
    if (ch.id === 'goutetsu' || ch.id === 'oni') {
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
    // ハヤテの口元を覆う布
    if (ch.id === 'hayate') {
      ctx.fillStyle = pal.dark;
      ctx.beginPath();
      ctx.arc(hp[0], hp[1], headR, 0.05 * Math.PI, 0.95 * Math.PI);
      ctx.lineTo(hp[0] - headR, hp[1] + 6);
      ctx.lineTo(hp[0] + headR, hp[1] + 6);
      ctx.fill();
    }
  }
  // マボロシの白い面
  if (ch.id === 'maboroshi' && !flash) {
    ctx.fillStyle = '#f4f0ea';
    ctx.beginPath();
    ctx.ellipse(hp[0] + facing * 5, hp[1] + 2, headR * 0.72, headR * 0.86, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(hp[0] + facing * 9, hp[1] - 2, 4, 2, -0.3 * facing, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.trim;
    ctx.fillRect(hp[0] + facing * 3 - 1, hp[1] + 8, 2, 6);
  }
  // カブトの兜の前立て
  if (ch.id === 'kabuto' && !flash) {
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(hp[0], hp[1] - 2, headR + 5, Math.PI * 1.0, Math.PI * 2.0);
    ctx.fill();
    ctx.fillStyle = pal.trim;
    ctx.beginPath();
    ctx.moveTo(hp[0] - 4, hp[1] - headR - 2);
    ctx.lineTo(hp[0] - 18, hp[1] - headR - 26);
    ctx.lineTo(hp[0], hp[1] - headR - 10);
    ctx.lineTo(hp[0] + 18, hp[1] - headR - 26);
    ctx.lineTo(hp[0] + 4, hp[1] - headR - 2);
    ctx.closePath();
    ctx.fill();
  }
  // ハゼのゴーグル
  if (ch.id === 'haze' && !flash) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(hp[0] - headR, hp[1] - 6);
    ctx.lineTo(hp[0] + headR, hp[1] - 6);
    ctx.stroke();
    ctx.fillStyle = '#9fd8f0';
    ctx.beginPath();
    ctx.arc(hp[0] + facing * 8, hp[1] - 6, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // オニの角
  if (ch.id === 'oni' && !flash) {
    for (const side of [-0.55, 0.45]) {
      const bx = hp[0] + side * headR * facing;
      const by = hp[1] - headR * 0.7;
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.moveTo(bx - 9, by + 4);
      ctx.lineTo(bx + side * 8 * facing, by - 26);
      ctx.lineTo(bx + 9, by + 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = pal.trim;
      ctx.beginPath();
      ctx.moveTo(bx - 5, by + 1);
      ctx.lineTo(bx + side * 7 * facing, by - 20);
      ctx.lineTo(bx + 5, by + 1);
      ctx.closePath();
      ctx.fill();
    }
  }
  // コガラシの毛皮の肩掛け
  if (ch.id === 'kogarashi' && !flash) {
    const sp = P(sk.shoulder);
    for (const [dx, dy, r] of [[-16, 4, 15], [0, -4, 17], [16, 4, 15], [-6, 14, 13], [10, 14, 13]]) {
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(sp[0] + dx * facing, sp[1] + dy, r + 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = pal.trim;
    for (const [dx, dy, r] of [[-16, 4, 15], [0, -4, 17], [16, 4, 15], [-6, 14, 13], [10, 14, 13]]) {
      ctx.beginPath();
      ctx.arc(sp[0] + dx * facing, sp[1] + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
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

  // 手に持つ物（前腕の向き u に沿って描く）
  const hand = sk.armF.c;
  const fl = Math.hypot(hand.x - sk.armF.b.x, hand.y - sk.armF.b.y) || 1;
  const ux = (hand.x - sk.armF.b.x) / fl;
  const uy = (hand.y - sk.armF.b.y) / fl;
  if (ch.id === 'kabuto') {
    // 盾：手の前に縦長の丸い盾
    const hp2 = P(hand);
    const sx = hp2[0] + facing * 10;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(sx, hp2[1], 26 * k, 46 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = flash || pal.dark;
    ctx.beginPath();
    ctx.ellipse(sx, hp2[1], 21 * k, 41 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = flash || pal.trim;
    ctx.beginPath();
    ctx.arc(sx, hp2[1], 9 * k, 0, Math.PI * 2);
    ctx.fill();
  } else if (ch.id === 'oni') {
    // 金棒：太く短く、とげ付き
    const tip = { x: hand.x + ux * 78, y: hand.y + uy * 78 };
    const butt = { x: hand.x - ux * 14, y: hand.y - uy * 14 };
    stroke(butt, tip, 26, INK);
    stroke(butt, tip, 18, flash || '#5a5560');
    ctx.fillStyle = flash || pal.trim;
    for (let i = 1; i <= 4; i++) {
      const sp = P({ x: hand.x + ux * (18 + i * 14), y: hand.y + uy * (18 + i * 14) });
      ctx.beginPath();
      ctx.arc(sp[0], sp[1], 4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (ch.id === 'kusari') {
    // 鎌と、手から垂れる鎖
    const tip = { x: hand.x + ux * 34, y: hand.y + uy * 34 };
    stroke(hand, tip, 9, INK);
    stroke(hand, tip, 5, flash || '#8a5a2e');
    const tp = P(tip);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(tp[0] - facing * 10, tp[1], 18, facing > 0 ? -1.6 : -1.54 + Math.PI * 0.0, facing > 0 ? 0.1 : 3.1, false);
    ctx.stroke();
    ctx.strokeStyle = flash || pal.trim;
    ctx.lineWidth = 4;
    ctx.stroke();
    const hp2 = P(hand);
    ctx.strokeStyle = flash || pal.trim;
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(hp2[0], hp2[1]);
    ctx.quadraticCurveTo(hp2[0] - facing * 20, hp2[1] + 40, hp2[0] - facing * 34, hp2[1] + 18);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (ch.id === 'yumi') {
    // 弓：手を中心に、前へふくらむ弧と弦
    const hp2 = P(hand);
    const r = 56 * k;
    ctx.lineCap = 'round';
    for (const [w, c] of [[11, INK], [6, flash || '#7a3b1e']]) {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(hp2[0] - facing * r * 0.55, hp2[1], r, facing > 0 ? -0.95 : Math.PI - 0.95 + 0.0, facing > 0 ? 0.95 : Math.PI + 0.95);
      ctx.stroke();
    }
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 1.5;
    const sx = hp2[0] - facing * r * 0.55 + facing * Math.cos(0.95) * r;
    ctx.beginPath();
    ctx.moveTo(sx, hp2[1] - Math.sin(0.95) * r);
    ctx.lineTo(sx, hp2[1] + Math.sin(0.95) * r);
    ctx.stroke();
  }

  // ライの棒：前腕の向きに沿って、手から前後に伸ばす
  if (ch.id === 'rai') {
    const a = sk.armF.b;
    const c = sk.armF.c;
    const len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
    const ux = (c.x - a.x) / len;
    const uy = (c.y - a.y) / len;
    const front = { x: c.x + ux * 100 * k, y: c.y + uy * 100 * k };
    const back = { x: c.x - ux * 70 * k, y: c.y - uy * 70 * k };
    stroke(back, front, 15, INK);
    stroke(back, front, 8, flash || '#a8783e');
    stroke({ x: front.x - ux * 14, y: front.y - uy * 14 }, front, 8, flash || pal.trim);
    ctx.fillStyle = flash || pal.trim;
    ctx.beginPath();
    ctx.arc(...P(c), 10 * k, 0, Math.PI * 2);
    ctx.fill();
  }
}
