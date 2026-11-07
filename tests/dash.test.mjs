import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step, activeBoxes } from '../src/sim.js';
import { flickBit } from '../src/input.js';
import { BTN } from '../src/config.js';

function fightReady() {
  const s = createMatch({ p1: 'kagari', p2: 'kagari', training: true });
  let guard = 0;
  while (s.phase !== 'fight' && guard++ < 600) step(s, [0, 0]);
  return s;
}

test('はじき判定：速く大きく横へ動かした時だけダッシュになる', () => {
  assert.equal(flickBit(40, 0, 50), BTN.R, '素早く右');
  assert.equal(flickBit(-40, 5, 50), BTN.L, '素早く左');
  assert.equal(flickBit(40, 0, 200), 0, 'ゆっくり倒すのは歩き');
  assert.equal(flickBit(20, 0, 50), 0, '動きが小さい');
  assert.equal(flickBit(30, 30, 50), 0, '斜めはダッシュにしない');
  assert.equal(flickBit(30, 0, 120, true), BTN.R, 'はじいてすぐ離す');
  assert.equal(flickBit(30, 0, 300, true), 0, 'ゆっくり離すのは違う');
});

test('はじいた時の入力（方向・なし・方向）で前と後ろのダッシュが出る', () => {
  for (const [bit, forward] of [[BTN.R, true], [BTN.L, false]]) {
    const s = fightReady();
    for (const m of [bit, 0, bit]) step(s, [m, 0]);
    step(s, [bit, 0]);
    const p = s.ps[0];
    assert.equal(p.st, 'dash');
    assert.equal(p.dashDir === p.facing, forward);
    assert.equal(p.inv > 0, !forward, '無敵は後ろダッシュだけ');
  }
});

test('攻撃の硬直が終わる6コマ前に入れたダッシュも、硬直が明けると出る', () => {
  const probe = fightReady();
  step(probe, [BTN.A, 0]);
  let length = 0;
  while (probe.ps[0].st === 'attack' && length < 120) {
    step(probe, [0, 0]);
    length++;
  }
  assert.ok(length > 10, '空振りの全長を測れている');

  const s = fightReady();
  step(s, [BTN.A, 0]);
  for (let f = 0; f < length - 8; f++) step(s, [0, 0]);
  assert.equal(s.ps[0].st, 'attack');
  for (const m of [BTN.L, 0, BTN.L]) step(s, [m, 0]);
  let dashed = false;
  for (let f = 0; f < 12 && !dashed; f++) {
    step(s, [0, 0]);
    dashed = s.ps[0].st === 'dash';
  }
  assert.ok(dashed, 'ダッシュが出る');
});

// 距離で避けた扱いにならないよう、毎コマ相手の目の前に置き直して無敵だけを確かめる
function holdInRange(s) {
  s.ps[0].x = s.ps[1].x - 80;
}

test('後ろダッシュの無敵中（残り4〜2コマ）に重なった攻撃をすり抜ける', () => {
  const control = fightReady();
  holdInRange(control);
  for (let f = 0; f < 40; f++) {
    step(control, [0, f === 4 ? BTN.A : 0]);
    holdInRange(control);
  }
  assert.ok(control.ps[1].stats.hits > 0, '何もしなければ当たる距離');

  const s = fightReady();
  holdInRange(s);
  for (const m of [BTN.L, 0, BTN.L]) step(s, [m, 0]);
  step(s, [BTN.L, 0]);
  holdInRange(s);
  assert.equal(s.ps[0].st, 'dash');
  // ダッシュと同時に相手が弱攻撃を出す。攻撃の判定は8〜10コマ目に出る
  let invAtActive = -1;
  for (let f = 0; f < 11; f++) {
    step(s, [BTN.L, f === 0 ? BTN.A : 0]);
    holdInRange(s);
    if (invAtActive < 0 && activeBoxes(s.ps[1]).length) invAtActive = s.ps[0].inv;
  }
  assert.ok(invAtActive > 0, `攻撃が出た瞬間はまだ無敵（残り ${invAtActive}）`);
  assert.equal(s.ps[1].stats.hits, 0, '当たらない');
});
