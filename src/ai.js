// CPU とトレーニング用ダミー。プレイヤーと同じ「入力」だけを作って操作する。
import { BTN, JUST_WINDOW } from './config.js';
import { CHARS } from './characters.js';
import { moveOf } from './sim.js';

// just … 攻撃を見てから当たる直前にガードを押す（＝ジャストガードを狙う）割合
const LEVELS = {
  easy: { react: 26, block: 0.25, just: 0.05, combo: 0.35, antiAir: 0.1, aggression: 0.35, super: 0.2 },
  normal: { react: 15, block: 0.55, just: 0.25, combo: 0.72, antiAir: 0.4, aggression: 0.55, super: 0.6 },
  hard: { react: 7, block: 0.85, just: 0.55, combo: 0.95, antiAir: 0.8, aggression: 0.72, super: 1 },
};

const COMBO_ORDER = [BTN.A, BTN.B, BTN.C, BTN.S];

// キャラごとの得意技（characters.js の cpu）を、押すボタンに直す
function specialInput(key, fwd) {
  if (key === 'spD') return BTN.S | BTN.D;
  if (key === 'spF') return BTN.S | fwd;
  if (key === 'cH') return BTN.C | BTN.D;
  return BTN.S;
}

// 飛び道具・罠を出してよいか（1つだけの物はもう出ていない時、罠は上限まで）
function canZone(s, idx, move) {
  if (!move || !move.spawn) return false;
  const mine = s.projs.filter((q) => q.owner === idx);
  if (move.oneProj) return mine.length === 0;
  const sp = move.spawn[0];
  return !sp.max || mine.filter((q) => q.kind === sp.kind).length < sp.max;
}

export function createCpu(levelName = 'normal', seed = 12345) {
  const lv = LEVELS[levelName] || LEVELS.normal;
  let rng = seed >>> 0 || 1;
  const rand = () => {
    rng ^= rng << 13; rng >>>= 0;
    rng ^= rng >>> 17;
    rng ^= rng << 5; rng >>>= 0;
    return rng / 4294967296;
  };
  let hold = 0;       // 方向を押し続ける入力
  let holdT = 0;
  let press = 0;      // このフレームで押すボタン
  let wait = 0;
  let comboStep = 0;
  let lastPressF = -99;

  return function next(s, idx) {
    const me = s.ps[idx];
    const op = s.ps[1 - idx];
    if (s.phase !== 'fight') return 0;
    const dist = Math.abs(me.x - op.x);
    const fwd = op.x > me.x ? BTN.R : BTN.L;
    const back = op.x > me.x ? BTN.L : BTN.R;
    const ch = CHARS[me.char];
    const plan = ch.cpu || { antiAir: 'spD', zone: 'spN' };
    press = 0;
    if (holdT > 0) holdT--; else hold = 0;
    if (wait > 0) wait--;

    // コンボの続き：当たったら次の技を順に出す
    if (me.st === 'attack' && me.hit) {
      const m = moveOf(me);
      if (m.rank >= 1 && m.rank <= 3 && !m.air && s.t - lastPressF > 5) {
        if (rand() < lv.combo) {
          comboStep = m.rank;
          const nextBtn = COMBO_ORDER[Math.min(comboStep, 3)];
          let dir = 0;
          if (nextBtn === BTN.S) {
            const r = rand();
            dir = r < 0.4 ? BTN.D : r < 0.7 ? fwd : 0;
          }
          lastPressF = s.t;
          return nextBtn | dir;
        }
      }
      if (m.rank === 4 && me.meter >= 100 && rand() < lv.super * 0.3) {
        lastPressF = s.t;
        return BTN.X;
      }
    }
    if (me.st === 'attack' && me.y > 0 && me.hit && s.t - lastPressF > 6) {
      lastPressF = s.t;
      return moveOf(me).rank === 1 ? BTN.B : BTN.C;
    }

    // 相手の攻撃が見えたらガード
    const opMove = moveOf(op);
    const threat = (op.st === 'attack' && dist < 330) || s.projs.some((q) => q.owner !== idx && Math.abs(q.x - me.x) < 260);
    if (threat && (me.st === 'idle' || me.st === 'walk' || me.st === 'crouch' || me.st === 'guard' || me.st === 'block')) {
      // 当て身を持つキャラは、ときどき構えで受け流す
      if (plan.parry && me.st !== 'block' && op.st === 'attack' && op.f < 5 && rand() < lv.block / 5) {
        wait = lv.react;
        return BTN.S;
      }
      const firstBox = opMove && opMove.boxes[0];
      const low = firstBox ? firstBox.lv === 'l' : false;
      const guarding = me.st === 'guard' || me.st === 'block';
      // 当たる直前に押し始めるとジャストガードになる。弱いCPUほど、そのタイミングでは押さない
      const late = op.st === 'attack' && firstBox && firstBox.from - op.f <= JUST_WINDOW + 1;
      // ときどき回避（左右＋ガードの押し始め）で攻撃をすり抜ける。前に転がって背後へ回ることもある
      if (!guarding && me.st !== 'block' && rand() < lv.block / 14) {
        wait = lv.react;
        hold = 0;
        return BTN.G | (rand() < 0.6 ? back : fwd);
      }
      if (guarding || (rand() < lv.block / 6 && (!late || rand() < lv.just))) {
        hold = BTN.G | (low ? BTN.D : 0);
        holdT = 12;
        wait = Math.max(wait, 6);
      }
    }
    // ステージの仕掛けをよける：印から離れる、横切る物は跳ぶ、揺れる荷物の下ではしゃがむ
    const free = me.st === 'idle' || me.st === 'walk' || me.st === 'crouch';
    if (s.gimmicks && s.gim && free && rand() < lv.block + 0.2) {
      for (const h of s.gim.haz) {
        if (h.type === 'spot' && h.warn > 0 && Math.abs(h.x - me.x) < h.w / 2 + 50) {
          const away = me.x < h.x || (me.x === h.x && me.x > 0) ? BTN.L : BTN.R;
          hold = away;
          holdT = 8;
          return hold;
        }
        if (h.type === 'mover' && h.warn === 0 && Math.sign(me.x - h.x) === Math.sign(h.vx) && Math.abs(me.x - h.x) < 150 && me.y === 0) {
          return BTN.U;
        }
      }
      if (s.gim.crateX !== undefined && Math.abs(s.gim.crateX - me.x) < 160) {
        hold = BTN.D | back;
        holdT = 6;
        return hold;
      }
    }

    // ガード中の反撃（カブト）：ゲージがあればときどき使う
    if (me.st === 'block' && ch.guardCancel && me.meter >= 50 && rand() < lv.block / 10) return BTN.S | BTN.G;
    if (me.st === 'block') return (hold & BTN.D) | BTN.G;

    if (wait > 0 || (me.st !== 'idle' && me.st !== 'walk' && me.st !== 'crouch')) {
      if (me.st === 'air' && dist < 150 && op.y < me.y + 60 && rand() < 0.12) return BTN.B | hold;
      // 空から急降下（届きそうな距離で落ち始めたら）
      if (plan.dive && me.st === 'air' && op.y === 0 && me.vy < 4 && me.y > 80 && dist < me.y * 1.3 + 60 && rand() < 0.15 * lv.aggression) return BTN.S;
      return hold;
    }

    // 飛び込みへの対空
    if (op.y > 40 && dist < 220 && op.vy < 4 && rand() < lv.antiAir / 3) {
      wait = lv.react;
      return specialInput(plan.antiAir, fwd);
    }

    const r = rand();
    wait = Math.round(lv.react * (0.5 + rand()));

    // 超必殺
    if (me.meter >= 100 && dist < 300 && (op.st === 'attack' || op.st === 'idle') && r < lv.super * 0.09) {
      return BTN.X;
    }

    if (dist < 125) {
      if (r < 0.34 * lv.aggression + 0.1) return BTN.A;
      if (r < 0.5 * lv.aggression + 0.18) return BTN.B | (rand() < 0.5 ? BTN.D : 0);
      if (r < 0.6 * lv.aggression + 0.22) return BTN.T;
      // 近い時は、強いCPUほど前もってガードを固める（立ち／しゃがみ）
      if (r < 0.8) {
        hold = rand() < lv.block ? BTN.G | (rand() < 0.4 ? BTN.D : 0) : back;
        holdT = 18;
        return hold;
      }
      hold = BTN.G | BTN.D; holdT = 14;
      return hold;
    }
    if (dist < 280) {
      // 中間距離の得意技（クサリの鎖投げなど）
      if (plan.poke && dist > 150 && r < 0.18 * lv.aggression + 0.04) return specialInput(plan.poke, fwd);
      // 溜め強：ガードを固めている相手には、溜めてガード崩しを狙う
      if (op.st === 'guard' && r < 0.25 * lv.aggression) { hold = BTN.C; holdT = 45 + Math.floor(rand() * 30); return hold; }
      if (r < 0.28 * lv.aggression) return BTN.C;
      if (r < 0.48 * lv.aggression) return BTN.B | BTN.D;
      if (r < 0.72) { hold = fwd; holdT = 16; return hold; }
      if (r < 0.85) { hold = BTN.U | fwd; holdT = 3; return hold; }
      hold = rand() < lv.block ? BTN.G : back;
      holdT = 14;
      return hold;
    }
    // 下ごしらえ（マボロシの分身など）：離れていて、まだ置いていない時
    if (plan.setup && !me.clone && r < 0.25) return specialInput(plan.setup, fwd);
    if (r < 0.2 && canZone(s, idx, ch.moves[plan.zone])) return specialInput(plan.zone, fwd);
    if (r < 0.28 && plan.zone !== 'spN' && canZone(s, idx, ch.moves.spN)) return BTN.S;
    if (r < 0.32 && ch.moves.spF.warp) return BTN.S | fwd;
    if (r < 0.75) { hold = fwd; holdT = 22; return hold; }
    if (r < 0.88) { hold = BTN.U | fwd; holdT = 3; return hold; }
    return 0;
  };
}

// 練習モードの相手。mode: stand / block / crouch / jump / attack
export function dummyInput(s, idx, mode) {
  const me = s.ps[idx];
  const op = s.ps[1 - idx];
  if (mode === 'attack') {
    // ガードの練習用。近づいて、ゆっくり一定の間隔で弱攻撃を出す
    if (Math.abs(me.x - op.x) > 105) return op.x > me.x ? BTN.R : BTN.L;
    return s.t % 80 === 0 ? BTN.A : 0;
  }
  if (mode === 'crouch') return BTN.D;
  if (mode === 'jump') return me.st === 'idle' ? BTN.U : 0;
  if (mode === 'block') {
    // ガードボタンを押しっぱなし（押し始めは最初だけなので、ジャストガードにはならない）
    const m = moveOf(op);
    let low = false;
    if (m) low = m.boxes.some((b) => b.lv === 'l');
    if (s.projs.some((q) => q.owner !== idx && q.data.lv === 'l')) low = true;
    return BTN.G | (low ? BTN.D : 0);
  }
  return 0;
}
