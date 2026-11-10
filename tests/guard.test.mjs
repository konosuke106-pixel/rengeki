// ガードボタンとジャストガードのテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step } from '../src/sim.js';
import { BTN, JUST_WINDOW, STAGGER } from '../src/config.js';
import { CHARS } from '../src/characters.js';

function ready(p1 = 'kagari', p2 = 'kagari', gap = 90) {
  const s = createMatch({ p1, p2 });
  for (let i = 0; i < 91; i++) step(s, [0, 0]);
  s.ps[0].x = -gap / 2;
  s.ps[1].x = gap / 2;
  return s;
}

// P1 が弱攻撃。P2 は「攻撃の何コマ後にガードを押し始めるか」を guardAt で指定（負なら前から押している）
function jabVsGuard(guardAt, p2Char = 'kagari') {
  const s = ready('kagari', p2Char);
  if (guardAt < 0) for (let i = 0; i < -guardAt; i++) step(s, [0, BTN.G]);
  const events = [];
  for (let i = 0; i < 30; i++) {
    const g = guardAt < 0 || i >= guardAt ? BTN.G : 0;
    step(s, [i < 2 ? BTN.A : 0, g]);
    events.push(...s.events);
    if (events.some((e) => e.t === 'justGuard' || e.t === 'block' || e.t === 'hit')) break;
  }
  return { s, events };
}

test('後ろを押すだけではガードにならず、ガードボタンで防げる', () => {
  const back = ready();
  for (let i = 0; i < 12; i++) step(back, [i < 2 ? BTN.A : 0, BTN.R]);
  assert.ok(back.ps[1].hp < CHARS.kagari.hp, '後ろを押しても当たる');

  const { s } = jabVsGuard(-12);
  assert.equal(s.ps[1].hp, CHARS.kagari.hp, 'ガードボタンで防げる');
});

test('ガードボタンを押している間は、その場で構えて歩かない・跳ばない', () => {
  const s = ready('kagari', 'kagari', 400);
  const x0 = s.ps[0].x;
  step(s, [BTN.G, 0]); // 先にガードを押す（右を押しながら押し始めると回避になる）
  for (let i = 0; i < 30; i++) step(s, [BTN.G | BTN.R | (i === 10 ? BTN.U : 0), 0]);
  assert.equal(s.ps[0].st, 'guard');
  assert.ok(Math.abs(s.ps[0].x - x0) < 1, '歩かない');
  assert.equal(s.ps[0].y, 0, '跳ばない');
  step(s, [BTN.G | BTN.D, 0]);
  assert.ok(s.ps[0].crouching, '下も押すとしゃがんで構える');
});

test('ガード中でも攻撃ボタンで攻撃は出せる', () => {
  const s = ready();
  for (let i = 0; i < 5; i++) step(s, [BTN.G, 0]);
  step(s, [BTN.G | BTN.A, 0]);
  assert.equal(s.ps[0].st, 'attack');
});

test('ジャストガード：当たる直前に押し始めると、削られず、殴った相手がよろける', () => {
  // 弱攻撃は6コマ目に当たる。その3コマ前に押し始める
  const { s, events } = jabVsGuard(3, 'goutetsu');
  assert.ok(events.some((e) => e.t === 'justGuard'), 'ジャストガードになった');
  assert.ok(events.some((e) => e.t === 'stagger'), '相手がよろけた');
  assert.equal(s.ps[1].hp, CHARS.goutetsu.hp, '削られない');
  assert.equal(s.ps[0].st, 'hit', '殴った側はのけぞり状態');
  assert.ok(s.ps[0].stun >= STAGGER - 2, `よろけの長さ ${s.ps[0].stun}`);
});

test('ジャストガードのあとは、よろけている相手に反撃が間に合う', () => {
  const { s } = jabVsGuard(3);
  for (let i = 0; i < 8 && s.ps[1].st !== 'idle' && s.ps[1].st !== 'guard'; i++) step(s, [0, BTN.G]);
  step(s, [0, BTN.A]);
  step(s, [0, BTN.A]);
  for (let i = 0; i < 10; i++) step(s, [0, 0]);
  assert.ok(s.ps[0].hp < CHARS.kagari.hp, '反撃が当たった');
});

test('早く押しすぎると普通のガード（相手はよろけない）', () => {
  const { s, events } = jabVsGuard(-12);
  assert.ok(events.some((e) => e.t === 'block'), '普通のガード');
  assert.ok(!events.some((e) => e.t === 'justGuard'));
  assert.notEqual(s.ps[0].st, 'hit', '殴った側はよろけない');
});

test(`ジャストガードの受付は ${JUST_WINDOW} コマ以内`, () => {
  // 弱攻撃は押してから6コマ目に当たる
  const ok = jabVsGuard(6 - JUST_WINDOW).events.some((e) => e.t === 'justGuard');
  const late = jabVsGuard(6 - JUST_WINDOW - 2).events.some((e) => e.t === 'justGuard');
  assert.ok(ok, '受付の中ならジャスト');
  assert.ok(!late, '受付より早いと普通のガード');
});

test('飛び道具をジャストガードすると削られないが、撃った相手は遠いのでよろけない', () => {
  const s = ready('kagari', 'kagari', 400);
  step(s, [BTN.S, 0]);
  step(s, [BTN.S, 0]);
  let just = false;
  for (let i = 0; i < 60 && !just; i++) {
    const q = s.projs[0];
    const near = q && Math.abs(q.x - s.ps[1].x) < 70;
    step(s, [0, near ? BTN.G : 0]);
    just = s.events.some((e) => e.t === 'justGuard');
  }
  assert.ok(just, 'ジャストガードになった');
  assert.equal(s.ps[1].hp, CHARS.kagari.hp, '削られない');
  assert.notEqual(s.ps[0].st, 'hit', '撃った側はよろけない');
});

test('1回の押し始めでジャストになるのは1回だけ（すぐ続く2発目は普通のガード）', () => {
  const s = ready('kagari', 'kagari', 400);
  step(s, [0, BTN.G]);
  const shot = () => s.projs.push({ owner: 0, x: s.ps[1].x - 20, y: 60, vx: 1, vy: 0, w: 40, h: 60, life: 5, age: 0, kind: 'fire', data: { dmg: 30, stun: 12, block: 8, kb: 1, lv: 'm', hs: 2, chip: 5 } });
  const events = [];
  shot();
  step(s, [0, BTN.G]);
  events.push(...s.events);
  shot();
  for (let i = 0; i < 4; i++) { step(s, [0, BTN.G]); events.push(...s.events); }
  assert.equal(events.filter((e) => e.t === 'block' || e.t === 'justGuard').length, 2, '2発とも防いだ');
  assert.equal(events.filter((e) => e.t === 'justGuard').length, 1, 'ジャストは1回だけ');
});

test('ガード中は振り向かない。背中からの攻撃は防げない', () => {
  const s = ready('kagari', 'kagari', 90);
  for (let i = 0; i < 12; i++) step(s, [0, BTN.G]);
  // 攻撃する側を、ガードしている相手の背中側へ移す
  s.ps[0].x = s.ps[1].x + 80;
  s.ps[0].facing = -1;
  step(s, [0, BTN.G]);
  assert.equal(s.ps[1].facing, -1, 'ガード中は向きが変わらない');
  for (let i = 0; i < 12; i++) step(s, [i < 2 ? BTN.A : 0, BTN.G]);
  assert.ok(s.ps[1].hp < CHARS.kagari.hp, '背中からは当たる');
});
