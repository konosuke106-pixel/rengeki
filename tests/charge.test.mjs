// 溜め強（全キャラ）とツヅミの最大溜め（ガード貫通）のテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step } from '../src/sim.js';
import { BTN, STAGGER } from '../src/config.js';
import { CHAR_IDS, CHARS } from '../src/characters.js';

function ready(p1 = 'kagari', p2 = 'kagari', gap = 90) {
  const s = createMatch({ p1, p2 });
  for (let i = 0; i < 91; i++) step(s, [0, 0]);
  s.ps[0].x = -gap / 2;
  s.ps[1].x = gap / 2;
  return s;
}

// 強ボタンを hold コマ押し続けて離し、当たり終わるまで進める。相手は guard（押しっぱなしの入力）
function heavy(p1, hold, guard = 0, guardEarly = 14) {
  const s = ready(p1, 'kagari');
  for (let i = 0; i < guardEarly; i++) step(s, [0, guard]);
  const events = [];
  let maxCharge = 0;
  for (let i = 0; i < hold + 50; i++) {
    step(s, [i < hold ? BTN.C : 0, guard]);
    events.push(...s.events);
    maxCharge = Math.max(maxCharge, s.ps[0].chargeF);
  }
  return { s, events, maxCharge, dmg: CHARS.kagari.hp - s.ps[1].hp };
}

test('全キャラ：強をちょんと押すと普通の強攻撃、押し続けると溜めて重くなる', () => {
  for (const id of CHAR_IDS) {
    const tap = heavy(id, 2);
    const full = heavy(id, 80);
    assert.equal(tap.maxCharge, 0, `${id} ちょん押しでは溜まらない`);
    assert.ok(tap.dmg > 0, `${id} ちょん押しも当たる`);
    assert.equal(full.maxCharge, CHARS[id].moves.sH.charge.max, `${id} 最大まで溜まる`);
    assert.ok(full.events.some((e) => e.t === 'chargeMax'), `${id} 最大の合図`);
    assert.ok(full.dmg >= tap.dmg * 1.6, `${id} ダメージ ${tap.dmg} → ${full.dmg}`);
  }
});

test('溜めの途中で離すと、その分だけ重くなる', () => {
  const tap = heavy('kagari', 2).dmg;
  const half = heavy('kagari', 8 + 30).dmg;
  const full = heavy('kagari', 80).dmg;
  assert.ok(half > tap && half < full, `${tap} < ${half} < ${full}`);
});

test('押しっぱなしでも最大まで溜まったら自動で放ち、固まらない', () => {
  const s = ready('kagari', 'kagari', 400);
  for (let i = 0; i < 200; i++) step(s, [BTN.C, 0]);
  assert.notEqual(s.ps[0].move, 'sH', '技は終わっている');
});

test('最大まで溜めた強攻撃はガードを崩し、相手がよろける（ダメージはなし）', () => {
  const { s, events, dmg } = (() => {
    const r = heavy('kagari', 80, BTN.G);
    return r;
  })();
  assert.ok(events.some((e) => e.t === 'guardCrush'), 'ガード崩し');
  assert.equal(dmg, 0, 'ダメージはなし');
  // 崩した直後は相手がよろけている
  const s2 = ready('kagari', 'kagari');
  for (let i = 0; i < 14; i++) step(s2, [0, BTN.G]);
  let crushed = false;
  for (let i = 0; i < 100 && !crushed; i++) {
    step(s2, [i < 80 ? BTN.C : 0, BTN.G]);
    crushed = s2.events.some((e) => e.t === 'guardCrush');
  }
  assert.ok(crushed);
  assert.equal(s2.ps[1].st, 'hit', 'よろけている');
  assert.ok(s2.ps[1].stun >= STAGGER - 2, `よろけの長さ ${s2.ps[1].stun}`);
  void s;
});

test('途中までの溜めなら普通にガードできる', () => {
  const { events, dmg } = heavy('kagari', 8 + 30, BTN.G);
  assert.ok(events.some((e) => e.t === 'block'));
  assert.ok(!events.some((e) => e.t === 'guardCrush'));
  assert.equal(dmg, 0);
});

test('最大溜めでも、ジャストガードされると負け（殴った側がよろける）', () => {
  const s = ready('kagari', 'kagari');
  const events = [];
  // 溜めを離してから当たるまでの間に、ガードを押し始める
  for (let i = 0; i < 110; i++) {
    const p = s.ps[0];
    const swinging = p.move === 'sH' && p.chargeF >= 60 && p.f >= 9;
    step(s, [i < 80 ? BTN.C : 0, swinging ? BTN.G : 0]);
    events.push(...s.events);
  }
  assert.ok(events.some((e) => e.t === 'justGuard'), 'ジャストガード');
  assert.ok(!events.some((e) => e.t === 'guardCrush'), '崩されない');
  assert.ok(events.some((e) => e.t === 'stagger' && e.by === 0), '殴った側がよろけた');
});

// ツヅミの衝撃波。hold コマ必殺を押し続け、相手は guardEarly コマ前からガードを押しっぱなし
function wave(hold, guard) {
  const s = ready('tsuzumi', 'kagari', 300);
  for (let i = 0; i < 14; i++) step(s, [0, guard]);
  const events = [];
  for (let i = 0; i < hold + 80; i++) {
    step(s, [i < hold ? BTN.S : 0, guard]);
    events.push(...s.events);
  }
  return { events, dmg: CHARS.kagari.hp - s.ps[1].hp };
}

test('ツヅミ：最大まで溜めた衝撃波はガードを貫通する', () => {
  const full = wave(90, BTN.G);
  assert.ok(full.dmg > 100, `ガードしていても当たる ${full.dmg}`);
  assert.ok(!full.events.some((e) => e.t === 'block'));
});

test('ツヅミ：途中までの溜めならガードできる', () => {
  const half = wave(8 + 35, BTN.G);
  assert.ok(half.events.some((e) => e.t === 'block'), 'ガードした');
  assert.ok(half.dmg < 20, `削りだけ ${half.dmg}`);
});

test('ツヅミ：最大溜めはジャストガードでも防げない', () => {
  const s = ready('tsuzumi', 'kagari', 300);
  let hit = false;
  for (let i = 0; i < 200 && !hit; i++) {
    const q = s.projs[0];
    const near = q && Math.abs(q.x - s.ps[1].x) < 120;
    step(s, [i < 90 ? BTN.S : 0, near ? BTN.G : 0]);
    hit = s.ps[1].hp < CHARS.kagari.hp;
  }
  assert.ok(hit, 'ジャストのタイミングでも当たる');
});
