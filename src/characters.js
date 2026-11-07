// キャラと技のデータ。数値はすべてフレーム（1/60秒）単位。
// box は [前方向の中心, 下端の高さ, 幅, 高さ]
// lv: m=中段(立ち/しゃがみ両方でガード可) l=下段(しゃがみガードのみ) h=上段(立ちガードのみ)

const hitbox = (startup, active, box, data) => ({ from: startup + 1, to: startup + active, box, ...data });

function normals({ sp = 0, r = 1, d = 1 }) {
  const R = (v) => Math.round(v * r);
  const D = (v) => Math.round(v * d);
  const S = (v) => Math.max(3, v + sp);
  const box = (x, y, w, h) => [R(x), y, R(w), h];
  const n = (id, name, rank, su, ac, rc, bx, data, wind, act, extra = {}) => ({
    id, name, rank,
    total: S(su) + ac + rc,
    boxes: [hitbox(S(su), ac, bx, { ...data, dmg: D(data.dmg) })],
    anim: [[0, wind], [Math.max(1, S(su) - 1), act], [S(su) + ac + 2, extra.back || wind]],
    ...extra,
  });
  return {
    sL: n('sL', '立ち弱', 1, 5, 3, 9, box(66, 108, 76, 30), { dmg: 30, stun: 15, block: 10, kb: 3, lv: 'm', hs: 5, fx: 'l' }, 'jabW', 'jab', { back: 'idle' }),
    sM: n('sM', '立ち中', 2, 8, 3, 14, box(84, 84, 100, 44), { dmg: 55, stun: 20, block: 14, kb: 4.5, lv: 'm', hs: 8, fx: 'm' }, 'kickW', 'kickM', { back: 'idle' }),
    sH: n('sH', '立ち強', 3, 12, 4, 20, box(96, 104, 122, 56), { dmg: 90, stun: 26, block: 17, kb: 9, lv: 'm', hs: 11, fx: 'h' }, 'heavyW', 'heavy', { back: 'idle', motion: [{ from: S(12) - 3, to: S(12), vx: 6 }] }),
    cL: n('cL', 'しゃがみ弱', 1, 5, 3, 9, box(60, 18, 78, 32), { dmg: 25, stun: 14, block: 9, kb: 4, lv: 'l', hs: 5, fx: 'l' }, 'crouch', 'cjab', { crouch: true, back: 'crouch' }),
    cM: n('cM', 'しゃがみ中', 2, 8, 3, 14, box(86, 6, 110, 32), { dmg: 50, stun: 19, block: 13, kb: 6, lv: 'l', hs: 8, fx: 'm' }, 'crouch', 'sweep', { crouch: true, back: 'crouch' }),
    cH: n('cH', '打ち上げ', 3, 11, 4, 24, box(64, 70, 100, 130), { dmg: 70, stun: 44, block: 16, kb: 1.5, lv: 'm', launch: 21, hs: 9, fx: 'h' }, 'crouch', 'upper', { crouch: true, jc: true, back: 'crouch', motion: [{ from: S(11) - 5, to: S(11), vx: 6 }] }),
    jL: n('jL', '空中弱', 1, 4, 6, 8, box(50, -10, 72, 56), { dmg: 30, stun: 15, block: 9, kb: 3, lv: 'h', hs: 5, fx: 'l' }, 'jump', 'aKick', { air: true, back: 'jump' }),
    jM: n('jM', '空中中', 2, 7, 6, 10, box(66, 10, 90, 64), { dmg: 50, stun: 18, block: 12, kb: 4, lv: 'h', hs: 8, fx: 'm' }, 'jump', 'aPunch', { air: true, back: 'jump' }),
    jH: n('jH', '叩き落とし', 3, 9, 6, 14, box(58, -24, 104, 84), { dmg: 80, stun: 22, block: 15, kb: 3, lv: 'h', launch: -15, bounce: true, hs: 11, fx: 'h' }, 'aWind', 'aSpike', { air: true, back: 'jump' }),
    throw: {
      id: 'throw', name: '投げ', rank: 0, total: 28,
      boxes: [hitbox(3, 2, [48, 60, 64, 110], { throw: true, dmg: 130, launch: 11, kb: 7, kd: true, hs: 8, fx: 'h' })],
      anim: [[0, 'grabW'], [3, 'grab']],
      holdF: 18, holdT: 32,
    },
  };
}

const kagariMoves = {
  ...normals({}),
  spN: {
    id: 'spN', name: '火輪', rank: 4, total: 42, oneProj: true, boxes: [],
    anim: [[0, 'castW'], [11, 'cast']],
    spawn: [{ f: 13, x: 60, y: 92, vx: 11.5, w: 62, h: 52, life: 90, kind: 'fire', dmg: 70, stun: 22, block: 15, kb: 6, lv: 'm', hs: 7, fx: 'm', chip: 6 }],
  },
  spD: {
    id: 'spD', name: '昇炎脚', rank: 4, total: 40, helpless: true, inv: [1, 7],
    boxes: [hitbox(4, 9, [42, 40, 88, 170], { dmg: 110, stun: 42, block: 22, kb: 2, lv: 'm', launch: 19, kd: true, hs: 10, fx: 'h' })],
    motion: [{ from: 4, to: 16, vy: 17, vx: 2.4 }],
    anim: [[0, 'crouch'], [3, 'rising']],
  },
  spF: {
    id: 'spF', name: '烈破蹴', rank: 4, total: 40,
    boxes: [
      hitbox(9, 4, [66, 56, 96, 74], { dmg: 50, stun: 30, block: 12, kb: 1, lv: 'm', hs: 7, fx: 'm' }),
      hitbox(18, 5, [78, 70, 112, 84], { dmg: 75, stun: 30, block: 18, kb: 9, lv: 'm', launch: 12, kd: true, wall: true, hs: 11, fx: 'h', chip: 6 }),
    ],
    motion: [{ from: 6, to: 20, vx: 12 }],
    anim: [[0, 'dashF'], [8, 'kickM'], [17, 'heavy'], [26, 'idle']],
  },
  super: {
    id: 'super', name: '紅蓮十連', rank: 5, super: true, total: 78, inv: [1, 14],
    boxes: [16, 21, 26, 31, 36, 41, 47].map((f, i, all) => hitbox(f, 3, [70, 40, 130, 130], i === all.length - 1
      ? { dmg: 110, stun: 50, block: 8, kb: 10, lv: 'm', launch: 22, kd: true, wall: true, hs: 16, fx: 's', superFix: true, chip: 12 }
      : { dmg: 42, stun: 34, block: 8, kb: 0.8, lv: 'm', hs: 3, fx: 'm', superFix: true, chip: 4 })),
    motion: [{ from: 8, to: 22, vx: 17 }, { from: 23, to: 46, vx: 2 }],
    anim: [[0, 'castW'], [12, 'dashF'], [16, 'jab'], [21, 'kickM'], [26, 'heavy'], [31, 'jab'], [36, 'kickM'], [41, 'heavy'], [47, 'upper'], [64, 'idle']],
  },
};

const goutetsuMoves = {
  ...normals({ sp: 2, r: 1.16, d: 1.3 }),
  spN: {
    id: 'spN', name: '鉄塊突', rank: 4, total: 52, armor: [3, 18],
    boxes: [hitbox(17, 6, [96, 70, 128, 84], { dmg: 120, stun: 28, block: 20, kb: 8, lv: 'm', launch: 11, kd: true, wall: true, hs: 13, fx: 'h', chip: 8 })],
    motion: [{ from: 12, to: 23, vx: 9.5 }],
    anim: [[0, 'heavyW'], [16, 'heavy'], [34, 'idle']],
  },
  spD: {
    id: 'spD', name: '地裂衝', rank: 4, total: 50, oneProj: true,
    boxes: [hitbox(18, 4, [70, 0, 110, 70], { dmg: 60, stun: 24, block: 16, kb: 5, lv: 'm', hs: 9, fx: 'h' })],
    anim: [[0, 'aWind'], [17, 'slam'], [36, 'crouch']],
    spawn: [{ f: 20, x: 90, y: 0, vx: 9, w: 74, h: 54, life: 70, kind: 'quake', dmg: 85, stun: 26, block: 15, kb: 3, lv: 'l', launch: 12, kd: true, hs: 8, fx: 'h', chip: 6 }],
  },
  spF: {
    id: 'spF', name: '掴砕', rank: 4, total: 48,
    boxes: [hitbox(6, 3, [58, 40, 86, 130], { throw: true, noTech: true, dmg: 190, launch: 14, kb: 8, kd: true, hs: 12, fx: 's' })],
    anim: [[0, 'grabW'], [6, 'grab']],
    holdF: 22, holdT: 38,
  },
  super: {
    id: 'super', name: '大破砕', rank: 5, super: true, total: 62, inv: [1, 16],
    boxes: [hitbox(12, 14, [80, 30, 118, 150], { throw: true, noTech: true, dmg: 420, launch: 22, kb: 6, kd: true, hs: 20, fx: 's' })],
    motion: [{ from: 8, to: 26, vx: 19 }],
    anim: [[0, 'castW'], [10, 'dashF'], [14, 'grab']],
    holdF: 44, holdT: 62,
  },
};

const shizukuMoves = {
  ...normals({ sp: -1, r: 0.96, d: 0.78 }),
  spN: {
    id: 'spN', name: '水刃', rank: 4, total: 32, oneProj: true, boxes: [],
    anim: [[0, 'castW'], [7, 'cast']],
    spawn: [{ f: 8, x: 56, y: 88, vx: 14, w: 48, h: 62, life: 34, kind: 'water', dmg: 45, stun: 20, block: 12, kb: 4, lv: 'm', hs: 6, fx: 'm', chip: 4 }],
  },
  spD: {
    id: 'spD', name: '浮舟', rank: 4, total: 32, jc: true,
    boxes: [hitbox(5, 5, [52, 10, 84, 130], { dmg: 65, stun: 40, block: 14, kb: 1.5, lv: 'm', launch: 19, hs: 8, fx: 'm' })],
    anim: [[0, 'crouch'], [4, 'rising'], [14, 'crouch']],
  },
  spF: {
    id: 'spF', name: '瞬歩', rank: 4, total: 20, noPush: true, inv: [1, 13], freeFrom: 13, boxes: [],
    motion: [{ from: 1, to: 12, vx: 20 }],
    anim: [[0, 'dashF']],
  },
  super: {
    id: 'super', name: '千雨', rank: 5, super: true, total: 76, inv: [1, 20], boxes: [],
    anim: [[0, 'castW'], [10, 'cast'], [60, 'idle']],
    spawn: [12, 18, 24, 30, 36, 42, 48, 54].map((f, i, all) => ({
      f, atOpp: true, x: 0, y: 560, vx: 0, vy: -26, w: 66, h: 84, life: 40, kind: 'rain', lv: 'h', hs: i === all.length - 1 ? 14 : 4, fx: i === all.length - 1 ? 's' : 'm', superFix: true, chip: 3,
      ...(i === all.length - 1
        ? { dmg: 90, stun: 40, block: 10, kb: 8, launch: 18, kd: true }
        : { dmg: 36, stun: 30, block: 10, kb: 0.5 }),
    })),
  },
};

export const CHARS = {
  kagari: {
    id: 'kagari', name: 'カガリ', kana: '火', title: '火の拳士', style: '飛び道具と昇炎で攻守が揃う基本形',
    hp: 1000, w: 62, h: 186, walk: 6, back: 4.6, jump: 19, jumpVx: 6.5, dash: 15, dashF: 14,
    build: 1, stats: { 攻撃: 3, 速度: 3, 体力: 3 }, stage: 'sunset',
    palettes: [
      { gi: '#d9391f', dark: '#8f1d10', trim: '#f6c445', skin: '#e9b48a', hair: '#1a1420' },
      { gi: '#2e4fa8', dark: '#182b66', trim: '#f2ede0', skin: '#e9b48a', hair: '#1a1420' },
    ],
    moves: kagariMoves,
  },
  goutetsu: {
    id: 'goutetsu', name: 'ゴウテツ', kana: '鉄', title: '鉄腕の組み手', style: '遅いが一撃が重い。掴みと耐久で押し切る',
    hp: 1150, w: 78, h: 196, walk: 4.4, back: 3.4, jump: 17.5, jumpVx: 5.2, dash: 12, dashF: 16,
    build: 1.38, stats: { 攻撃: 5, 速度: 1, 体力: 5 }, stage: 'foundry',
    palettes: [
      { gi: '#3f5a5c', dark: '#223536', trim: '#e7a321', skin: '#c98d62', hair: '#2a2320' },
      { gi: '#7a3b78', dark: '#452044', trim: '#b9e0d2', skin: '#c98d62', hair: '#2a2320' },
    ],
    moves: goutetsuMoves,
  },
  shizuku: {
    id: 'shizuku', name: 'シズク', kana: '雫', title: '水の舞手', style: '火力は低いが速い。二段跳びと瞬歩で崩す',
    hp: 900, w: 54, h: 178, walk: 7.2, back: 5.6, jump: 19.5, jumpVx: 7.6, dash: 18, dashF: 12,
    build: 0.82, airJumps: 1, lChain: 3, stats: { 攻撃: 2, 速度: 5, 体力: 2 }, stage: 'rain',
    palettes: [
      { gi: '#10a39a', dark: '#086660', trim: '#f4f0df', skin: '#f0c9a4', hair: '#20285e' },
      { gi: '#e4679a', dark: '#973a60', trim: '#fff0c2', skin: '#f0c9a4', hair: '#3a1a33' },
    ],
    moves: shizukuMoves,
  },
};

export const CHAR_IDS = Object.keys(CHARS);

// 技表（ポーズ画面と選択画面で使う）
export const SPECIAL_COMMANDS = [
  ['spN', '必殺', '↓↘→＋攻撃'],
  ['spD', '↓＋必殺', '→↓↘＋攻撃'],
  ['spF', '→＋必殺', '↓↙←＋攻撃'],
  ['super', '超（ゲージ1本）', ''],
];
