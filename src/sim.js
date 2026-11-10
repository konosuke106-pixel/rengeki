// 戦闘エンジン本体。画面や時刻に一切依存せず、同じ入力なら必ず同じ結果になる。
// 状態はすべて素のオブジェクトなので複製・巻き戻しができ、将来のオンライン対戦に使える。
import {
  BTN, ATTACK_MASK, GRAVITY, STAGE_HALF, MAX_SEP, ROUND_FRAMES, WINS_NEEDED, MAX_ROUNDS,
  METER_MAX, SUPER_COST, BUFFER_FRAMES,
} from './config.js';
import { CHARS } from './characters.js';

const HIST_LEN = 32;
const POISON_TICK = 6; // 毒で1回に減る体力
const DIR_MASK = BTN.U | BTN.D | BTN.L | BTN.R;
const NEUTRAL = new Set(['idle', 'walk', 'crouch']);
const NOT_THROWABLE = new Set(['hit', 'hitair', 'block', 'down', 'getup', 'thrown', 'throwing']);

function newFighter(idx, char, palette) {
  return {
    idx, char, palette,
    x: 0, y: 0, vx: 0, vy: 0, facing: idx === 0 ? 1 : -1,
    hp: CHARS[char].hp, meter: 0,
    st: 'idle', f: 0, move: null, used: [], hit: false, blocked: false, chain: 0,
    stun: 0, hitstop: 0, inv: 0, throwInv: 0, landT: 0, jumps: 0, noAct: false,
    kd: false, bounce: false, wallB: false, crouching: false, jumpDir: 0, dashDir: 0,
    armorUsed: false, thrownBy: -1, frozen: 0, chargeF: 0, poison: 0,
    comboHits: 0, comboDmg: 0, idleF: 0,
    hist: new Array(HIST_LEN).fill(0), edge: 0, buf: null,
    lastTap: null, dashBit: 0, dashT: -99,
    wins: 0, stats: { dmg: 0, maxCombo: 0, hits: 0, supers: 0 },
  };
}

export function createMatch({ p1 = 'kagari', p2 = 'goutetsu', training = false } = {}) {
  const s = {
    t: 0, phase: 'intro', phaseF: 0, round: 1, time: ROUND_FRAMES, training,
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
      wallB: false, crouching: false, armorUsed: false, thrownBy: -1, frozen: 0, chargeF: 0, poison: 0, comboHits: 0, comboDmg: 0, idleF: 0, buf: null,
    });
  });
  s.projs = [];
  s.time = ROUND_FRAMES;
  s.winner = -1;
  s.timeUp = false;
  s.freeze = 0;
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
}

function groundNeutral(s, p, o) {
  const ch = CHARS[p.char];
  faceOpponent(p, o);
  const mask = current(p);
  if (tryMove(s, p, null)) return;
  // 技や着地の硬直が終わる直前に入れたダッシュも出るよう、少し猶予を持たせる
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
    p.vx = p.facing * ch.walk;
  } else if (mask & backBit(p)) {
    if (p.st !== 'walk') p.f = 0;
    p.st = 'walk';
    p.vx = -p.facing * ch.back;
  } else {
    if (p.st !== 'idle') p.f = 0;
    p.st = 'idle';
    p.vx *= 0.6;
  }
}

function landed(s, p) {
  p.y = 0;
  p.vy = 0;
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
    if (c >= 0.99) { sp.launch = 14; sp.kd = true; }
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
  if (m.charge && p.f === m.charge.at && (current(p) & BTN.S) && p.chargeF < m.charge.max) {
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
  if (m.spawn) {
    for (const sp of m.spawn) if (p.f === sp.f) spawnProjectile(s, p, o, sp);
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
  p.f++;
  if (p.inv > 0) p.inv--;
  if (p.throwInv > 0) p.throwInv--;
  const ch = CHARS[p.char];
  const mask = current(p);

  switch (p.st) {
    case 'idle':
    case 'walk':
    case 'crouch':
      groundNeutral(s, p, o);
      break;
    case 'squat':
      if (p.f >= 4) {
        launchJump(p, p.jumpDir);
        emit(s, { t: 'jump', x: p.x, by: p.idx });
      }
      break;
    case 'land':
      p.vx *= 0.6;
      if (p.f >= p.landT) toAfterMove(p);
      break;
    case 'dash': {
      const backDash = p.dashDir !== p.facing;
      const total = backDash ? ch.dashF + 4 : ch.dashF;
      p.vx = p.dashDir * ch.dash * (p.f < total * 0.7 ? 1 : 0.4);
      if (!backDash && p.f > 6 && tryMove(s, p, null)) break;
      if (p.f >= total) toAfterMove(p);
      break;
    }
    case 'air':
      if (!p.noAct && tryMove(s, p, null)) break;
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
      const am = moveOf(a);
      p.x = a.x + a.facing * 62;
      p.y = Math.min(70, p.f * 5);
      p.inv = 2;
      const canTech = am && !am.boxes[0].noTech && p.f <= 10;
      if (canTech && p.edge & BTN.T) techThrow(s, a, p);
      break;
    }
    case 'hit':
      p.stun--;
      if (p.frozen > 0) p.frozen--;
      p.vx *= 0.86;
      if (p.stun <= 0) toNeutral(p);
      break;
    case 'block':
      p.stun--;
      p.vx *= 0.86;
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
    const g = p.st === 'hitair' ? GRAVITY + Math.min(0.5, p.comboHits * 0.025) : GRAVITY;
    p.vy -= g;
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
    if (p.st !== 'walk' && p.st !== 'dash') {
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

function canBlock(d, attackerX, lv) {
  if (!(NEUTRAL.has(d.st) || d.st === 'block') || d.y > 0) return false;
  const mask = current(d);
  const away = attackerX > d.x ? BTN.L : BTN.R;
  if (!(mask & away)) return false;
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

function applyHit(s, a, d, hb, at, counter, isProj) {
  if (tryParry(s, a, d, at, isProj)) return;
  const dir = isProj && isProj.dir ? isProj.dir : a.facing;
  const originX = isProj ? isProj.x : a.x;
  if (canBlock(d, originX, hb.lv)) {
    d.st = 'block';
    d.f = 0;
    d.stun = hb.block || 12;
    d.vx = dir * Math.max(3.5, hb.kb || 3);
    d.crouching = !!(current(d) & BTN.D);
    const hs = Math.max(4, (hb.hs || 6) - 2);
    d.hitstop = hs;
    if (hb.chip) {
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
    q.x += q.vx;
    q.y += q.vy;
    if (q.y < 0 && q.vy < 0) q.life = 0;
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
    q.life = 0;
    const counter = d.st === 'attack';
    const at = { x: (q.x + d.x) / 2, y: Math.min(q.y + q.h / 2, d.y + 130) };
    const dir = q.vx > 0 ? 1 : q.vx < 0 ? -1 : (d.x >= q.x ? 1 : -1);
    applyHit(s, a, d, q.data, at, counter, { dir, x: q.x });
  }
  s.projs = s.projs.filter((q) => q.life > 0);
}

function pushApart(s) {
  const [p, q] = s.ps;
  const pm = moveOf(p);
  const qm = moveOf(q);
  const skip = p.st === 'thrown' || q.st === 'thrown' || (pm && pm.noPush && p.f <= pm.total) || (qm && qm.noPush && q.f <= qm.total);
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
