// 戦闘エンジン本体。画面や時刻に一切依存せず、同じ入力なら必ず同じ結果になる。
// 状態はすべて素のオブジェクトなので複製・巻き戻しができ、将来のオンライン対戦に使える。
import {
  BTN, ATTACK_MASK, GRAVITY, STAGE_HALF, MAX_SEP, ROUND_FRAMES, WINS_NEEDED, MAX_ROUNDS,
  METER_MAX, SUPER_COST, BUFFER_FRAMES, JUST_WINDOW, STAGGER, EVADE_TOTAL, EVADE_INV, EVADE_SPEED,
} from './config.js';
import { CHARS } from './characters.js';
import { STAGE_INFO } from './stages.js';

const HIST_LEN = 32;
const POISON_TICK = 6; // 毒で1回に減る体力
const GC_COST = 50;    // ガード中の反撃に使うゲージ
const CLONE_LIFE = 300; // 分身が残るコマ数（5秒）
const GLIDE_MAX = 90;   // 1回の滑空の長さ（1.5秒）
// くっつけた時限爆弾が爆発した時の当たり（ガードできない）
const BOMB_HIT = { dmg: 90, stun: 30, kb: 6, lv: 'm', launch: 14, kd: true, hs: 12, fx: 'h' };
const DIR_MASK = BTN.U | BTN.D | BTN.L | BTN.R;
const NEUTRAL = new Set(['idle', 'walk', 'crouch', 'guard']);
const NOT_THROWABLE = new Set(['hit', 'hitair', 'block', 'down', 'getup', 'thrown', 'throwing']);

function newFighter(idx, char, palette) {
  return {
    idx, char, palette,
    x: 0, y: 0, vx: 0, vy: 0, facing: idx === 0 ? 1 : -1,
    hp: CHARS[char].hp, meter: 0,
    st: 'idle', f: 0, move: null, used: [], hit: false, blocked: false, chain: 0,
    stun: 0, hitstop: 0, inv: 0, throwInv: 0, landT: 0, jumps: 0, noAct: false,
    kd: false, bounce: false, wallB: false, crouching: false, jumpDir: 0, dashDir: 0,
    armorUsed: false, thrownBy: -1, frozen: 0, chargeF: 0, poison: 0, clone: null, bombT: 0, bombBy: -1, airDashed: false, glideT: -1,
    comboHits: 0, comboDmg: 0, idleF: 0,
    hist: new Array(HIST_LEN).fill(0), edge: 0, buf: null,
    lastTap: null, dashBit: 0, dashT: -99, guardT: -99,
    wins: 0, stats: { dmg: 0, maxCombo: 0, hits: 0, supers: 0 },
  };
}

export function createMatch({ p1 = 'kagari', p2 = 'goutetsu', training = false, stage = null, gimmicks = false } = {}) {
  const s = {
    t: 0, phase: 'intro', phaseF: 0, round: 1, time: ROUND_FRAMES, training,
    stage: stage || CHARS[p2].stage, gimmicks,
    freeze: 0, freezeBy: -1, winner: -1, matchWinner: -1, timeUp: false,
    ps: [newFighter(0, p1, 0), newFighter(1, p2, p1 === p2 ? 1 : 0)],
    projs: [], events: [],
  };
  placeForRound(s);
  if (training) {
    s.phase = 'fight';
    s.ps.forEach((p) => { p.meter = METER_MAX; });
  }
  return s;
}

function placeForRound(s) {
  s.ps.forEach((p, i) => {
    Object.assign(p, {
      x: i === 0 ? -210 : 210, y: 0, vx: 0, vy: 0, facing: i === 0 ? 1 : -1,
      hp: CHARS[p.char].hp, st: 'idle', f: 0, move: null, used: [], hit: false, blocked: false, chain: 0,
      stun: 0, hitstop: 0, inv: 0, throwInv: 0, landT: 0, jumps: 0, noAct: false, kd: false, bounce: false,
      wallB: false, crouching: false, armorUsed: false, thrownBy: -1, frozen: 0, chargeF: 0, poison: 0, clone: null, bombT: 0, bombBy: -1, airDashed: false, glideT: -1, comboHits: 0, comboDmg: 0, idleF: 0, buf: null,
    });
  });
  s.projs = [];
  s.time = ROUND_FRAMES;
  s.winner = -1;
  s.timeUp = false;
  s.freeze = 0;
  // ステージの仕掛けの状態。ラウンドごとに作り直す
  const b = gimOf(s).barrels;
  s.gim = {
    t: 0, n: 0, haz: [], wind: null, burnCD: [0, 0], crateCD: [0, 0],
    barrels: b ? b.xs.map((x) => ({ x, cd: 0 })) : [],
  };
}

// このステージの仕掛けの数値（ギミックなしなら空）
function gimOf(s) {
  return s.gimmicks ? (STAGE_INFO[s.stage] && STAGE_INFO[s.stage].gim) || {} : {};
}

export const moveOf = (p) => (p.move ? CHARS[p.char].moves[p.move] : null);
const emit = (s, ev) => s.events.push(ev);
const forwardBit = (p) => (p.facing > 0 ? BTN.R : BTN.L);
const backBit = (p) => (p.facing > 0 ? BTN.L : BTN.R);
const current = (p) => p.hist[HIST_LEN - 1];

// テンキー表記（5=ニュートラル, 6=前, 2=下...）に直す
function numpad(mask, facing) {
  const fwd = facing > 0 ? BTN.R : BTN.L;
  const bak = facing > 0 ? BTN.L : BTN.R;
  const h = mask & fwd ? 1 : mask & bak ? -1 : 0;
  const v = mask & BTN.U ? 1 : mask & BTN.D ? -1 : 0;
  return 5 + h + v * 3;
}

export function hasMotion(hist, facing, seq, windowLen = 22) {
  let si = seq.length - 1;
  const lim = Math.max(0, hist.length - windowLen);
  for (let i = hist.length - 1; i >= lim && si >= 0; i--) {
    if (numpad(hist[i], facing) === seq[si]) si--;
  }
  return si < 0;
}

function recordInput(s, p, mask) {
  const prev = current(p);
  p.hist.push(mask);
  p.hist.shift();
  const edge = mask & ~prev;
  p.edge = edge;
  if (edge & BTN.G) p.guardT = s.t; // ガードを押し始めたコマ（ジャストガードの判定に使う）
  if (edge & ATTACK_MASK) {
    // 技の方向は「ボタンを押した瞬間」のものを覚えておく（ヒットストップ中の先行入力用）
    p.buf = { m: (p.buf ? p.buf.m : 0) | (edge & ATTACK_MASK), dir: mask & DIR_MASK, a: 0 };
  }
  const tap = edge & (BTN.L | BTN.R);
  if (tap) {
    if (p.lastTap && p.lastTap.bit === tap && s.t - p.lastTap.t <= 14) {
      p.dashBit = tap;
      p.dashT = s.t;
      p.lastTap = null;
    } else {
      p.lastTap = { bit: tap, t: s.t };
    }
  }
}

function chooseMove(s, p) {
  if (!p.buf) return null;
  const m = p.buf.m;
  const mask = p.buf.dir || (current(p) & DIR_MASK);
  const air = p.y > 0;
  const fromSpecial = p.st === 'attack' && moveOf(p) && moveOf(p).rank === 4;
  if (m & BTN.X && (!air || fromSpecial) && p.meter >= SUPER_COST) return 'super';
  if (m & BTN.T && !air) return 'throw';
  // 空中必殺（持っているキャラだけ）
  if (m & BTN.S && air && CHARS[p.char].moves.jS && p.st === 'air') return 'jS';
  if (m & BTN.S && !air) {
    if (mask & BTN.D) return 'spD';
    if (mask & forwardBit(p)) return 'spF';
    return 'spN';
  }
  if (m & (BTN.A | BTN.B | BTN.C)) {
    if (!air) {
      if (hasMotion(p.hist, p.facing, [6, 2, 3])) return 'spD';
      if (hasMotion(p.hist, p.facing, [2, 3, 6])) return 'spN';
      if (hasMotion(p.hist, p.facing, [2, 1, 4])) return 'spF';
    }
    const lv = m & BTN.C ? 'H' : m & BTN.B ? 'M' : 'L';
    if (air) return p.noAct ? null : `j${lv}`;
    return `${mask & BTN.D ? 'c' : 's'}${lv}`;
  }
  return null;
}

function moveAllowed(s, p, next) {
  if (next.oneProj && s.projs.some((q) => q.owner === p.idx)) return false;
  return true;
}

function canCancel(p, cur, next) {
  if (cur.freeFrom && p.f >= cur.freeFrom && next.rank >= 1) return !next.air;
  if (!(p.hit || p.blocked)) return false;
  if (cur.rank === 0 || cur.rank >= 5 || next.rank === 0) return false;
  if (cur.rank <= 3) {
    if (next.rank >= 4) return !cur.air;
    if (!!cur.air !== !!next.air) return false;
    if (next.rank > cur.rank) return true;
    if (next.rank === cur.rank && cur.rank === 1) {
      return p.chain < (CHARS[p.char].lChain || 2);
    }
    return false;
  }
  if (cur.rank === 4) return next.rank === 5 && p.hit;
  return false;
}

function startMove(s, p, id, cancelled = false) {
  const m = CHARS[p.char].moves[id];
  p.chain = cancelled ? p.chain + 1 : 0;
  p.st = 'attack';
  p.move = id;
  p.f = 0;
  p.used = [];
  p.hit = false;
  p.blocked = false;
  p.buf = null;
  p.armorUsed = false;
  p.chargeF = 0;
  p.crouching = !!m.crouch;
  if (!m.air) p.vx *= 0.3;
  if (m.super) {
    p.meter -= SUPER_COST;
    p.stats.supers++;
    s.freeze = 44;
    s.freezeBy = p.idx;
    emit(s, { t: 'super', by: p.idx, name: m.name, x: p.x, y: p.y + 110 });
  } else {
    emit(s, { t: 'whoosh', rank: m.rank, by: p.idx });
  }
}

function tryMove(s, p, cancelFrom) {
  const id = chooseMove(s, p);
  if (!id) return false;
  const next = CHARS[p.char].moves[id];
  if (!next || !moveAllowed(s, p, next)) return false;
  if (cancelFrom && !canCancel(p, cancelFrom, next)) return false;
  startMove(s, p, id, !!cancelFrom);
  return true;
}

function toNeutral(p) {
  p.st = 'idle';
  p.f = 0;
  p.move = null;
  p.crouching = false;
  p.chain = 0;
  p.comboHits = 0;
  p.comboDmg = 0;
}

function faceOpponent(p, o) {
  if (Math.abs(p.x - o.x) > 2) p.facing = o.x > p.x ? 1 : -1;
}

function launchJump(p, dir, mult = 1) {
  const ch = CHARS[p.char];
  p.st = 'air';
  p.f = 0;
  p.y = Math.max(p.y, 1);
  p.vy = ch.jump * mult;
  p.vx = dir * ch.jumpVx;
  p.move = null;
  p.crouching = false;
  p.jumps = 0;
  p.noAct = false;
  p.airDashed = false;
  p.glideT = -1;
}

function groundNeutral(s, p, o) {
  const ch = CHARS[p.char];
  const mask = current(p);
  // ガードを続けている間は振り向かない（回り込まれると背中を見せたまま）
  if (!(p.st === 'guard' && (mask & BTN.G))) faceOpponent(p, o);
  if (tryMove(s, p, null)) return;
  // 技や着地の硬直が終わる直前に入れたダッシュも出るよう、少し猶予を持たせる
  // 回避：左右を押しながらガードを押し始めると、その方向へ転がる（出始めは攻撃をすり抜ける）
  if ((p.edge & BTN.G) && (mask & (BTN.L | BTN.R))) {
    p.st = 'evade';
    p.f = 0;
    p.dashDir = mask & BTN.R ? 1 : -1;
    p.inv = Math.max(p.inv, EVADE_INV);
    p.crouching = false;
    p.guardT = -99; // 回避した時はジャストガードにしない
    emit(s, { t: 'evade', x: p.x, by: p.idx });
    return;
  }
  // ガードボタンを押している間はその場で構える（歩き・ジャンプ・ダッシュはしない。下も押せばしゃがんで構える）
  if (mask & BTN.G) {
    if (p.st !== 'guard') p.f = 0;
    p.st = 'guard';
    p.crouching = !!(mask & BTN.D);
    p.vx *= 0.6;
    return;
  }
  if (p.dashBit && s.t - p.dashT <= 8) {
    const dir = p.dashBit === BTN.R ? 1 : -1;
    p.dashBit = 0;
    p.st = 'dash';
    p.f = 0;
    p.dashDir = dir;
    if (dir !== p.facing) p.inv = Math.max(p.inv, 12); // 後ろダッシュの出始めは攻撃をすり抜ける
    emit(s, { t: 'dash', x: p.x, by: p.idx });
    return;
  }
  if (mask & BTN.U) {
    p.st = 'squat';
    p.f = 0;
    p.jumpDir = mask & BTN.R ? 1 : mask & BTN.L ? -1 : 0;
    return;
  }
  if (mask & BTN.D) {
    if (p.st !== 'crouch') p.f = 0;
    p.st = 'crouch';
    p.crouching = true;
    p.vx *= 0.7;
    return;
  }
  p.crouching = false;
  if (mask & forwardBit(p)) {
    if (p.st !== 'walk') p.f = 0;
    p.st = 'walk';
    p.vx = p.facing * ch.walk * (gimOf(s).slow || 1);
  } else if (mask & backBit(p)) {
    if (p.st !== 'walk') p.f = 0;
    p.st = 'walk';
    p.vx = -p.facing * ch.back * (gimOf(s).slow || 1);
  } else {
    if (p.st !== 'idle') p.f = 0;
    p.st = 'idle';
    p.vx *= 0.6;
  }
}

function landed(s, p) {
  p.y = 0;
  p.vy = 0;
  p.airDashed = false;
  p.glideT = -1;
  emit(s, { t: 'land', x: p.x, by: p.idx });
}

function spawnProjectile(s, p, o, sp) {
  const dir = p.facing;
  // 置ける数に上限がある物（罠）は、古い物から消す
  if (sp.max) {
    const mine = s.projs.filter((q) => q.owner === p.idx && q.kind === sp.kind);
    if (mine.length >= sp.max) mine[0].life = 0;
    s.projs = s.projs.filter((q) => q.life > 0);
  }
  const x = sp.atOpp ? o.x : p.x + dir * sp.x;
  // 溜めた分だけ大きく・速く・重くする（c は 0〜1）
  const m = moveOf(p);
  if (sp.charged && m && m.charge) {
    const c = p.chargeF / m.charge.max;
    sp = {
      ...sp,
      dmg: Math.round(sp.dmg * (1 + c * 1.6)),
      stun: Math.round(sp.stun + c * 14),
      chip: Math.round((sp.chip || 0) * (1 + c * 2)),
      kb: sp.kb + c * 4,
      w: Math.round(sp.w * (1 + c * 0.9)),
      h: Math.round(sp.h * (1 + c * 0.6)),
      vx: sp.vx * (1 + c * 0.7),
      hs: sp.hs + Math.round(c * 6),
      fx: c >= 0.99 ? 's' : c > 0.4 ? 'h' : sp.fx,
      level: c,
    };
    // 最大まで溜めるとガード貫通（ガードもジャストガードもできない）
    if (c >= 0.99) { sp.launch = 14; sp.kd = true; sp.unblockable = true; }
  }
  s.projs.push({
    owner: p.idx,
    x: Math.max(-STAGE_HALF, Math.min(STAGE_HALF, x)),
    y: sp.y + (sp.atOpp ? 0 : p.y),
    vx: sp.vx * dir,
    vy: sp.vy || 0,
    w: sp.w, h: sp.h, life: sp.life, age: 0, kind: sp.kind, data: sp,
  });
  emit(s, { t: 'proj', kind: sp.kind, x: p.x, by: p.idx });
}

function updateAttack(s, p, o) {
  const m = moveOf(p);
  if (tryMove(s, p, m)) return;
  // ジャンプキャンセル（打ち上げから空中コンボへ）
  // 少し早めに上を入れても受け付ける
  const upRecently = p.hist.slice(-10).some((h) => h & BTN.U);
  if (m.jc && p.hit && p.y <= 0 && upRecently) {
    const mask = current(p);
    const held = mask & BTN.R ? 1 : mask & BTN.L ? -1 : p.facing;
    launchJump(p, held, 1.12);
    emit(s, { t: 'jump', x: p.x, by: p.idx });
    return;
  }
  if (m.warp && p.f === m.warp.f) warpBehind(s, p, o, m.warp.dist);
  // 溜め：決まったコマで必殺ボタンを押し続けている間は、そのコマで止まって力を溜める
  if (m.charge && p.f === m.charge.at && (current(p) & BTN[m.charge.btn || 'S']) && p.chargeF < m.charge.max) {
    p.chargeF++;
    p.f--;
    if (p.chargeF === m.charge.max) emit(s, { t: 'chargeMax', x: p.x, y: p.y + 110, by: p.idx });
    return;
  }
  if (m.motion) {
    for (const mo of m.motion) {
      if (mo.untilHit && (p.hit || p.blocked)) continue;
      if (p.f >= mo.from && p.f <= mo.to) {
        if (mo.vx !== undefined) p.vx = mo.vx * p.facing;
        if (mo.vy !== undefined) { p.vy = mo.vy; p.y = Math.max(p.y, 0.01); }
      }
    }
  }
  // 分身を置く・分身と入れ替わる
  if (m.makeClone && p.f === m.makeClone) {
    p.clone = { x: p.x, facing: p.facing, life: CLONE_LIFE };
    emit(s, { t: 'clone', x: p.x, by: p.idx });
  }
  if (m.swapClone && p.f === m.swapClone && p.clone) {
    const from = p.x;
    p.x = p.clone.x;
    p.clone.x = from;
    p.vx = 0;
    p.facing = o.x > p.x ? 1 : -1;
    emit(s, { t: 'warp', x: from, to: p.x, by: p.idx });
  }
  if (m.spawn) {
    for (const sp of m.spawn) {
      if (p.f !== sp.f) continue;
      spawnProjectile(s, p, o, sp);
      // 分身からも同じ飛び道具を出す
      if (sp.echo && p.clone) spawnProjectile(s, { ...p, x: p.clone.x, y: 0, facing: p.clone.facing }, o, sp);
    }
  }
  if (p.f >= m.total) {
    p.move = null;
    p.crouching = false;
    if (p.y > 0) {
      p.st = 'air';
      p.f = 0;
      if (m.helpless) p.noAct = true;
    } else {
      toAfterMove(p);
    }
  }
}

// 相手の向こう側へ回り込む。画面端で回り込めない時は相手の手前に出る
function warpBehind(s, p, o, dist) {
  const side = p.x <= o.x ? 1 : -1;
  let x = o.x + side * dist;
  if (Math.abs(x) > STAGE_HALF) x = o.x - side * dist;
  emit(s, { t: 'warp', x: p.x, to: x, by: p.idx });
  p.x = Math.max(-STAGE_HALF, Math.min(STAGE_HALF, x));
  p.vx = 0;
  p.facing = o.x > p.x ? 1 : -1;
}

// 技の無敵時間中か（move.inv = [始まり, 終わり] のコマ）
export function moveInvincible(p) {
  if (p.st !== 'attack') return false;
  const m = moveOf(p);
  return !!(m && m.inv && p.f >= m.inv[0] && p.f <= m.inv[1]);
}

// くっついていた時限爆弾が爆発する。ガードはできない
function explodeBomb(s, p) {
  const a = s.ps[p.bombBy];
  p.bombBy = -1;
  emit(s, { t: 'bomb', x: p.x, y: p.y + 110, by: a.idx });
  dealDamage(s, a, p, BOMB_HIT, { x: p.x, y: p.y + 110 }, false, { dir: p.x >= a.x ? 1 : -1, x: p.x });
}

function toAfterMove(p) {
  p.st = 'idle';
  p.f = 0;
  p.chain = 0;
}

function completeThrow(s, a, d) {
  const m = moveOf(a);
  const b = m.boxes[0];
  emit(s, { t: 'throwHit', x: d.x, y: d.y + 90, by: a.idx });
  d.hitstop = 0;
  dealDamage(s, a, d, b, { x: d.x, y: d.y + 90 }, false, false);
}

function updateFighter(s, p, o) {
  if (p.hitstop > 0) { p.hitstop--; return; }
  // 毒：20コマごとに少しずつ減る。毒だけでは倒れない
  if (p.poison > 0) {
    p.poison--;
    if (p.poison % 20 === 0 && p.hp > 1) {
      p.hp = Math.max(1, p.hp - POISON_TICK);
      emit(s, { t: 'poison', x: p.x, y: p.y + 150, by: p.idx });
    }
  }
  // 分身：時間で消える。いつも相手の方を向く
  if (p.clone) {
    p.clone.facing = o.x > p.clone.x ? 1 : -1;
    if (--p.clone.life <= 0) p.clone = null;
  }
  // 時限爆弾：時間が来たら爆発。無敵中や投げられている間は待つ
  if (p.bombT > 0) {
    if (p.inv > 0 || moveInvincible(p) || p.st === 'thrown') p.bombT = Math.max(p.bombT, 1);
    else if (--p.bombT === 0) explodeBomb(s, p);
  }
  p.f++;
  if (p.inv > 0) p.inv--;
  if (p.throwInv > 0) p.throwInv--;
  const ch = CHARS[p.char];
  const mask = current(p);

  switch (p.st) {
    case 'idle':
    case 'walk':
    case 'crouch':
    case 'guard':
      groundNeutral(s, p, o);
      break;
    case 'squat':
      if (p.f >= 4) {
        launchJump(p, p.jumpDir);
        emit(s, { t: 'jump', x: p.x, by: p.idx });
      }
      break;
    case 'evade':
      // 前半は素早く転がり、後半は減速して起き上がる（終わり際は隙）
      p.vx = p.dashDir * EVADE_SPEED * (p.f < 16 ? 1 : 0.3);
      if (p.f >= EVADE_TOTAL) toAfterMove(p);
      break;
    case 'land':
      p.vx *= 0.6;
      if (p.f >= p.landT) toAfterMove(p);
      break;
    case 'dash': {
      const backDash = p.dashDir !== p.facing;
      const total = backDash ? ch.dashF + 4 : ch.dashF;
      p.vx = p.dashDir * ch.dash * (gimOf(s).slow || 1) * (p.f < total * 0.7 ? 1 : 0.4);
      if (!backDash && p.f > 6 && tryMove(s, p, null)) break;
      if (p.f >= total) toAfterMove(p);
      break;
    }
    case 'air':
      if (!p.noAct && tryMove(s, p, null)) break;
      // 滑空の開始：空中でもう一度上を押す（1回のジャンプで1回）。ジャンプを押しっぱなしにしただけでは始まらない
      if (ch.glide && p.glideT === -1 && !p.noAct && (p.edge & BTN.U) && p.f > 3) {
        p.glideT = GLIDE_MAX;
        emit(s, { t: 'glide', x: p.x, y: p.y + 90, by: p.idx });
      }
      // 空中ダッシュ（持っているキャラだけ。1回のジャンプで1回）
      if (ch.airDash && !p.noAct && !p.airDashed && p.dashBit && s.t - p.dashT <= 2) {
        const dir = p.dashBit === BTN.R ? 1 : -1;
        p.dashBit = 0;
        p.airDashed = true;
        p.vx = dir * ch.airDash;
        p.vy = Math.max(p.vy, 3);
        emit(s, { t: 'airdash', x: p.x, y: p.y + 90, by: p.idx });
        break;
      }
      if (!p.noAct && (ch.airJumps || 0) > p.jumps && p.edge & BTN.U && p.f > 3) {
        p.jumps++;
        p.vy = ch.jump * 0.82;
        p.vx = (mask & BTN.R ? 1 : mask & BTN.L ? -1 : 0) * ch.jumpVx;
        emit(s, { t: 'jump', x: p.x, by: p.idx });
      }
      break;
    case 'attack':
      updateAttack(s, p, o);
      break;
    case 'throwing': {
      const m = moveOf(p);
      const holdF = m.holdF || 18;
      const holdT = m.holdT || 32;
      if (p.f === holdF && o.st === 'thrown') completeThrow(s, p, o);
      if (p.f >= holdT) { p.move = null; toAfterMove(p); }
      break;
    }
    case 'thrown': {
      const a = s.ps[p.thrownBy];
      // 投げた側が途中で攻撃を受けるなどして投げが続いていなければ、その場で放す
      // （放さないと、投げられた側が空中で固まったままになる）
      if (!a || a.st !== 'throwing') {
        releaseThrown(p);
        break;
      }
      const am = moveOf(a);
      p.x = a.x + a.facing * 62;
      p.y = Math.min(70, p.f * 5);
      p.inv = 2;
      const canTech = am && am.boxes[0] && !am.boxes[0].noTech && p.f <= 10;
      if (canTech && p.edge & BTN.T) techThrow(s, a, p);
      break;
    }
    case 'hit':
      p.stun--;
      if (p.frozen > 0) p.frozen--;
      p.vx *= gimOf(s).slip || 0.86; // ぬかるみでは滑る
      if (p.stun <= 0) toNeutral(p);
      break;
    case 'block':
      // ガード中の反撃：必殺ボタンでゲージを使って反撃技に移る（持っているキャラだけ）
      if (ch.guardCancel && p.buf && (p.buf.m & BTN.S) && p.meter >= GC_COST) {
        p.meter -= GC_COST;
        startMove(s, p, 'gc');
        emit(s, { t: 'gc', x: p.x, y: p.y + 110, by: p.idx });
        break;
      }
      p.stun--;
      p.vx *= gimOf(s).slip || 0.86; // ぬかるみでは滑る
      if (p.stun <= 0) { const c = p.comboHits; toNeutral(p); void c; }
      break;
    case 'hitair':
      p.stun--;
      if (p.stun <= 0 && !p.kd && !p.bounce && p.y > 0) {
        p.st = 'air';
        p.f = 0;
        p.inv = 8;
        p.noAct = false;
        p.comboHits = 0;
        p.comboDmg = 0;
        emit(s, { t: 'recover', x: p.x, y: p.y, by: p.idx });
      }
      break;
    case 'down':
      p.inv = 2;
      p.vx *= 0.82;
      if (p.f >= 40 && p.hp > 0) {
        p.st = 'getup';
        p.f = 0;
      }
      break;
    case 'getup':
      p.inv = 2;
      if (p.f >= 14) {
        toNeutral(p);
        p.inv = 3;
        p.throwInv = 7;
      }
      break;
    case 'win':
      p.vx = 0;
      break;
    default:
      break;
  }

  applyPhysics(s, p);

  if (p.buf && ++p.buf.a > BUFFER_FRAMES) p.buf = null;
}

function applyPhysics(s, p) {
  const airborne = p.y > 0 || p.vy > 0;
  if (p.st === 'thrown') return;
  if (airborne) {
    const g = (p.st === 'hitair' ? GRAVITY + Math.min(0.5, p.comboHits * 0.025) : GRAVITY) * (gimOf(s).gravity || 1);
    p.vy -= g;
    // 滑空：始めてから上を押し続けている間だけ、ゆっくり落ちる。離すか時間切れで終わり
    const glide = CHARS[p.char].glide;
    if (glide && p.st === 'air' && p.glideT > 0) {
      if (current(p) & BTN.U) {
        if (p.vy < -glide) p.vy = -glide;
        p.glideT--;
      } else {
        p.glideT = 0;
      }
    }
    p.y += p.vy;
    p.x += p.vx;
    if (p.st === 'hitair' && p.wallB && Math.abs(p.x) >= STAGE_HALF - 2) {
      p.wallB = false;
      p.vx = -p.vx * 0.6;
      p.vy = Math.max(p.vy, 9);
      emit(s, { t: 'wall', x: p.x, y: p.y + 90, by: p.idx });
    }
    if (p.y <= 0) {
      if (p.st === 'hitair') {
        if (p.bounce) {
          p.bounce = false;
          p.y = 0.01;
          p.vy = 12;
          p.vx *= 0.5;
          p.stun = Math.max(p.stun, 30);
          emit(s, { t: 'bounce', x: p.x, by: p.idx });
        } else {
          p.y = 0;
          p.vy = 0;
          p.st = 'down';
          p.f = 0;
          p.kd = false;
          p.wallB = false;
          p.inv = 2;
          p.comboHits = 0;
          p.comboDmg = 0;
          emit(s, { t: 'down', x: p.x, by: p.idx });
        }
      } else if (p.st === 'attack') {
        const m = moveOf(p);
        if (m.air) {
          landed(s, p);
          p.st = 'land';
          p.f = 0;
          p.landT = p.hit ? 5 : (m.landT || 5);
          p.move = null;
        } else {
          p.y = 0;
          p.vy = 0;
        }
      } else if (p.st === 'air') {
        landed(s, p);
        p.st = 'land';
        p.f = 0;
        p.landT = p.noAct ? 16 : 3;
        p.noAct = false;
      } else {
        p.y = 0;
        p.vy = 0;
      }
    }
  } else {
    p.y = 0;
    p.x += p.vx;
    if (p.st !== 'walk' && p.st !== 'dash' && p.st !== 'evade') {
      const hasMotionNow = p.st === 'attack';
      p.vx *= hasMotionNow ? 0.8 : 0.92;
      if (Math.abs(p.vx) < 0.05) p.vx = 0;
    }
  }
}

function hurtRect(p) {
  const ch = CHARS[p.char];
  let h = ch.h;
  if (p.crouching) h *= 0.66;
  if (p.st === 'hitair' || p.st === 'air') h *= 0.86;
  return { x0: p.x - ch.w / 2, x1: p.x + ch.w / 2, y0: p.y, y1: p.y + h };
}

export function hurtboxOf(p) { return hurtRect(p); }

export function activeBoxes(p) {
  if (p.st !== 'attack') return [];
  const m = moveOf(p);
  const out = [];
  m.boxes.forEach((b, i) => {
    if (p.f >= b.from && p.f <= b.to && !p.used.includes(i)) out.push({ b, i, rect: boxRect(p, b) });
  });
  return out;
}

function boxRect(p, b) {
  const [bx, by, bw, bh] = b.box;
  const cx = p.x + p.facing * bx;
  return { x0: cx - bw / 2, x1: cx + bw / 2, y0: p.y + by, y1: p.y + by + bh };
}

const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

// ガードできるか。ガードボタンを押している間だけ守れる。下段は下も一緒に、上段は立ったまま。
// ガード中は振り向かないので、背中側（回り込み・分身）からの攻撃は防げない
function canBlock(d, originX, lv, unblockable) {
  if (unblockable) return false;
  if (!(NEUTRAL.has(d.st) || d.st === 'block') || d.y > 0) return false;
  const mask = current(d);
  if (!(mask & BTN.G)) return false;
  if ((originX - d.x) * d.facing < -10) return false;
  const low = !!(mask & BTN.D);
  if (lv === 'l' && !low) return false;
  if (lv === 'h' && low) return false;
  return true;
}

function dealDamage(s, a, d, hb, at, counter, isProj) {
  const dir = isProj && isProj.dir ? isProj.dir : a.facing;
  d.comboHits++;
  const scale = hb.superFix
    ? Math.max(0.5, 1 - 0.07 * Math.max(0, d.comboHits - 2))
    : Math.max(0.3, 1 - 0.09 * Math.max(0, d.comboHits - 2));
  // 怒り：体力が減るほど攻撃が重くなる（最大1.5倍）。毒の相手に強い技もある
  const ach = CHARS[a.char];
  const rage = ach.rage ? 1 + 0.5 * (1 - Math.max(0, a.hp) / ach.hp) : 1;
  const venom = hb.poisonBonus && d.poison > 0 ? hb.poisonBonus : 1;
  let dmg = Math.max(1, Math.round(hb.dmg * scale * (counter ? 1.15 : 1) * rage * venom));
  if (s.training) dmg = Math.min(dmg, Math.max(0, d.hp - 1));
  d.hp = Math.max(0, d.hp - dmg);
  d.comboDmg += dmg;
  a.stats.dmg += dmg;
  a.stats.hits++;
  a.stats.maxCombo = Math.max(a.stats.maxCombo, d.comboHits);
  a.meter = Math.min(METER_MAX, a.meter + Math.round(hb.dmg * 0.13) + 2);
  d.meter = Math.min(METER_MAX, d.meter + Math.round(hb.dmg * 0.07));
  d.idleF = 0;

  const decay = Math.min(14, Math.floor(d.comboHits / 3) * 2);
  const stun = Math.max(7, (hb.stun || 20) - decay + (counter ? 5 : 0));
  const wasAir = d.y > 0;
  d.move = null;
  d.crouching = false;
  d.f = 0;
  d.stun = stun;
  d.vx = dir * (hb.kb || 3);
  d.thrownBy = -1;
  d.frozen = 0;

  const launchGround = hb.launch !== undefined && hb.launch > 0;
  if (wasAir || launchGround || d.hp <= 0) {
    d.st = 'hitair';
    d.y = Math.max(d.y, 0.01);
    if (d.hp <= 0) {
      d.vy = 13;
      d.vx = dir * 7;
      d.kd = true;
    } else {
      d.vy = hb.launch !== undefined ? hb.launch : 8.5;
      if (hb.launch === undefined) d.vx = dir * (hb.kb || 3) * 0.6;
      d.kd = !!hb.kd;
    }
    d.bounce = !!hb.bounce && wasAir;
    d.wallB = !!hb.wall;
  } else {
    d.st = 'hit';
    d.kd = false;
    d.bounce = false;
    // 凍る：その場で止まり、長く動けない
    if (hb.freeze) {
      d.frozen = stun;
      d.vx = 0;
    }
    // 引き寄せ：攻撃した側の目の前（約75）まで滑ってくる。
    // のけぞり中は毎コマ 0.86倍→移動→0.92倍 と減速するので、進む距離は初速の約4.12倍。その分を見込む
    if (hb.pull) {
      const gap = Math.abs(d.x - a.x);
      d.vx = -Math.sign(d.x - a.x || -a.facing) * Math.max(0, gap - 75) / 4.12;
    }
  }
  if (hb.poison) d.poison = Math.max(d.poison, hb.poison);
  // 時限爆弾をくっつける（すでに付いていれば、早く爆発する方を残す）
  if (hb.bomb) {
    d.bombT = d.bombT > 0 ? Math.min(d.bombT, hb.bomb) : hb.bomb;
    d.bombBy = a.idx;
  }

  const hs = hb.hs || 6;
  d.hitstop = hs;
  if (!isProj) {
    a.hitstop = hs;
    a.hit = true;
    if (a.y > 0 && moveOf(a) && moveOf(a).air) a.vy = Math.max(a.vy, 3.5);
    // 画面端では攻撃側が押し戻される
    if (Math.abs(d.x) > STAGE_HALF - 40 && a.st === 'attack') a.vx -= dir * (hb.kb || 3) * 0.7;
  } else {
    a.hit = true;
  }
  emit(s, { t: 'hit', x: at.x, y: at.y, fx: hb.fx || 'm', by: a.idx, hits: d.comboHits, combo: d.comboDmg, dmg, counter, ko: d.hp <= 0 });
}

// 当て身：構えの最中に攻撃を受けたら、受け流して反撃の技に移る（投げは別の処理なので防げない）
function tryParry(s, a, d, at, isProj) {
  if (d.st !== 'attack') return false;
  const dm = moveOf(d);
  if (!dm.parry || d.f < dm.parry[0] || d.f > dm.parry[1]) return false;
  startMove(s, d, dm.counter);
  d.hitstop = 12;
  d.facing = a.x > d.x ? 1 : -1;
  if (!isProj) a.hitstop = 12;
  emit(s, { t: 'parry', x: at.x, y: at.y, by: d.idx });
  return true;
}

// 溜め強：溜めた割合 c（0〜1）だけ重くする。最大ならガード崩し（crush）
function chargedHit(hb, c) {
  return {
    ...hb,
    dmg: Math.round(hb.dmg * (1 + 0.8 * c)),
    stun: Math.round((hb.stun || 20) + 10 * c),
    kb: (hb.kb || 3) * (1 + 0.6 * c),
    hs: (hb.hs || 6) + Math.round(4 * c),
    fx: c >= 1 ? 's' : c > 0.4 ? 'h' : hb.fx,
    crush: c >= 1,
  };
}

function applyHit(s, a, d, hb, at, counter, isProj) {
  if (tryParry(s, a, d, at, isProj)) return;
  if (!isProj && a.st === 'attack' && a.chargeF > 0) {
    const am = moveOf(a);
    if (am && am.charge && am.charge.melee) hb = chargedHit(hb, a.chargeF / am.charge.max);
  }
  const dir = isProj && isProj.dir ? isProj.dir : a.facing;
  if (canBlock(d, isProj ? isProj.x : a.x, hb.lv, hb.unblockable)) {
    // ジャストガード：当たる直前にガードを押し始めていた
    const just = s.t - d.guardT <= JUST_WINDOW;
    d.st = 'block';
    d.f = 0;
    d.stun = just ? 6 : hb.block || 12;
    d.vx = dir * Math.max(3.5, hb.kb || 3) * (just ? 0.4 : 1);
    d.crouching = !!(current(d) & BTN.D);
    const hs = Math.max(4, (hb.hs || 6) - 2);
    d.hitstop = hs;
    if (just) {
      d.guardT = -99; // 1回の押し始めで成功するのは1回だけ
      d.meter = Math.min(METER_MAX, d.meter + 10);
      emit(s, { t: 'justGuard', x: at.x, y: at.y, by: d.idx });
      // 地上で殴ってきた相手はよろけて、しばらく動けない（飛び道具・空中からの攻撃はよろけない）
      if (!isProj && a.y <= 0 && a.st === 'attack') {
        a.st = 'hit';
        a.f = 0;
        a.move = null;
        a.stun = STAGGER;
        a.vx = -a.facing * 2;
        a.hitstop = hs;
        a.crouching = false;
        a.comboHits = 0;
        a.comboDmg = 0;
        a.frozen = 0;
        emit(s, { t: 'stagger', x: a.x, y: a.y + 150, by: a.idx });
      }
      return;
    }
    // ガード崩し：最大まで溜めた強攻撃はガードを崩し、相手をよろけさせる（ダメージはなし）
    if (hb.crush) {
      d.st = 'hit';
      d.stun = STAGGER;
      d.crouching = false;
      d.vx = dir * 4;
      d.comboHits = 0;
      d.comboDmg = 0;
      if (!isProj) { a.hitstop = hs; a.hit = true; }
      emit(s, { t: 'guardCrush', x: at.x, y: at.y, by: a.idx });
      return;
    }
    if (hb.chip && !CHARS[d.char].noChip) {
      const chip = s.training ? Math.min(hb.chip, Math.max(0, d.hp - 1)) : Math.min(hb.chip, Math.max(0, d.hp - 1));
      d.hp -= chip;
    }
    a.meter = Math.min(METER_MAX, a.meter + 2);
    d.meter = Math.min(METER_MAX, d.meter + 3);
    if (!isProj) {
      a.hitstop = hs;
      a.blocked = true;
      if (Math.abs(d.x) > STAGE_HALF - 40) a.vx -= dir * 3;
    }
    emit(s, { t: 'block', x: at.x, y: at.y, by: a.idx });
    return;
  }
  // アーマー（1発だけ耐えて攻撃を続行）
  if (d.st === 'attack') {
    const dm = moveOf(d);
    if (dm.armor && d.f >= dm.armor[0] && d.f <= dm.armor[1] && !d.armorUsed) {
      d.armorUsed = true;
      const dmg = Math.max(1, Math.round(hb.dmg * 0.5));
      d.hp = Math.max(s.training ? 1 : 1, d.hp - dmg);
      d.hitstop = 8;
      if (!isProj) { a.hitstop = 8; a.hit = true; }
      emit(s, { t: 'armor', x: at.x, y: at.y, by: a.idx });
      return;
    }
  }
  dealDamage(s, a, d, hb, at, counter, isProj);
}

// 投げが中断された時に、投げられていた側を自由にする。空中なら落ちながら動けるようにする
function releaseThrown(p) {
  p.thrownBy = -1;
  p.vx = 0;
  p.vy = 0;
  p.inv = Math.max(p.inv, 10);
  p.comboHits = 0;
  p.comboDmg = 0;
  if (p.y > 0) {
    p.st = 'air';
    p.f = 0;
    p.noAct = false;
    p.move = null;
  } else {
    p.y = 0;
    toNeutral(p);
  }
}

function techThrow(s, a, d) {
  [a, d].forEach((f) => {
    f.st = 'block';
    f.f = 0;
    f.stun = 16;
    f.move = null;
    f.crouching = false;
    f.y = 0;
    f.thrownBy = -1;
  });
  const dir = d.x >= a.x ? 1 : -1;
  a.vx = -dir * 8;
  d.vx = dir * 8;
  emit(s, { t: 'tech', x: (a.x + d.x) / 2, y: 110 });
}

function beginThrow(s, a, d) {
  a.st = 'throwing';
  a.f = 0;
  a.vx = 0;
  d.st = 'thrown';
  d.f = 0;
  d.vx = 0;
  d.move = null;
  d.crouching = false;
  d.thrownBy = a.idx;
  d.inv = 2;
  d.buf = null;
  emit(s, { t: 'grab', x: d.x, y: 100, by: a.idx });
}

function resolveMelee(s) {
  const [p, q] = s.ps;
  const hits = [];
  for (const [a, d] of [[p, q], [q, p]]) {
    if (a.st !== 'attack' || a.hitstop > 0 || d.inv > 0 || moveInvincible(d)) continue;
    const hr = hurtRect(d);
    for (const { b, i, rect } of activeBoxes(a)) {
      if (!overlap(rect, hr)) continue;
      if (b.throw && (d.y > 0 || NOT_THROWABLE.has(d.st) || d.throwInv > 0)) continue;
      hits.push({ a, d, b, i, rect, hr, counter: d.st === 'attack' && !b.throw });
      break;
    }
  }
  if (hits.length === 2 && hits[0].b.throw && hits[1].b.throw) {
    hits.forEach((h) => h.a.used.push(h.i));
    techThrow(s, p, q);
    return;
  }
  for (const h of hits) {
    h.a.used.push(h.i);
    if (h.b.throw) {
      if (h.d.st !== 'attack' || !hits.some((o) => o.a === h.d && !o.b.throw)) beginThrow(s, h.a, h.d);
      continue;
    }
    const at = {
      x: (Math.max(h.rect.x0, h.hr.x0) + Math.min(h.rect.x1, h.hr.x1)) / 2,
      y: (Math.max(h.rect.y0, h.hr.y0) + Math.min(h.rect.y1, h.hr.y1)) / 2,
    };
    applyHit(s, h.a, h.d, h.b, at, h.counter, false);
  }
}

function updateProjectiles(s) {
  for (const q of s.projs) {
    q.age++;
    q.life--;
    if (q.data.grav) q.vy -= q.data.grav; // 放物線を描く物（投げた爆弾）
    q.x += q.vx;
    q.y += q.vy;
    if (q.y < 0 && q.vy < 0) q.life = 0;
    // 鏡の壁：画面端で1回だけ跳ね返る
    if (gimOf(s).mirror && !q.bounced && q.vx !== 0 && Math.abs(q.x) > STAGE_HALF - 10 && Math.sign(q.x) === Math.sign(q.vx)) {
      q.vx = -q.vx;
      q.bounced = true;
      emit(s, { t: 'mirror', x: q.x, y: q.y + q.h / 2 });
    }
    if (Math.abs(q.x) > STAGE_HALF + 80) q.life = 0;
  }
  // 飛び道具同士の相殺
  for (let i = 0; i < s.projs.length; i++) {
    for (let j = i + 1; j < s.projs.length; j++) {
      const a = s.projs[i];
      const b = s.projs[j];
      if (a.owner === b.owner || a.life <= 0 || b.life <= 0 || a.data.noClash || b.data.noClash) continue;
      if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2) {
        a.life = 0;
        b.life = 0;
        emit(s, { t: 'clash', x: (a.x + b.x) / 2, y: a.y + 20 });
      }
    }
  }
  for (const q of s.projs) {
    if (q.life <= 0) continue;
    const a = s.ps[q.owner];
    const d = s.ps[1 - q.owner];
    if (d.inv > 0 || moveInvincible(d) || q.age < (q.data.arm || 0)) continue;
    const rect = { x0: q.x - q.w / 2, x1: q.x + q.w / 2, y0: q.y, y1: q.y + q.h };
    if (!overlap(rect, hurtRect(d))) continue;
    // 弾き返し：構えの最中なら、飛び道具を持ち主へ向けて打ち返す（超必殺と縦に落ちる物は無理）
    const dm = d.st === 'attack' ? moveOf(d) : null;
    if (dm && dm.reflect && d.f >= dm.reflect[0] && d.f <= dm.reflect[1] && q.vx !== 0 && !q.data.superFix) {
      q.owner = d.idx;
      q.vx = -q.vx;
      q.x = d.x + Math.sign(q.vx) * (CHARS[d.char].w / 2 + q.w / 2 + 4);
      emit(s, { t: 'reflect', x: q.x, y: q.y + q.h / 2, by: d.idx });
      continue;
    }
    q.life = 0;
    const counter = d.st === 'attack';
    const at = { x: (q.x + d.x) / 2, y: Math.min(q.y + q.h / 2, d.y + 130) };
    const dir = q.vx > 0 ? 1 : q.vx < 0 ? -1 : (d.x >= q.x ? 1 : -1);
    applyHit(s, a, d, q.data, at, counter, { dir, x: q.x });
  }
  s.projs = s.projs.filter((q) => q.life > 0);
}

/* ---------- ステージの仕掛け ---------- */

// 仕掛けが当たってよい状態か（無敵・ダウン中・投げられ中は当たらない）
function exposed(p) {
  return p.inv === 0 && !moveInvincible(p) && p.st !== 'down' && p.st !== 'getup' && p.st !== 'thrown' && p.st !== 'throwing';
}

// ステージの仕掛けによる当たり。誰の攻撃でもないので、x の位置から押し出す形にする
function stageHit(s, d, hb, x, y) {
  const a = {
    idx: -1, char: 'kagari', x, y: 0, facing: d.x >= x ? 1 : -1, hp: 1, meter: 0,
    stats: { dmg: 0, maxCombo: 0, hits: 0, supers: 0 },
  };
  dealDamage(s, a, d, hb, { x: d.x, y: y || d.y + 90 }, false, { dir: a.facing, x });
}

function updateStage(s) {
  if (!s.gimmicks) return;
  const g = gimOf(s);
  const G = s.gim;
  G.t++;

  // 突風：予告のあと、決まったコマ数だけ2人とも流される（向きは毎回交互）
  if (g.wind) {
    const w = g.wind;
    if (!G.wind && G.t % w.every === 0) {
      G.wind = { dir: G.n++ % 2 ? -1 : 1, warn: w.warn, len: w.len };
      emit(s, { t: 'gust', dir: G.wind.dir });
    }
    if (G.wind) {
      if (G.wind.warn > 0) G.wind.warn--;
      else {
        for (const f of s.ps) if (f.st !== 'thrown') f.x = Math.max(-STAGE_HALF, Math.min(STAGE_HALF, f.x + G.wind.dir * w.push));
        if (--G.wind.len <= 0) G.wind = null;
      }
    }
  }

  // 太鼓の拍子：ゲージが増える
  if (g.drum && G.t % g.drum.every === 0) {
    for (const f of s.ps) f.meter = Math.min(METER_MAX, f.meter + g.drum.meter);
    emit(s, { t: 'drum' });
  }

  // 熱い壁：のけぞり中に画面端へ着くとやけど
  if (g.hotWall) {
    s.ps.forEach((f, i) => {
      if (G.burnCD[i] > 0) { G.burnCD[i]--; return; }
      if ((f.st === 'hit' || f.st === 'hitair') && f.hitstop === 0 && Math.abs(f.x) >= STAGE_HALF - 30 && f.hp > 0) {
        G.burnCD[i] = 90;
        emit(s, { t: 'burn', x: f.x, y: f.y + 100 });
        stageHit(s, f, g.hotWall, f.x + Math.sign(f.x) * 60);
      }
    });
  }

  // 印の場所に落ちる物（雷・竹・瓦・矢・毒の霧）。2人に交互に狙いを付ける
  if (g.spot && G.t % g.spot.every === 0) {
    const target = s.ps[G.n++ % 2];
    G.haz.push({ type: 'spot', kind: g.spot.kind, x: target.x, w: g.spot.w, h: g.spot.h, warn: g.spot.warn, active: g.spot.active, done: [false, false] });
  }
  // 画面を横切る物（岩・つむじ風）。左右から交互に来る
  if (g.mover && G.t % g.mover.every === 0) {
    const dir = G.n++ % 2 ? -1 : 1;
    G.haz.push({ type: 'mover', kind: g.mover.kind, x: -dir * (STAGE_HALF + 40), vx: dir * g.mover.vx, w: g.mover.w, h: g.mover.h, warn: g.mover.warn, done: [false, false] });
  }
  for (const h of G.haz) {
    if (h.warn > 0) { h.warn--; continue; }
    const spec = h.type === 'spot' ? g.spot : g.mover;
    if (h.type === 'spot') h.active--;
    else h.x += h.vx;
    s.ps.forEach((f, i) => {
      if (h.done[i] || !exposed(f)) return;
      if (Math.abs(f.x - h.x) > (h.w + CHARS[f.char].w) / 2 || f.y > h.h) return;
      h.done[i] = true;
      if (spec.poison) {
        f.poison = Math.max(f.poison, spec.poison);
        emit(s, { t: 'poison', x: f.x, y: f.y + 150, by: f.idx });
      } else {
        stageHit(s, f, spec.hit, h.x - (h.vx || 0) * 4);
      }
    });
  }
  G.haz = G.haz.filter((h) => (h.type === 'spot' ? h.active > 0 : h.warn > 0 || Math.abs(h.x) < STAGE_HALF + 120));

  // 揺れる荷物：左右に揺れ続ける。下端より低くしゃがめばくぐれる
  if (g.crate) {
    const c = g.crate;
    const cx = c.amp * Math.sin((G.t / c.period) * Math.PI * 2);
    G.crateX = cx;
    s.ps.forEach((f, i) => {
      if (G.crateCD[i] > 0) { G.crateCD[i]--; return; }
      if (!exposed(f)) return;
      const r = hurtRect(f);
      if (r.x1 < cx - c.w / 2 || r.x0 > cx + c.w / 2 || r.y1 < c.y || r.y0 > c.y + c.h) return;
      G.crateCD[i] = 90;
      stageHit(s, f, c.hit, cx);
    });
  }

  // 火薬樽：攻撃や飛び道具が当たると爆発し、周りを吹き飛ばす
  if (g.barrels) {
    const b = g.barrels;
    for (const br of G.barrels) {
      if (br.cd > 0) { br.cd--; continue; }
      const rect = { x0: br.x - b.w / 2, x1: br.x + b.w / 2, y0: 0, y1: b.h };
      // 相手に当たって使用済みになった判定でも、出ている間は樽を叩ける
      const struck = s.ps.some((f) => f.st === 'attack' && moveOf(f).boxes.some((hb) => !hb.throw && f.f >= hb.from && f.f <= hb.to && overlap(boxRect(f, hb), rect)))
        || s.projs.some((pr) => overlap({ x0: pr.x - pr.w / 2, x1: pr.x + pr.w / 2, y0: pr.y, y1: pr.y + pr.h }, rect));
      if (!struck) continue;
      br.cd = b.respawn;
      emit(s, { t: 'barrel', x: br.x, y: 60 });
      for (const f of s.ps) if (exposed(f) && Math.abs(f.x - br.x) < b.blast / 2 && f.y < 200) stageHit(s, f, b.hit, br.x);
    }
  }
}

function pushApart(s) {
  const [p, q] = s.ps;
  const pm = moveOf(p);
  const qm = moveOf(q);
  // 回避中は相手をすり抜けられる（前へ転がって背後に回れる）
  const skip = p.st === 'thrown' || q.st === 'thrown' || p.st === 'evade' || q.st === 'evade' || (pm && pm.noPush && p.f <= pm.total) || (qm && qm.noPush && q.f <= qm.total);
  if (!skip) {
    const pc = CHARS[p.char];
    const qc = CHARS[q.char];
    const yOverlap = p.y < q.y + qc.h * 0.8 && q.y < p.y + pc.h * 0.8;
    if (yOverlap) {
      const need = (pc.w + qc.w) / 2 - Math.abs(p.x - q.x);
      if (need > 0) {
        const side = p.x === q.x ? (p.idx === 0 ? -1 : 1) : Math.sign(p.x - q.x);
        p.x += side * need / 2;
        q.x -= side * need / 2;
      }
    }
  }
  for (const f of s.ps) f.x = Math.max(-STAGE_HALF, Math.min(STAGE_HALF, f.x));
  if (!skip) {
    const pc = CHARS[p.char];
    const qc = CHARS[q.char];
    const yOverlap = p.y < q.y + qc.h * 0.8 && q.y < p.y + pc.h * 0.8;
    const need = (pc.w + qc.w) / 2 - Math.abs(p.x - q.x);
    if (yOverlap && need > 0) {
      const inner = Math.abs(p.x) === STAGE_HALF ? q : p;
      const outer = inner === p ? q : p;
      inner.x += Math.sign(inner.x - outer.x || 1) * need;
    }
  }
  const sep = Math.abs(p.x - q.x);
  if (sep > MAX_SEP) {
    const over = (sep - MAX_SEP) / 2;
    const dir = Math.sign(p.x - q.x);
    p.x -= dir * over;
    q.x += dir * over;
  }
  for (const f of s.ps) f.x = Math.max(-STAGE_HALF, Math.min(STAGE_HALF, f.x));
}

function updatePhase(s) {
  const [p, q] = s.ps;
  s.phaseF++;
  if (s.phase === 'intro') {
    if (s.phaseF === 1) emit(s, { t: 'round', n: s.round });
    if (s.phaseF === 72) emit(s, { t: 'fight' });
    if (s.phaseF >= 90) { s.phase = 'fight'; s.phaseF = 0; }
    return;
  }
  if (s.phase === 'fight') {
    if (!s.training) {
      s.time--;
      const ko = p.hp <= 0 || q.hp <= 0;
      if (ko || s.time <= 0) {
        s.timeUp = !ko;
        s.phase = 'ko';
        s.phaseF = 0;
        if (p.hp === q.hp) s.winner = -1;
        else s.winner = p.hp > q.hp ? 0 : 1;
        emit(s, { t: ko ? 'ko' : 'timeup', winner: s.winner });
      }
    } else {
      for (const f of s.ps) {
        const calm = NEUTRAL.has(f.st);
        f.idleF = calm ? f.idleF + 1 : 0;
        if (f.idleF > 45) f.hp = CHARS[f.char].hp;
        f.meter = METER_MAX;
      }
    }
    return;
  }
  if (s.phase === 'ko') {
    if (s.phaseF === 120 && s.winner >= 0) {
      const w = s.ps[s.winner];
      w.wins++;
      emit(s, { t: 'roundWin', winner: s.winner });
    }
    if (s.phaseF >= 130 && s.winner >= 0) {
      const w = s.ps[s.winner];
      if (NEUTRAL.has(w.st)) { w.st = 'win'; w.f = 0; w.vx = 0; }
    }
    if (s.phaseF >= 210) {
      const done = p.wins >= WINS_NEEDED || q.wins >= WINS_NEEDED || s.round >= MAX_ROUNDS;
      if (done) {
        s.phase = 'over';
        s.phaseF = 0;
        s.matchWinner = p.wins === q.wins ? -1 : (p.wins > q.wins ? 0 : 1);
      } else {
        s.round++;
        placeForRound(s);
        s.phase = 'intro';
        s.phaseF = 0;
      }
    }
  }
}

// 1フレーム進める。inputs は [P1の入力, P2の入力]
export function step(s, inputs) {
  s.events = [];
  s.t++;
  const live = s.phase === 'fight';
  s.ps.forEach((p, i) => {
    recordInput(s, p, live ? inputs[i] | 0 : 0);
    if (!live) p.buf = null;
  });
  if (s.phase === 'over') return s;

  if (s.freeze > 0) {
    s.freeze--;
    return s;
  }
  // KO直後はスローモーション
  if (s.phase === 'ko' && s.phaseF < 36 && s.t % 3 !== 0) {
    s.phaseF++;
    return s;
  }

  const [p, q] = s.ps;
  updateFighter(s, p, q);
  updateFighter(s, q, p);
  pushApart(s);
  resolveMelee(s);
  updateProjectiles(s);
  if (s.phase === 'fight') updateStage(s);
  updatePhase(s);
  return s;
}

// 巻き戻し用の複製と比較用の指紋
export function cloneState(s) {
  return JSON.parse(JSON.stringify(s));
}

export function stateHash(s) {
  const text = JSON.stringify({ ...s, events: [] });
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
