// CPU とトレーニング用ダミー。プレイヤーと同じ「入力」だけを作って操作する。
import { BTN } from './config.js';
import { CHARS } from './characters.js';
import { moveOf } from './sim.js';

const LEVELS = {
  easy: { react: 26, block: 0.25, combo: 0.35, antiAir: 0.1, aggression: 0.35, super: 0.2 },
  normal: { react: 15, block: 0.55, combo: 0.72, antiAir: 0.4, aggression: 0.55, super: 0.6 },
  hard: { react: 7, block: 0.85, combo: 0.95, antiAir: 0.8, aggression: 0.72, super: 1 },
};

const COMBO_ORDER = [BTN.A, BTN.B, BTN.C, BTN.S];

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
    if (threat && (me.st === 'idle' || me.st === 'walk' || me.st === 'crouch' || me.st === 'block')) {
      if (me.st === 'block' || rand() < lv.block / 6) {
        const firstBox = opMove && opMove.boxes[0];
        const low = firstBox ? firstBox.lv === 'l' : false;
        hold = back | (low ? BTN.D : 0);
        holdT = 12;
        wait = Math.max(wait, 6);
      }
    }
    if (me.st === 'block') return hold | back;

    if (wait > 0 || (me.st !== 'idle' && me.st !== 'walk' && me.st !== 'crouch')) {
      if (me.st === 'air' && dist < 150 && op.y < me.y + 60 && rand() < 0.12) return BTN.B | hold;
      return hold;
    }

    // 飛び込みへの対空
    if (op.y > 40 && dist < 220 && op.vy < 4 && rand() < lv.antiAir / 3) {
      wait = lv.react;
      return BTN.S | BTN.D;
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
      if (r < 0.8) { hold = back; holdT = 18; return hold; }
      hold = back | BTN.D; holdT = 14;
      return hold;
    }
    if (dist < 280) {
      if (r < 0.28 * lv.aggression) return BTN.C;
      if (r < 0.48 * lv.aggression) return BTN.B | BTN.D;
      if (r < 0.72) { hold = fwd; holdT = 16; return hold; }
      if (r < 0.85) { hold = BTN.U | fwd; holdT = 3; return hold; }
      hold = back; holdT = 14;
      return hold;
    }
    if (r < 0.2 && CHARS[me.char].moves.spN.spawn && !s.projs.some((q) => q.owner === idx)) return BTN.S;
    if (r < 0.75) { hold = fwd; holdT = 22; return hold; }
    if (r < 0.88) { hold = BTN.U | fwd; holdT = 3; return hold; }
    return 0;
  };
}

// 練習モードの相手。mode: stand / block / crouch / jump
export function dummyInput(s, idx, mode) {
  const me = s.ps[idx];
  const op = s.ps[1 - idx];
  if (mode === 'crouch') return BTN.D;
  if (mode === 'jump') return me.st === 'idle' ? BTN.U : 0;
  if (mode === 'block') {
    const back = op.x > me.x ? BTN.L : BTN.R;
    const m = moveOf(op);
    let low = false;
    if (m) low = m.boxes.some((b) => b.lv === 'l');
    if (s.projs.some((q) => q.owner !== idx && q.data.lv === 'l')) low = true;
    return back | (low ? BTN.D : 0);
  }
  return 0;
}
