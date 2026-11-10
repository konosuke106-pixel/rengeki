// 見つかったバグがもう起きないことを確かめるテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step } from '../src/sim.js';
import { BTN } from '../src/config.js';

function ready(p1, p2, gap = 90) {
  const s = createMatch({ p1, p2 });
  for (let i = 0; i < 91; i++) step(s, [0, 0]);
  s.ps[0].x = -gap / 2;
  s.ps[1].x = gap / 2;
  return s;
}

// 掴まれるまで進める
function grab(s, mask) {
  step(s, [mask, 0]);
  step(s, [mask, 0]);
  for (let i = 0; i < 20 && s.ps[1].st !== 'thrown'; i++) step(s, [0, 0]);
  assert.equal(s.ps[1].st, 'thrown', '掴んだ');
}

// 投げられていた側が地面に戻り、また動けるようになるまで待つ
function recovers(s, max = 120) {
  for (let i = 0; i < max; i++) {
    step(s, [0, 0]);
    const d = s.ps[1];
    if (d.y === 0 && (d.st === 'idle' || d.st === 'land' || d.st === 'crouch' || d.st === 'walk' || d.st === 'down' || d.st === 'getup')) return true;
  }
  return false;
}

test('投げの途中で投げた側が飛び道具に当たると、投げられていた側は空中で固まらずに降りてくる', () => {
  const s = ready('goutetsu', 'kagari');
  grab(s, BTN.R | BTN.S);
  run(s, 3);
  // 相手（投げられている側）の飛び道具が、投げている側に当たる
  s.projs.push({ owner: 1, x: s.ps[0].x, y: 60, vx: 0, vy: 0, w: 80, h: 120, life: 5, age: 0, kind: 'fire', data: { dmg: 20, stun: 12, kb: 1, lv: 'm', hs: 4 } });
  step(s, [0, 0]);
  assert.notEqual(s.ps[0].st, 'throwing', '投げが中断された');
  assert.ok(recovers(s), `投げられていた側が戻った（st=${s.ps[1].st} y=${s.ps[1].y}）`);
});

test('投げの途中で投げた側に付いた爆弾が爆発しても、固まらない', () => {
  const s = ready('goutetsu', 'haze');
  grab(s, BTN.R | BTN.S);
  s.ps[0].bombT = 3;
  s.ps[0].bombBy = 1;
  for (let i = 0; i < 10; i++) step(s, [0, 0]);
  assert.notEqual(s.ps[0].st, 'throwing', '爆発で投げが中断された');
  assert.ok(recovers(s), `投げられていた側が戻った（st=${s.ps[1].st} y=${s.ps[1].y}）`);
});

test('普通の投げは、これまでどおり最後まで決まる', () => {
  const s = ready('kagari', 'kagari');
  grab(s, BTN.T);
  for (let i = 0; i < 60; i++) step(s, [0, 0]);
  assert.ok(s.ps[1].hp < 1000, '投げが決まった');
});

test('でたらめな操作を続けても、止まったり固まったりしない（全キャラ・ギミックあり）', async () => {
  const { CHAR_IDS } = await import('../src/characters.js');
  const { STAGE_IDS } = await import('../src/stages.js');
  let seed = 12345;
  const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
  const gen = () => {
    let hold = 0;
    let t = 0;
    return () => {
      if (t-- <= 0) { t = Math.floor(rnd() * 20); hold = rnd() < 0.4 ? [1, 2, 4, 8, 9, 5][Math.floor(rnd() * 6)] : 0; }
      return hold | (rnd() < 0.2 ? [16, 32, 64, 128, 256, 512, 1024][Math.floor(rnd() * 7)] : 0) | (rnd() < 0.1 ? 1024 : 0);
    };
  };
  CHAR_IDS.forEach((a, k) => {
    for (const b of [CHAR_IDS[(k + 3) % CHAR_IDS.length], CHAR_IDS[(k + 7) % CHAR_IDS.length], 'goutetsu', 'hami']) {
      const s = createMatch({ p1: a, p2: b, stage: STAGE_IDS[(k * 5) % STAGE_IDS.length], gimmicks: true });
      const ga = gen();
      const gb = gen();
      const thrownFor = [0, 0];
      for (let f = 0; f < 2500; f++) {
        if (f % 500 === 0) s.ps.forEach((p) => { p.meter = 200; });
        step(s, [ga(), gb()]);
        s.ps.forEach((p, i) => {
          assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.hp) && p.y >= 0, `${a} vs ${b} 数値異常`);
          thrownFor[i] = p.st === 'thrown' ? thrownFor[i] + 1 : 0;
          assert.ok(thrownFor[i] < 120, `${p.char} が投げられたまま固まった（${a} vs ${b}）`);
        });
      }
    }
  });
});

function run(s, n) {
  for (let i = 0; i < n; i++) step(s, [0, 0]);
}
