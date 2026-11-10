// 回避（左右を押しながらガード）のテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step } from '../src/sim.js';
import { BTN, EVADE_TOTAL } from '../src/config.js';
import { CHARS } from '../src/characters.js';

function ready(gap = 200) {
  const s = createMatch({ p1: 'kagari', p2: 'kagari' });
  for (let i = 0; i < 91; i++) step(s, [0, 0]);
  s.ps[0].x = -gap / 2;
  s.ps[1].x = gap / 2;
  return s;
}

test('左右を押しながらガードを押すと、その方向へ転がる', () => {
  for (const [dir, sign] of [[BTN.R, 1], [BTN.L, -1]]) {
    const s = ready(400);
    const x0 = s.ps[0].x;
    step(s, [dir, 0]);
    step(s, [dir | BTN.G, 0]);
    assert.equal(s.ps[0].st, 'evade');
    for (let i = 0; i < 20; i++) step(s, [dir | BTN.G, 0]);
    // 歩き（21コマで約126）より遠くまで転がる
    assert.ok((s.ps[0].x - x0) * sign > 140, `転がった距離 ${Math.round(s.ps[0].x - x0)}`);
    assert.ok(s.events.length >= 0);
  }
});

test('方向を押さずにガードを押すと、これまでどおりその場でガード', () => {
  const s = ready();
  step(s, [BTN.G, 0]);
  assert.equal(s.ps[0].st, 'guard');
});

test('ガードを押したまま左右を押しても回避にはならない（構えたまま）', () => {
  const s = ready();
  for (let i = 0; i < 5; i++) step(s, [BTN.G, 0]);
  for (let i = 0; i < 10; i++) step(s, [BTN.G | BTN.R, 0]);
  assert.equal(s.ps[0].st, 'guard');
});

test('回避の出始めは攻撃をすり抜け、終わり際は当たる', () => {
  // 相手の弱攻撃（6コマ目に当たる）と同時に回避。相手の目の前に置き直して距離では避けられないようにする
  const s = ready(80);
  step(s, [BTN.L, 0]);
  for (let i = 0; i < 12; i++) {
    step(s, [i === 0 ? BTN.L | BTN.G : BTN.L, i < 2 ? BTN.A : 0]);
    s.ps[0].x = s.ps[1].x - 80;
  }
  assert.equal(s.ps[0].hp, CHARS.kagari.hp, 'すり抜けた');

  // 回避の終わり際（すり抜けが切れた後）に重なる攻撃は当たる
  const late = ready(80);
  step(late, [BTN.L, 0]);
  step(late, [BTN.L | BTN.G, 0]);
  for (let i = 0; i < 16; i++) { step(late, [BTN.L, 0]); late.ps[0].x = late.ps[1].x - 80; }
  for (let i = 0; i < 10; i++) { step(late, [0, i < 2 ? BTN.A : 0]); late.ps[0].x = late.ps[1].x - 80; }
  assert.ok(late.ps[0].hp < CHARS.kagari.hp, '終わり際は当たる');
});

test('前へ回避すると相手をすり抜けて背後に回れる', () => {
  const s = ready(120);
  step(s, [BTN.R, 0]);
  step(s, [BTN.R | BTN.G, 0]);
  for (let i = 0; i < EVADE_TOTAL; i++) step(s, [BTN.R, 0]);
  assert.ok(s.ps[0].x > s.ps[1].x, `相手の向こう側に出た ${Math.round(s.ps[0].x)} > ${Math.round(s.ps[1].x)}`);
});

test('回避は決まった長さで終わり、また動けるようになる', () => {
  const s = ready(400);
  step(s, [BTN.R, 0]);
  step(s, [BTN.R | BTN.G, 0]);
  for (let i = 0; i < EVADE_TOTAL + 2; i++) step(s, [0, 0]);
  assert.notEqual(s.ps[0].st, 'evade');
});

test('回避した時はジャストガードにならない', () => {
  const s = ready(80);
  const events = [];
  for (let i = 0; i < 12; i++) {
    step(s, [i < 2 ? BTN.A : 0, i === 3 ? BTN.R | BTN.G : i > 3 ? BTN.R : 0]);
    events.push(...s.events);
  }
  assert.ok(!events.some((e) => e.t === 'justGuard'));
  assert.ok(events.some((e) => e.t === 'evade'));
});
