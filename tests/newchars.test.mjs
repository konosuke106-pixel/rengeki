// 新キャラ（ライ・ハヤテ・カゲ・コガラシ）で増えた仕組みのテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step } from '../src/sim.js';
import { BTN } from '../src/config.js';
import { CHARS } from '../src/characters.js';

function ready(p1, p2 = 'kagari', gap = 90) {
  const s = createMatch({ p1, p2 });
  for (let i = 0; i < 91; i++) step(s, [0, 0]);
  s.ps[0].x = -gap / 2;
  s.ps[1].x = gap / 2;
  return s;
}

function run(s, n, p1 = 0, p2 = 0) {
  for (let i = 0; i < n; i++) step(s, [typeof p1 === 'function' ? p1(i) : p1, typeof p2 === 'function' ? p2(i) : p2]);
}

test('技の無敵時間：昇炎脚の出始めは相手の攻撃が当たらない', () => {
  // 相手の弱攻撃が出る瞬間（8コマ目）に、こちらの昇炎脚が無敵（1〜7コマ）になるよう合わせる
  const s = ready('kagari', 'kagari');
  run(s, 2, 0, BTN.A);
  run(s, 2, BTN.D | BTN.S, 0);
  run(s, 6);
  assert.equal(s.ps[1].stats.hits, 0, '相手の攻撃は当たっていない');

  const control = ready('kagari', 'kagari');
  run(control, 2, 0, BTN.A);
  run(control, 2, BTN.D, 0);
  run(control, 6);
  assert.equal(control.ps[1].stats.hits, 1, '無敵技を出さなければ当たる');
});

test('ハヤテ：空中で必殺を押すと急降下蹴りになり、しゃがみガードを崩す', () => {
  const s = ready('hayate', 'kagari', 260);
  run(s, 3, BTN.U | BTN.R);
  let used = false;
  for (let i = 0; i < 40 && !used; i++) {
    step(s, [s.ps[0].vy < 6 && s.ps[0].y > 60 ? BTN.S : 0, BTN.R | BTN.D]);
    used = s.ps[0].move === 'jS';
  }
  assert.ok(used, '空中必殺が出た');
  for (let i = 0; i < 40 && s.ps[0].y > 0; i++) step(s, [0, BTN.R | BTN.D]);
  assert.equal(s.ps[0].stats.hits, 1, 'しゃがんで防いでいる相手に当たる');
});

test('ハヤテ：地上では空中必殺は出ず、普通の必殺になる', () => {
  const s = ready('hayate', 'kagari', 400);
  run(s, 2, BTN.S);
  assert.equal(s.ps[0].move, 'spN');
});

test('ハヤテ：影走りで相手の背後に回り込み、後ろを押した相手に当たる', () => {
  const s = ready('hayate', 'kagari', 160);
  const startSide = Math.sign(s.ps[1].x - s.ps[0].x);
  run(s, 2, BTN.R | BTN.S, BTN.R);
  run(s, 12, 0, BTN.R);
  assert.equal(Math.sign(s.ps[1].x - s.ps[0].x), -startSide, '反対側に出た');
  assert.equal(s.ps[0].facing, -startSide, '相手の方を向いている');
  run(s, 10, 0, BTN.R);
  assert.equal(s.ps[0].stats.hits, 1, '元の向きでガードしていた相手に当たる');
});

test('ハヤテ：画面端の相手には回り込めず、手前に出る', () => {
  const s = ready('hayate', 'kagari', 160);
  s.ps[1].x = 820;
  s.ps[0].x = 660;
  run(s, 2, BTN.R | BTN.S);
  run(s, 12);
  assert.ok(s.ps[0].x < s.ps[1].x, '相手より手前');
  assert.ok(Math.abs(s.ps[0].x) <= 820);
});

test('カゲ：影返しの構えに攻撃すると、受け流して反撃する', () => {
  const s = ready('kage', 'kagari');
  run(s, 2, BTN.S);
  run(s, 2, 0, BTN.B);
  run(s, 40);
  assert.equal(s.ps[0].hp, CHARS.kage.hp, 'カゲは無傷');
  assert.equal(s.ps[0].stats.hits, 1, '反撃が当たった');
  assert.ok(s.ps[1].hp < CHARS.kagari.hp);
});

test('カゲ：構えが終わった後の攻撃は普通に当たる', () => {
  const s = ready('kage', 'kagari');
  run(s, 2, BTN.S);
  run(s, 24);
  run(s, 2, 0, BTN.A);
  run(s, 12);
  assert.ok(s.ps[0].hp < CHARS.kage.hp, '隙に当たる');
});

test('カゲ：影返しは投げを防げない', () => {
  const s = ready('kage', 'kagari');
  run(s, 2, BTN.S);
  run(s, 2, 0, BTN.T);
  run(s, 40);
  assert.ok(s.ps[0].hp < CHARS.kage.hp, '投げられた');
});

test('カゲ：飛び道具も受け流せる', () => {
  const s = ready('kage', 'kagari', 400);
  run(s, 2, 0, BTN.S);
  let parried = false;
  for (let i = 0; i < 60 && !parried; i++) {
    const near = s.projs.some((q) => Math.abs(q.x - s.ps[0].x) < 130);
    step(s, [near && s.ps[0].st !== 'attack' ? BTN.S : 0, 0]);
    parried = s.ps[0].move === 'cnt';
  }
  assert.ok(parried, '反撃に移った');
  assert.equal(s.ps[0].hp, CHARS.kage.hp);
});

test('コガラシ：罠は置いてすぐは効かず、少し後に踏むと凍る', () => {
  const s = ready('kogarashi', 'kagari', 400);
  run(s, 2, BTN.D | BTN.S);
  run(s, 12);
  const trap = s.projs.find((q) => q.kind === 'trap');
  assert.ok(trap, '罠が置かれた');
  // 置いた直後に相手を罠の上へ
  s.ps[1].x = trap.x;
  step(s, [0, 0]);
  assert.equal(s.ps[1].st, 'idle', 'まだ効かない');
  run(s, 30);
  assert.equal(s.ps[1].st, 'hit', '踏んだ');
  assert.ok(s.ps[1].frozen > 30, `凍っている（${s.ps[1].frozen}コマ）`);
  assert.equal(s.projs.filter((q) => q.kind === 'trap').length, 0, '踏んだ罠は消える');
});

test('コガラシ：罠は2個まで。3個目を置くと古い物が消える', () => {
  const s = ready('kogarashi', 'kagari', 900);
  s.ps[1].x = 800;
  const xs = [];
  for (let n = 0; n < 3; n++) {
    s.ps[0].x = -700 + n * 150;
    run(s, 2, BTN.D | BTN.S);
    run(s, 40);
    xs.push(s.ps[0].x + 170);
  }
  const traps = s.projs.filter((q) => q.kind === 'trap').map((q) => Math.round(q.x));
  assert.equal(traps.length, 2);
  assert.ok(!traps.includes(Math.round(xs[0])), '1個目が消えた');
});

test('コガラシ：罠は時間で消える', () => {
  const s = ready('kogarashi', 'kagari', 900);
  s.ps[1].x = 800;
  run(s, 2, BTN.D | BTN.S);
  run(s, 20);
  assert.equal(s.projs.length, 1);
  run(s, 340);
  assert.equal(s.projs.length, 0);
});

test('コガラシ：超必殺の氷牢で相手が凍り、追撃できる', () => {
  const s = ready('kogarashi', 'kagari', 240);
  s.ps[0].meter = 100;
  run(s, 2, BTN.X);
  let frozen = 0;
  for (let i = 0; i < 80; i++) {
    step(s, [0, 0]);
    frozen = Math.max(frozen, s.ps[1].frozen);
  }
  assert.ok(s.ps[0].stats.dmg >= 150, `ダメージ ${s.ps[0].stats.dmg}`);
  assert.ok(frozen > 40, '凍った');
});

test('ライ：通常技が他のキャラより遠くまで届く', () => {
  const reach = (id) => CHARS[id].moves.sH.boxes[0].box[0] + CHARS[id].moves.sH.boxes[0].box[2] / 2;
  assert.ok(reach('rai') > reach('kagari') * 1.2);
});

test('新キャラ全員：超必殺が出てダメージを与える', () => {
  for (const id of ['rai', 'hayate', 'kage', 'kogarashi']) {
    const s = ready(id, 'kagari', 140);
    s.ps[0].meter = 100;
    run(s, 2, BTN.X);
    run(s, 150);
    assert.equal(s.ps[0].stats.supers, 1, `${id} 超必殺が出た`);
    assert.ok(s.ps[0].stats.dmg >= 200, `${id} ダメージ ${s.ps[0].stats.dmg}`);
  }
});

test('全キャラの技データ：判定のコマが技の長さに収まっている', () => {
  for (const ch of Object.values(CHARS)) {
    for (const m of Object.values(ch.moves)) {
      for (const b of m.boxes) {
        assert.ok(b.from >= 1 && b.to >= b.from, `${ch.id} ${m.id}`);
        assert.ok(b.to <= m.total || m.air, `${ch.id} ${m.id} 判定が技より長い`);
        assert.equal(b.box.length, 4);
      }
      for (const sp of m.spawn || []) assert.ok(sp.f < m.total, `${ch.id} ${m.id} 飛び道具が出る前に終わる`);
      if (m.counter) assert.ok(ch.moves[m.counter], `${ch.id} ${m.id} の反撃技がない`);
    }
  }
});
