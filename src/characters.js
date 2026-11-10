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
      f, atOpp: true, x: 0, y: 560, vx: 0, vy: -26, w: 66, h: 84, life: 40, kind: 'rain', noClash: true, lv: 'h', hs: i === all.length - 1 ? 14 : 4, fx: i === all.length - 1 ? 's' : 'm', superFix: true, chip: 3,
      ...(i === all.length - 1
        ? { dmg: 90, stun: 40, block: 10, kb: 8, launch: 18, kd: true }
        : { dmg: 36, stun: 30, block: 10, kb: 0.5 }),
    })),
  },
};

// ライ：長い棒で間合いを制する。雷を落とす
const raiMoves = {
  ...normals({ sp: 1, r: 1.3, d: 1.02 }),
  spN: {
    id: 'spN', name: '雷突', rank: 4, total: 46,
    boxes: [hitbox(14, 4, [150, 84, 170, 40], { dmg: 95, stun: 26, block: 18, kb: 10, lv: 'm', launch: 10, kd: true, wall: true, hs: 12, fx: 'h', chip: 8 })],
    motion: [{ from: 9, to: 16, vx: 10 }],
    anim: [[0, 'heavyW'], [13, 'heavy'], [30, 'idle']],
  },
  spD: {
    id: 'spD', name: '雷柱', rank: 4, total: 40, oneProj: true, boxes: [],
    anim: [[0, 'castW'], [8, 'win'], [30, 'idle']],
    spawn: [{ f: 10, x: 160, y: 320, vx: 0, vy: -46, w: 120, h: 130, life: 16, kind: 'bolt', noClash: true, dmg: 80, stun: 34, block: 14, kb: 4, lv: 'm', hs: 10, fx: 'h', chip: 6 }],
  },
  spF: {
    id: 'spF', name: '旋棍', rank: 4, total: 42, inv: [1, 8],
    boxes: [
      hitbox(5, 4, [50, 110, 150, 150], { dmg: 60, stun: 30, block: 14, kb: 2, lv: 'm', launch: 16, hs: 9, fx: 'm' }),
      hitbox(11, 4, [40, 140, 150, 140], { dmg: 60, stun: 40, block: 14, kb: 4, lv: 'm', launch: 20, kd: true, hs: 11, fx: 'h' }),
    ],
    anim: [[0, 'crouch'], [4, 'upper'], [11, 'win'], [26, 'idle']],
  },
  super: {
    id: 'super', name: '天雷', rank: 5, super: true, total: 64, inv: [1, 12], boxes: [],
    anim: [[0, 'castW'], [10, 'win'], [52, 'idle']],
    spawn: [14, 20, 26, 32, 40].map((f, i, all) => ({
      f, atOpp: true, x: 0, y: 520, vx: 0, vy: -44, w: 100, h: 150, life: 14, kind: 'bolt', noClash: true, lv: 'm', superFix: true, chip: 4,
      ...(i === all.length - 1
        ? { dmg: 120, stun: 40, block: 10, kb: 8, launch: 20, kd: true, hs: 16, fx: 's' }
        : { dmg: 45, stun: 34, block: 10, kb: 0.5, hs: 5, fx: 'm' }),
    })),
  },
};

// ハヤテ：高く跳び、空から急降下。相手の背後へ回り込む
const hayateMoves = {
  ...normals({ sp: -1, r: 0.95, d: 0.86 }),
  spN: {
    id: 'spN', name: '手裏剣', rank: 4, total: 30, oneProj: true, boxes: [],
    anim: [[0, 'castW'], [7, 'cast']],
    spawn: [{ f: 8, x: 50, y: 112, vx: 17, w: 34, h: 34, life: 60, kind: 'star', dmg: 40, stun: 18, block: 10, kb: 3, lv: 'm', hs: 5, fx: 'l', chip: 3 }],
  },
  spD: {
    id: 'spD', name: '旋風脚', rank: 4, total: 34, inv: [1, 5],
    boxes: [hitbox(4, 10, [40, 50, 90, 150], { dmg: 75, stun: 40, block: 16, kb: 2, lv: 'm', launch: 18, hs: 9, fx: 'm' })],
    motion: [{ from: 4, to: 12, vy: 16, vx: 3 }],
    anim: [[0, 'crouch'], [3, 'rising'], [16, 'jump']],
  },
  jS: {
    id: 'jS', name: '疾風落', rank: 3, air: true, total: 40, landT: 14,
    boxes: [hitbox(5, 35, [36, -30, 80, 70], { dmg: 70, stun: 22, block: 12, kb: 5, lv: 'h', hs: 9, fx: 'h' })],
    motion: [{ from: 3, to: 40, vx: 13, vy: -13, untilHit: true }],
    anim: [[0, 'aWind'], [4, 'dive']],
  },
  spF: {
    id: 'spF', name: '影走り', rank: 4, total: 36, inv: [1, 12], noPush: true, warp: { f: 10, dist: 72 },
    boxes: [hitbox(13, 4, [56, 60, 90, 110], { dmg: 65, stun: 24, block: 14, kb: 5, lv: 'm', hs: 8, fx: 'm' })],
    anim: [[0, 'dashF'], [10, 'castW'], [13, 'heavy'], [24, 'idle']],
  },
  super: {
    id: 'super', name: '疾風乱舞', rank: 5, super: true, total: 72, inv: [1, 16],
    boxes: [14, 18, 22, 26, 30, 34, 38, 42, 48].map((f, i, all) => hitbox(f, 3, [70, 40, 130, 140], i === all.length - 1
      ? { dmg: 100, stun: 50, block: 8, kb: 9, lv: 'm', launch: 22, kd: true, hs: 16, fx: 's', superFix: true, chip: 12 }
      : { dmg: 30, stun: 34, block: 8, kb: 0.6, lv: 'm', hs: 3, fx: i % 2 ? 'm' : 'l', superFix: true, chip: 3 })),
    motion: [{ from: 8, to: 20, vx: 18 }, { from: 21, to: 46, vx: 1.5 }],
    anim: [[0, 'castW'], [10, 'dashF'], [14, 'jab'], [18, 'aKick'], [22, 'heavy'], [26, 'kickM'], [30, 'jab'], [34, 'aKick'], [38, 'heavy'], [42, 'kickM'], [48, 'rising'], [60, 'idle']],
  },
};

// カゲ：構えて受け流す。足元を這う影
const kageMoves = {
  ...normals({ sp: 0, r: 1.04, d: 0.98 }),
  spN: {
    id: 'spN', name: '影返し', rank: 4, total: 44, parry: [3, 24], counter: 'cnt', boxes: [],
    anim: [[0, 'parry'], [25, 'idle']],
  },
  // 影返しが成功した時だけ出る反撃（コマンドはない）
  cnt: {
    id: 'cnt', name: '影返し・斬', rank: 4, total: 34, inv: [1, 14],
    boxes: [hitbox(6, 4, [70, 50, 120, 140], { dmg: 120, stun: 40, block: 18, kb: 6, lv: 'm', launch: 17, kd: true, hs: 14, fx: 'h' })],
    motion: [{ from: 1, to: 7, vx: 12 }],
    anim: [[0, 'castW'], [5, 'heavy'], [18, 'idle']],
  },
  spD: {
    id: 'spD', name: '影縫い', rank: 4, total: 36, oneProj: true, crouch: true, boxes: [],
    anim: [[0, 'crouch'], [10, 'sweep'], [26, 'crouch']],
    spawn: [{ f: 12, x: 60, y: 0, vx: 10, w: 80, h: 30, life: 70, kind: 'shadow', dmg: 55, stun: 30, block: 12, kb: 2, lv: 'l', hs: 7, fx: 'm', chip: 4 }],
  },
  spF: {
    id: 'spF', name: '影討ち', rank: 4, total: 40, crouch: true,
    boxes: [hitbox(8, 9, [70, 4, 110, 40], { dmg: 80, stun: 30, block: 16, kb: 6, lv: 'l', launch: 10, kd: true, hs: 10, fx: 'h', chip: 5 })],
    motion: [{ from: 4, to: 16, vx: 12 }],
    anim: [[0, 'crouch'], [5, 'slide'], [24, 'crouch']],
  },
  super: {
    id: 'super', name: '朧月', rank: 5, super: true, total: 70, inv: [1, 30], noPush: true,
    boxes: [
      ...[13, 16, 19, 22].map((f) => hitbox(f, 2, [0, 20, 220, 170], { dmg: 45, stun: 40, block: 8, kb: 0.5, lv: 'm', hs: 4, fx: 'm', superFix: true, chip: 4 })),
      hitbox(34, 4, [-70, 30, 170, 170], { dmg: 140, stun: 50, block: 10, kb: -8, lv: 'm', launch: 22, kd: true, hs: 18, fx: 's', superFix: true, chip: 12 }),
    ],
    motion: [{ from: 10, to: 22, vx: 22 }, { from: 23, to: 40, vx: 0 }],
    anim: [[0, 'castW'], [10, 'dashF'], [24, 'parry'], [33, 'upper'], [50, 'idle']],
  },
};

// コガラシ：氷の罠を置いて動きを封じる
const kogarashiMoves = {
  ...normals({ sp: 1, r: 1.05, d: 1.04 }),
  spN: {
    id: 'spN', name: '氷柱', rank: 4, total: 40, oneProj: true, boxes: [],
    anim: [[0, 'castW'], [11, 'cast']],
    spawn: [{ f: 12, x: 60, y: 96, vx: 8, w: 60, h: 40, life: 120, kind: 'ice', dmg: 65, stun: 22, block: 14, kb: 5, lv: 'm', hs: 8, fx: 'm', chip: 5 }],
  },
  spD: {
    id: 'spD', name: '霜置き', rank: 4, total: 32, boxes: [],
    anim: [[0, 'crouch'], [8, 'slam'], [22, 'crouch']],
    spawn: [{ f: 10, x: 170, y: 0, vx: 0, w: 76, h: 28, life: 330, arm: 24, max: 2, kind: 'trap', noClash: true, freeze: true, dmg: 40, stun: 56, block: 12, kb: 0, lv: 'l', hs: 10, fx: 'h' }],
  },
  spF: {
    id: 'spF', name: '氷滑り', rank: 4, total: 42, crouch: true,
    boxes: [hitbox(9, 10, [74, 4, 120, 40], { dmg: 70, stun: 30, block: 16, kb: 6, lv: 'l', hs: 9, fx: 'm', chip: 5 })],
    motion: [{ from: 5, to: 18, vx: 12 }],
    anim: [[0, 'crouch'], [6, 'slide'], [26, 'crouch']],
  },
  super: {
    id: 'super', name: '氷牢', rank: 5, super: true, total: 60, inv: [1, 14], boxes: [],
    anim: [[0, 'castW'], [12, 'slam'], [44, 'idle']],
    spawn: [{ f: 14, atOpp: true, x: 0, y: 0, vx: 0, w: 120, h: 230, life: 14, arm: 4, kind: 'prison', noClash: true, freeze: true, dmg: 230, stun: 80, block: 10, kb: 0, lv: 'm', hs: 16, fx: 's', superFix: true, chip: 12 }],
  },
};

// ツヅミ：必殺ボタンを押し続けて溜め、音の衝撃波を放つ
const tsuzumiMoves = {
  ...normals({ sp: 0, r: 1, d: 0.95 }),
  spN: {
    id: 'spN', name: '響撃', hint: '押し続けて溜める', rank: 4, total: 44, oneProj: true, boxes: [], charge: { at: 8, max: 70 },
    anim: [[0, 'castW'], [11, 'cast']],
    spawn: [{ f: 12, x: 60, y: 60, vx: 9, w: 56, h: 90, life: 80, kind: 'sound', charged: true, dmg: 50, stun: 22, block: 12, kb: 5, lv: 'm', hs: 7, fx: 'm', chip: 4 }],
  },
  spD: {
    id: 'spD', name: '大鳴動', rank: 4, total: 46, inv: [1, 6],
    boxes: [hitbox(10, 5, [0, 0, 240, 170], { dmg: 80, stun: 36, block: 16, kb: 7, lv: 'm', launch: 15, kd: true, hs: 11, fx: 'h' })],
    anim: [[0, 'aWind'], [9, 'slam'], [30, 'crouch']],
  },
  spF: {
    id: 'spF', name: '乱れ打ち', rank: 4, total: 42,
    boxes: [6, 10, 14].map((f) => hitbox(f, 2, [72, 60, 100, 100], { dmg: 22, stun: 26, block: 8, kb: 1, lv: 'm', hs: 4, fx: 'l' }))
      .concat([hitbox(19, 3, [80, 60, 110, 110], { dmg: 45, stun: 30, block: 14, kb: 7, lv: 'm', launch: 12, kd: true, hs: 10, fx: 'h', chip: 4 })]),
    motion: [{ from: 3, to: 18, vx: 7 }],
    anim: [[0, 'jabW'], [6, 'jab'], [9, 'heavy'], [13, 'jab'], [18, 'heavy'], [30, 'idle']],
  },
  super: {
    id: 'super', name: '大太鼓', rank: 5, super: true, total: 60, inv: [1, 16], boxes: [],
    anim: [[0, 'aWind'], [14, 'slam'], [44, 'idle']],
    spawn: [{ f: 16, x: 60, y: 0, vx: 13, w: 130, h: 260, life: 70, kind: 'sound', noClash: true, dmg: 230, stun: 60, block: 10, kb: 9, lv: 'm', launch: 18, kd: true, hs: 18, fx: 's', superFix: true, chip: 14, level: 1 }],
  },
};

// オニ：遅くて重い。体力が減るほど攻撃が強くなる（rage）
const oniMoves = {
  ...normals({ sp: 2, r: 1.15, d: 1.2 }),
  spN: {
    id: 'spN', name: '金棒落とし', rank: 4, total: 52, armor: [4, 16],
    boxes: [hitbox(18, 5, [100, 0, 150, 170], { dmg: 130, stun: 30, block: 22, kb: 8, lv: 'm', launch: 12, kd: true, hs: 14, fx: 'h', chip: 10 })],
    anim: [[0, 'aWind'], [17, 'slam'], [36, 'idle']],
  },
  spD: {
    id: 'spD', name: '鬼頭突き', rank: 4, total: 44, inv: [1, 8],
    boxes: [hitbox(6, 6, [40, 90, 120, 150], { dmg: 100, stun: 40, block: 16, kb: 3, lv: 'm', launch: 18, kd: true, hs: 12, fx: 'h' })],
    anim: [[0, 'crouch'], [5, 'upper'], [24, 'idle']],
  },
  spF: {
    id: 'spF', name: '鬼突進', rank: 4, total: 50, armor: [3, 20],
    boxes: [hitbox(8, 14, [60, 40, 90, 150], { dmg: 110, stun: 30, block: 18, kb: 9, lv: 'm', launch: 10, kd: true, wall: true, hs: 13, fx: 'h', chip: 8 })],
    motion: [{ from: 6, to: 22, vx: 11 }],
    anim: [[0, 'heavyW'], [6, 'dashF'], [24, 'idle']],
  },
  super: {
    id: 'super', name: '鬼神乱舞', rank: 5, super: true, total: 72, inv: [1, 14],
    boxes: [
      hitbox(14, 4, [80, 40, 140, 150], { dmg: 70, stun: 50, block: 8, kb: 1, lv: 'm', hs: 10, fx: 'h', superFix: true, chip: 6 }),
      hitbox(26, 4, [80, 40, 140, 150], { dmg: 70, stun: 50, block: 8, kb: 1, lv: 'm', hs: 10, fx: 'h', superFix: true, chip: 6 }),
      hitbox(38, 5, [90, 0, 160, 180], { dmg: 160, stun: 60, block: 10, kb: 10, lv: 'm', launch: 20, kd: true, wall: true, hs: 20, fx: 's', superFix: true, chip: 14 }),
    ],
    motion: [{ from: 8, to: 16, vx: 15 }, { from: 22, to: 26, vx: 4 }],
    anim: [[0, 'castW'], [8, 'dashF'], [13, 'heavy'], [20, 'heavyW'], [25, 'heavy'], [32, 'aWind'], [37, 'slam'], [56, 'idle']],
  },
};

// クサリ：鎖鎌で遠くの相手を引き寄せる（pull）
const kusariMoves = {
  ...normals({ sp: 0, r: 1.08, d: 0.95 }),
  spN: {
    id: 'spN', name: '鎖投げ', rank: 4, total: 42, chain: true,
    boxes: [hitbox(12, 5, [230, 90, 210, 36], { dmg: 50, stun: 40, block: 12, kb: 0, lv: 'm', pull: true, hs: 9, fx: 'm', chip: 3 })],
    anim: [[0, 'castW'], [11, 'jab'], [30, 'idle']],
  },
  spD: {
    id: 'spD', name: '回転鎌', rank: 4, total: 38, inv: [1, 6], chain: true,
    boxes: [hitbox(6, 12, [0, 110, 220, 120], { dmg: 75, stun: 36, block: 14, kb: 3, lv: 'm', launch: 16, hs: 9, fx: 'm' })],
    anim: [[0, 'crouch'], [5, 'win'], [20, 'idle']],
  },
  spF: {
    id: 'spF', name: '鎖払い', rank: 4, total: 44, crouch: true, chain: true,
    boxes: [hitbox(12, 5, [200, 4, 220, 34], { dmg: 55, stun: 36, block: 12, kb: 0, lv: 'l', pull: true, hs: 9, fx: 'm', chip: 3 })],
    anim: [[0, 'crouch'], [11, 'sweep'], [28, 'crouch']],
  },
  super: {
    id: 'super', name: '鎖縛り', rank: 5, super: true, total: 74, inv: [1, 12], chain: true,
    boxes: [
      hitbox(14, 5, [250, 50, 280, 130], { dmg: 40, stun: 60, block: 8, kb: 0, lv: 'm', pull: true, hs: 8, fx: 'm', superFix: true, chip: 3 }),
      ...[38, 44].map((f) => hitbox(f, 3, [70, 40, 130, 150], { dmg: 50, stun: 40, block: 8, kb: 1, lv: 'm', hs: 6, fx: 'm', superFix: true, chip: 4 })),
      hitbox(52, 4, [80, 40, 140, 160], { dmg: 140, stun: 50, block: 10, kb: 9, lv: 'm', launch: 20, kd: true, wall: true, hs: 18, fx: 's', superFix: true, chip: 12 }),
    ],
    anim: [[0, 'castW'], [13, 'jab'], [36, 'heavyW'], [38, 'heavy'], [44, 'kickM'], [51, 'upper'], [64, 'idle']],
  },
};

// ユミ：弓で遠くから。斜め上に撃つ矢と、後ろへ跳びながら撃つ矢
const yumiMoves = {
  ...normals({ sp: 0, r: 0.95, d: 0.85 }),
  spN: {
    id: 'spN', name: '一の矢', rank: 4, total: 34, oneProj: true, boxes: [],
    anim: [[0, 'castW'], [9, 'cast']],
    spawn: [{ f: 10, x: 60, y: 120, vx: 20, w: 60, h: 14, life: 70, kind: 'arrow', dmg: 55, stun: 22, block: 12, kb: 5, lv: 'm', hs: 7, fx: 'm', chip: 4 }],
  },
  spD: {
    id: 'spD', name: '天の矢', rank: 4, total: 32, oneProj: true, boxes: [],
    anim: [[0, 'castW'], [7, 'upper']],
    spawn: [{ f: 8, x: 40, y: 150, vx: 9, vy: 11, w: 40, h: 40, life: 45, kind: 'arrow', dmg: 60, stun: 30, block: 12, kb: 3, lv: 'm', launch: 14, hs: 8, fx: 'm', chip: 4 }],
  },
  spF: {
    id: 'spF', name: '退き撃ち', rank: 4, total: 40, boxes: [],
    motion: [{ from: 2, to: 10, vx: -12, vy: 6 }],
    anim: [[0, 'dashB'], [10, 'castW'], [13, 'cast']],
    spawn: [{ f: 14, x: 50, y: 110, vx: 20, w: 60, h: 14, life: 70, kind: 'arrow', dmg: 50, stun: 22, block: 12, kb: 5, lv: 'm', hs: 7, fx: 'm', chip: 4 }],
  },
  super: {
    id: 'super', name: '破魔の大矢', rank: 5, super: true, total: 56, inv: [1, 14], boxes: [],
    anim: [[0, 'castW'], [12, 'cast'], [44, 'idle']],
    spawn: [14, 22, 30].map((f, i, all) => ({
      f, x: 60, y: 100, vx: 26, w: 90, h: 30, life: 60, kind: 'arrow', noClash: true, lv: 'm', superFix: true, big: true, chip: 6,
      ...(i === all.length - 1
        ? { dmg: 130, stun: 50, block: 10, kb: 9, launch: 18, kd: true, hs: 16, fx: 's' }
        : { dmg: 70, stun: 40, block: 10, kb: 1, hs: 8, fx: 'h' }),
    })),
  },
};

// ハミ：毒で体力をじわじわ削る（poison）。毒の相手には強い技もある（poisonBonus）
const hamiMoves = {
  ...normals({ sp: 0, r: 1, d: 0.9 }),
  spN: {
    id: 'spN', name: '毒霧', rank: 4, total: 40, oneProj: true, boxes: [],
    anim: [[0, 'castW'], [11, 'cast']],
    spawn: [{ f: 12, x: 70, y: 60, vx: 4.5, w: 90, h: 110, life: 55, kind: 'mist', dmg: 30, stun: 22, block: 10, kb: 2, lv: 'm', poison: 240, hs: 6, fx: 'l' }],
  },
  spD: {
    id: 'spD', name: '這い牙', rank: 4, total: 38, crouch: true,
    boxes: [hitbox(7, 8, [70, 4, 100, 40], { dmg: 50, stun: 30, block: 14, kb: 5, lv: 'l', poison: 180, poisonBonus: 1.4, hs: 9, fx: 'm', chip: 4 })],
    motion: [{ from: 4, to: 14, vx: 11 }],
    anim: [[0, 'crouch'], [5, 'slide'], [22, 'crouch']],
  },
  spF: {
    id: 'spF', name: '噛みつき', rank: 4, total: 46,
    boxes: [hitbox(6, 3, [56, 40, 84, 130], { throw: true, noTech: true, dmg: 90, poison: 300, poisonBonus: 1.6, launch: 10, kb: 6, kd: true, hs: 12, fx: 'h' })],
    anim: [[0, 'grabW'], [6, 'grab']],
    holdF: 20, holdT: 36,
  },
  super: {
    id: 'super', name: '大蛇', rank: 5, super: true, total: 72, inv: [1, 16],
    boxes: [14, 19, 24, 29, 34].map((f) => hitbox(f, 3, [70, 30, 130, 150], { dmg: 34, stun: 36, block: 8, kb: 0.8, lv: 'm', poisonBonus: 1.3, hs: 4, fx: 'm', superFix: true, chip: 3 }))
      .concat([hitbox(42, 4, [80, 30, 140, 160], { dmg: 110, stun: 50, block: 10, kb: 9, lv: 'm', launch: 20, kd: true, poison: 300, poisonBonus: 1.3, hs: 16, fx: 's', superFix: true, chip: 10 })]),
    motion: [{ from: 8, to: 20, vx: 16 }, { from: 21, to: 42, vx: 1.2 }],
    anim: [[0, 'castW'], [9, 'slide'], [14, 'jab'], [19, 'kickM'], [24, 'jab'], [29, 'heavy'], [34, 'jab'], [41, 'upper'], [58, 'idle']],
  },
};

// マボロシ：分身を置き、本体と分身の両方から幻の刃を飛ばす（makeClone / echo / swapClone）
const maboroshiMoves = {
  ...normals({ sp: 0, r: 1, d: 0.92 }),
  spN: {
    id: 'spN', name: '幻刃', hint: '分身からも出る', rank: 4, total: 38, oneProj: true, boxes: [],
    anim: [[0, 'castW'], [10, 'cast']],
    spawn: [{ f: 11, x: 60, y: 90, vx: 11, w: 54, h: 60, life: 70, kind: 'blade', echo: true, dmg: 50, stun: 24, block: 12, kb: 5, lv: 'm', hs: 7, fx: 'm', chip: 4 }],
  },
  spD: {
    id: 'spD', name: '分身', hint: 'その場に5秒残る', rank: 4, total: 30, makeClone: 10, boxes: [],
    anim: [[0, 'castW'], [9, 'parry'], [22, 'idle']],
  },
  spF: {
    id: 'spF', name: '入れ替わり', hint: '分身がいる時', rank: 4, total: 34, inv: [1, 10], swapClone: 8,
    boxes: [hitbox(11, 4, [64, 50, 100, 120], { dmg: 60, stun: 26, block: 14, kb: 6, lv: 'm', hs: 9, fx: 'm' })],
    anim: [[0, 'castW'], [8, 'dashF'], [11, 'heavy'], [22, 'idle']],
  },
  super: {
    id: 'super', name: '幻影乱舞', rank: 5, super: true, total: 64, inv: [1, 14], boxes: [],
    anim: [[0, 'castW'], [12, 'cast'], [18, 'castW'], [22, 'cast'], [28, 'castW'], [32, 'cast'], [50, 'idle']],
    spawn: [14, 24, 34].map((f, i, all) => ({
      f, x: 60, y: 80, vx: 15, w: 70, h: 80, life: 60, kind: 'blade', echo: true, noClash: true, lv: 'm', superFix: true, chip: 5,
      ...(i === all.length - 1
        ? { dmg: 110, stun: 50, block: 10, kb: 9, launch: 18, kd: true, hs: 16, fx: 's' }
        : { dmg: 55, stun: 44, block: 10, kb: 1, hs: 8, fx: 'h' }),
    })),
  },
};

// ツバサ：空中ダッシュと滑空で空を舞う（airDash / glide）
const tsubasaMoves = {
  ...normals({ sp: -1, r: 0.95, d: 0.88 }),
  spN: {
    id: 'spN', name: '風切り羽', rank: 4, total: 32, oneProj: true, boxes: [],
    anim: [[0, 'castW'], [8, 'cast']],
    spawn: [{ f: 9, x: 50, y: 130, vx: 14, w: 50, h: 22, life: 60, kind: 'feather', dmg: 40, stun: 20, block: 10, kb: 4, lv: 'm', hs: 6, fx: 'l', chip: 3 }],
  },
  spD: {
    id: 'spD', name: '舞い上がり', rank: 4, total: 34, inv: [1, 6],
    boxes: [hitbox(4, 10, [36, 60, 100, 150], { dmg: 70, stun: 40, block: 16, kb: 2, lv: 'm', launch: 19, hs: 9, fx: 'm' })],
    motion: [{ from: 4, to: 12, vy: 17, vx: 2 }],
    anim: [[0, 'crouch'], [3, 'rising'], [16, 'jump']],
  },
  jS: {
    id: 'jS', name: '鷹の爪', rank: 3, air: true, total: 40, landT: 16,
    boxes: [hitbox(5, 35, [30, -30, 80, 80], { dmg: 75, stun: 24, block: 12, kb: 4, lv: 'h', bounce: true, hs: 10, fx: 'h' })],
    motion: [{ from: 3, to: 40, vx: 6, vy: -18, untilHit: true }],
    anim: [[0, 'aWind'], [4, 'dive']],
  },
  spF: {
    id: 'spF', name: '突風脚', rank: 4, total: 40,
    boxes: [hitbox(8, 10, [70, 40, 110, 90], { dmg: 75, stun: 30, block: 16, kb: 8, lv: 'm', launch: 10, kd: true, hs: 10, fx: 'h', chip: 5 })],
    motion: [{ from: 4, to: 16, vx: 14 }],
    anim: [[0, 'dashF'], [7, 'kickM'], [24, 'idle']],
  },
  super: {
    id: 'super', name: '天翔', rank: 5, super: true, total: 70, inv: [1, 18],
    boxes: [10, 15, 20, 25].map((f) => hitbox(f, 3, [50, 40, 120, 170], { dmg: 34, stun: 40, block: 8, kb: 0.5, lv: 'm', launch: 6, hs: 4, fx: 'm', superFix: true, chip: 3 }))
      .concat([hitbox(38, 6, [40, -40, 130, 140], { dmg: 130, stun: 50, block: 10, kb: 8, lv: 'm', launch: 16, kd: true, hs: 18, fx: 's', superFix: true, chip: 12 })]),
    motion: [{ from: 8, to: 26, vy: 9, vx: 3 }, { from: 32, to: 44, vy: -20, vx: 4 }],
    anim: [[0, 'crouch'], [8, 'rising'], [28, 'aWind'], [33, 'dive'], [54, 'idle']],
  },
};

// カブト：盾で守る。ガード中に必殺で反撃（guardCancel → gc）、飛び道具を弾き返す（reflect）
const kabutoMoves = {
  ...normals({ sp: 1, r: 1.05, d: 1.05 }),
  spN: {
    id: 'spN', name: '盾突き', rank: 4, total: 46, armor: [3, 14],
    boxes: [hitbox(14, 5, [84, 50, 100, 140], { dmg: 95, stun: 30, block: 20, kb: 10, lv: 'm', launch: 10, kd: true, wall: true, hs: 13, fx: 'h', chip: 6 })],
    motion: [{ from: 10, to: 16, vx: 8 }],
    anim: [[0, 'heavyW'], [13, 'heavy'], [32, 'idle']],
  },
  spD: {
    id: 'spD', name: '盾弾き', hint: '飛び道具を打ち返す', rank: 4, total: 34, reflect: [3, 20],
    boxes: [hitbox(6, 8, [60, 40, 80, 150], { dmg: 40, stun: 22, block: 12, kb: 6, lv: 'm', hs: 7, fx: 'm' })],
    anim: [[0, 'parry'], [22, 'idle']],
  },
  spF: {
    id: 'spF', name: '盾押し', rank: 4, total: 48, armor: [4, 18],
    boxes: [hitbox(8, 12, [60, 30, 90, 160], { dmg: 80, stun: 28, block: 18, kb: 11, lv: 'm', hs: 11, fx: 'h', chip: 6 })],
    motion: [{ from: 6, to: 20, vx: 9 }],
    anim: [[0, 'heavyW'], [6, 'parry'], [26, 'idle']],
  },
  // ガード中に必殺ボタンで出る反撃（ゲージ50を使う。コマンドはない）
  gc: {
    id: 'gc', name: '返し打ち', rank: 4, total: 30, inv: [1, 12],
    boxes: [hitbox(5, 4, [70, 40, 110, 150], { dmg: 50, stun: 30, block: 12, kb: 12, lv: 'm', launch: 12, kd: true, hs: 12, fx: 'h' })],
    anim: [[0, 'parry'], [4, 'heavy'], [18, 'idle']],
  },
  super: {
    id: 'super', name: '城砦突破', rank: 5, super: true, total: 70, inv: [1, 20],
    boxes: [12, 18, 24].map((f) => hitbox(f, 4, [70, 30, 120, 170], { dmg: 50, stun: 44, block: 8, kb: 1, lv: 'm', hs: 8, fx: 'h', superFix: true, chip: 5 }))
      .concat([hitbox(34, 5, [80, 20, 140, 180], { dmg: 140, stun: 50, block: 10, kb: 11, lv: 'm', launch: 18, kd: true, wall: true, hs: 18, fx: 's', superFix: true, chip: 12 })]),
    motion: [{ from: 8, to: 34, vx: 7 }],
    anim: [[0, 'castW'], [8, 'parry'], [12, 'heavy'], [17, 'parry'], [18, 'heavy'], [24, 'heavy'], [33, 'upper'], [52, 'idle']],
  },
};

// ハゼ：当てた相手に時限爆弾をくっつける（bomb）。投げた爆弾は放物線を描く（grav）
const hazeMoves = {
  ...normals({ sp: 0, r: 1, d: 0.95 }),
  spN: {
    id: 'spN', name: '爆弾投げ', hint: '当たると時限爆弾', rank: 4, total: 40, oneProj: true, boxes: [],
    anim: [[0, 'castW'], [11, 'upper']],
    spawn: [{ f: 12, x: 40, y: 150, vx: 7, vy: 9, grav: 0.55, w: 34, h: 34, life: 90, kind: 'bomb', dmg: 30, stun: 22, block: 10, kb: 3, lv: 'm', bomb: 100, hs: 6, fx: 'l', chip: 2 }],
  },
  spD: {
    id: 'spD', name: '目の前爆破', rank: 4, total: 44,
    boxes: [hitbox(12, 5, [90, 0, 150, 160], { dmg: 95, stun: 34, block: 18, kb: 9, lv: 'm', launch: 14, kd: true, hs: 13, fx: 'h', chip: 8 })],
    anim: [[0, 'crouch'], [11, 'cast'], [28, 'idle']],
  },
  spF: {
    id: 'spF', name: '導火突進', hint: '当たると時限爆弾', rank: 4, total: 42,
    boxes: [hitbox(8, 10, [60, 40, 90, 140], { dmg: 55, stun: 28, block: 14, kb: 5, lv: 'm', bomb: 80, hs: 9, fx: 'm', chip: 4 })],
    motion: [{ from: 4, to: 16, vx: 12 }],
    anim: [[0, 'dashF'], [8, 'heavy'], [24, 'idle']],
  },
  super: {
    id: 'super', name: '大花火', rank: 5, super: true, total: 66, inv: [1, 16],
    boxes: [hitbox(12, 4, [70, 30, 110, 150], { dmg: 40, stun: 60, block: 8, kb: 1, lv: 'm', hs: 8, fx: 'm', superFix: true, chip: 3 }),
      hitbox(30, 6, [60, 0, 260, 260], { dmg: 190, stun: 60, block: 10, kb: 10, lv: 'm', launch: 20, kd: true, hs: 20, fx: 's', superFix: true, chip: 14 })],
    motion: [{ from: 6, to: 12, vx: 12 }],
    anim: [[0, 'castW'], [6, 'dashF'], [12, 'heavy'], [20, 'castW'], [29, 'win'], [48, 'idle']],
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
  rai: {
    id: 'rai', name: 'ライ', kana: '雷', title: '雷の棒術家', style: '長い棒で遠くから突く。近づかれると弱い',
    hp: 1000, w: 60, h: 190, walk: 5.2, back: 4.2, jump: 18.5, jumpVx: 6, dash: 14, dashF: 15,
    build: 1.05, stats: { 攻撃: 4, 速度: 2, 体力: 3 }, stage: 'storm',
    cpu: { antiAir: 'spF', zone: 'spD' },
    palettes: [
      { gi: '#5b3fa0', dark: '#2f1f5c', trim: '#ffd84a', skin: '#e2ab84', hair: '#f4f1e8' },
      { gi: '#c9a227', dark: '#6e5510', trim: '#2b2b6e', skin: '#e2ab84', hair: '#2a2320' },
    ],
    moves: raiMoves,
  },
  hayate: {
    id: 'hayate', name: 'ハヤテ', kana: '風', title: '風の忍び', style: '高く跳んで空から急降下。背後に回り込む',
    hp: 920, w: 56, h: 182, walk: 6.6, back: 5.2, jump: 21, jumpVx: 7.4, dash: 17, dashF: 13,
    build: 0.9, stats: { 攻撃: 3, 速度: 4, 体力: 2 }, stage: 'bamboo',
    cpu: { antiAir: 'spD', zone: 'spN', dive: true },
    palettes: [
      { gi: '#2f6b3a', dark: '#173a1e', trim: '#e8e2c8', skin: '#e6b38c', hair: '#16121c' },
      { gi: '#3b3b44', dark: '#1e1e26', trim: '#d9443a', skin: '#e6b38c', hair: '#16121c' },
    ],
    moves: hayateMoves,
  },
  kage: {
    id: 'kage', name: 'カゲ', kana: '影', title: '影の剣客', style: '構えて受け流し反撃。読み合いが得意',
    hp: 960, w: 58, h: 184, walk: 5.6, back: 4.6, jump: 18.5, jumpVx: 6.4, dash: 16, dashF: 14,
    build: 0.95, stats: { 攻撃: 4, 速度: 3, 体力: 2 }, stage: 'moonroof',
    cpu: { antiAir: 'spN', zone: 'spD', parry: true }, card: '#6b5a9a',
    palettes: [
      { gi: '#4a3d6e', dark: '#241c3a', trim: '#c46bff', skin: '#d9b8a0', hair: '#4a3d6e' },
      { gi: '#e9e3d3', dark: '#8a8070', trim: '#c0272d', skin: '#d9b8a0', hair: '#e9e3d3' },
    ],
    moves: kageMoves,
  },
  kogarashi: {
    id: 'kogarashi', name: 'コガラシ', kana: '氷', title: '氷の罠師', style: '足は遅いが頑丈。氷の罠で動きを封じる',
    hp: 1080, w: 66, h: 190, walk: 4.8, back: 3.8, jump: 17.8, jumpVx: 5.6, dash: 13, dashF: 16,
    build: 1.15, stats: { 攻撃: 3, 速度: 2, 体力: 4 }, stage: 'snow',
    cpu: { antiAir: 'cH', zone: 'spD' },
    palettes: [
      { gi: '#4f86b8', dark: '#264a6e', trim: '#eef6fb', skin: '#efc9aa', hair: '#dfe9f2' },
      { gi: '#8a2f3a', dark: '#4a161e', trim: '#f2e6c8', skin: '#efc9aa', hair: '#3a2a22' },
    ],
    moves: kogarashiMoves,
  },
  tsuzumi: {
    id: 'tsuzumi', name: 'ツヅミ', kana: '鼓', title: '鼓の打ち手', style: '必殺ボタン長押しで溜め、音の衝撃波を放つ',
    hp: 980, w: 60, h: 184, walk: 5.6, back: 4.6, jump: 18.5, jumpVx: 6.2, dash: 15, dashF: 14,
    build: 1, stats: { 攻撃: 3, 速度: 3, 体力: 3 }, stage: 'festival',
    cpu: { antiAir: 'spD', zone: 'spN' },
    palettes: [
      { gi: '#e0457b', dark: '#8a2149', trim: '#ffe36b', skin: '#f0c49c', hair: '#2a1a30' },
      { gi: '#2f9c6e', dark: '#175a3e', trim: '#ffd0e0', skin: '#f0c49c', hair: '#2a1a30' },
    ],
    moves: tsuzumiMoves,
  },
  oni: {
    id: 'oni', name: 'オニ', kana: '鬼', title: '怒れる鬼', style: '遅いが重い。体力が減るほど攻撃が強くなる',
    hp: 1200, w: 80, h: 200, walk: 4.2, back: 3.2, jump: 17, jumpVx: 5, dash: 12, dashF: 17,
    build: 1.42, rage: true, stats: { 攻撃: 4, 速度: 1, 体力: 5 }, stage: 'onirock',
    cpu: { antiAir: 'spD', poke: 'spF' },
    palettes: [
      { gi: '#3a3a3a', dark: '#1c1c1c', trim: '#e0b73a', skin: '#c9473a', hair: '#1a1214' },
      { gi: '#2b3f73', dark: '#162344', trim: '#e0b73a', skin: '#3f7fc4', hair: '#1a1214' },
    ],
    moves: oniMoves,
  },
  kusari: {
    id: 'kusari', name: 'クサリ', kana: '鎖', title: '鎖鎌の使い手', style: '鎖で遠くの相手を引き寄せてコンボ',
    hp: 960, w: 58, h: 184, walk: 5.8, back: 4.8, jump: 18.8, jumpVx: 6.6, dash: 16, dashF: 14,
    build: 0.95, stats: { 攻撃: 2, 速度: 4, 体力: 3 }, stage: 'harbor',
    cpu: { antiAir: 'spD', poke: 'spN' },
    palettes: [
      { gi: '#7a5a3c', dark: '#43301e', trim: '#c9d2da', skin: '#e6b38c', hair: '#1e1a22' },
      { gi: '#2e5a5a', dark: '#163232', trim: '#e8c070', skin: '#e6b38c', hair: '#5a2a1a' },
    ],
    moves: kusariMoves,
  },
  yumi: {
    id: 'yumi', name: 'ユミ', kana: '弓', title: '弓の射手', style: '遠くから矢で攻める。近づかれると弱い',
    hp: 900, w: 54, h: 180, walk: 5.6, back: 5, jump: 18.5, jumpVx: 6.4, dash: 16, dashF: 13,
    build: 0.88, stats: { 攻撃: 3, 速度: 3, 体力: 2 }, stage: 'autumn',
    cpu: { antiAir: 'spD', zone: 'spN' },
    palettes: [
      { gi: '#e8e0cc', dark: '#a39b86', trim: '#c23a2b', skin: '#f2cba6', hair: '#3a2416' },
      { gi: '#3d4a8a', dark: '#1f2650', trim: '#f2d36b', skin: '#f2cba6', hair: '#121018' },
    ],
    moves: yumiMoves,
  },
  hami: {
    id: 'hami', name: 'ハミ', kana: '蛇', title: '毒蛇の使い手', style: '毒で体力をじわじわ削る。毒の相手に強い',
    hp: 940, w: 56, h: 182, walk: 6, back: 5, jump: 18, jumpVx: 6.4, dash: 16, dashF: 13,
    build: 0.92, stats: { 攻撃: 2, 速度: 3, 体力: 3 }, stage: 'swamp',
    cpu: { antiAir: 'spN', zone: 'spN', poke: 'spD' },
    palettes: [
      { gi: '#4f7a2e', dark: '#273f15', trim: '#c8e04a', skin: '#e2c09a', hair: '#1c2a12' },
      { gi: '#5a2a6e', dark: '#2e1338', trim: '#7ee08a', skin: '#e2c09a', hair: '#1a1020' },
    ],
    moves: hamiMoves,
  },
  maboroshi: {
    id: 'maboroshi', name: 'マボロシ', kana: '幻', title: '幻の術師', style: '分身を置き、本体と分身で挟み撃ち',
    hp: 940, w: 56, h: 184, walk: 5.6, back: 4.8, jump: 18.5, jumpVx: 6.4, dash: 16, dashF: 14,
    build: 0.92, stats: { 攻撃: 3, 速度: 3, 体力: 2 }, stage: 'mirror',
    cpu: { antiAir: 'spF', zone: 'spN', setup: 'spD' },
    palettes: [
      { gi: '#d9d2e9', dark: '#8a7fa8', trim: '#7a4ad8', skin: '#f2d6c0', hair: '#2a2240' },
      { gi: '#2a2a3a', dark: '#14141e', trim: '#e04a8a', skin: '#f2d6c0', hair: '#e8e0f0' },
    ],
    moves: maboroshiMoves,
  },
  tsubasa: {
    id: 'tsubasa', name: 'ツバサ', kana: '翼', title: '翼の舞手', style: '空中で同じ方向2回でダッシュ。ジャンプを押し直して押し続けると滑空',
    hp: 900, w: 54, h: 180, walk: 6, back: 5, jump: 20, jumpVx: 6.8, dash: 17, dashF: 13,
    build: 0.86, airDash: 13, glide: 3, stats: { 攻撃: 2, 速度: 5, 体力: 2 }, stage: 'skytower',
    cpu: { antiAir: 'spD', zone: 'spN', dive: true },
    palettes: [
      { gi: '#3a8ad8', dark: '#1c4a7a', trim: '#f4f0e0', skin: '#f0c8a0', hair: '#f0b030' },
      { gi: '#c84a3a', dark: '#6e2018', trim: '#f4f0e0', skin: '#f0c8a0', hair: '#1a1420' },
    ],
    moves: tsubasaMoves,
  },
  kabuto: {
    id: 'kabuto', name: 'カブト', kana: '甲', title: '盾の守り手', style: 'ガード中に必殺で反撃。飛び道具を打ち返す',
    hp: 1100, w: 70, h: 192, walk: 4.8, back: 3.8, jump: 17.5, jumpVx: 5.4, dash: 13, dashF: 16,
    build: 1.18, guardCancel: true, noChip: true, stats: { 攻撃: 3, 速度: 2, 体力: 5 }, stage: 'castle',
    cpu: { antiAir: 'spN', poke: 'spF' },
    palettes: [
      { gi: '#7a6a3a', dark: '#40361a', trim: '#d8c070', skin: '#e2b48c', hair: '#2a2018' },
      { gi: '#3a4a5a', dark: '#1c2530', trim: '#c0c8d0', skin: '#e2b48c', hair: '#2a2018' },
    ],
    moves: kabutoMoves,
  },
  haze: {
    id: 'haze', name: 'ハゼ', kana: '爆', title: '爆弾職人', style: '時限爆弾をくっつけて吹き飛ばす',
    hp: 960, w: 58, h: 184, walk: 5.4, back: 4.6, jump: 18.5, jumpVx: 6.2, dash: 15, dashF: 14,
    build: 0.98, stats: { 攻撃: 4, 速度: 3, 体力: 2 }, stage: 'powder',
    cpu: { antiAir: 'spD', zone: 'spN', poke: 'spF' },
    palettes: [
      { gi: '#d87a2a', dark: '#7a3a10', trim: '#2a2a2a', skin: '#e8b88c', hair: '#c83a2a' },
      { gi: '#4a4a4a', dark: '#222222', trim: '#f0c030', skin: '#e8b88c', hair: '#f0e0c0' },
    ],
    moves: hazeMoves,
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
