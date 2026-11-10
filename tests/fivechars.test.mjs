// 追加5人（ツヅミ・オニ・クサリ・ユミ・ハミ）で増えた仕組みのテスト
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

// 必殺ボタンを hold コマ押し続けて離し、出た衝撃波を返す
function wave(hold) {
  const s = ready('tsuzumi', 'kagari', 900);
  s.ps[1].x = 800;
  run(s, hold, BTN.S);
  for (let i = 0; i < 30 && !s.projs.length; i++) step(s, [0, 0]);
  return { s, q: s.projs[0] };
}

test('ツヅミ：軽く押すと普通の衝撃波、押し続けると大きく強くなる', () => {
  const tap = wave(2).q;
  const full = wave(90).q;
  assert.ok(tap && full, '両方とも衝撃波が出た');
  assert.equal(tap.data.level, 0, '軽く押しただけでは溜まらない');
  assert.equal(full.data.level, 1, '長く押すと最大まで溜まる');
  assert.ok(full.data.dmg > tap.data.dmg * 2, `ダメージ ${tap.data.dmg} → ${full.data.dmg}`);
  assert.ok(full.w > tap.w && Math.abs(full.vx) > Math.abs(tap.vx), '大きく速い');
});

test('ツヅミ：溜めの途中で離すと、その分だけ強くなる', () => {
  const half = wave(8 + 35).q;
  assert.ok(half.data.level > 0.3 && half.data.level < 0.7, `溜まり具合 ${half.data.level}`);
});

test('ツヅミ：押しっぱなしでも最大まで溜まったら自動で放つ', () => {
  const s = ready('tsuzumi', 'kagari', 900);
  s.ps[1].x = 800;
  run(s, 150, BTN.S);
  assert.ok(s.projs.length > 0 || s.ps[0].st !== 'attack', '固まったままにならない');
});

test('ツヅミ：溜めた衝撃波は当たるとダメージが大きい', () => {
  const hit = (hold) => {
    const s = ready('tsuzumi', 'kagari', 300);
    run(s, hold, BTN.S);
    run(s, 80);
    return s.ps[0].stats.dmg;
  };
  const small = hit(2);
  const big = hit(90);
  assert.ok(small > 0 && big > small * 2, `${small} → ${big}`);
});

test('オニ：体力が減るほど同じ技のダメージが増える', () => {
  const dmgAt = (ratio) => {
    const s = ready('oni', 'kagari');
    s.ps[0].hp = Math.round(CHARS.oni.hp * ratio);
    run(s, 2, BTN.C);
    run(s, 30);
    return s.ps[0].stats.dmg;
  };
  const full = dmgAt(1);
  const low = dmgAt(0.2);
  assert.ok(full > 0);
  assert.ok(low > full * 1.3 && low <= full * 1.5 + 1, `${full} → ${low}`);
});

test('オニ以外は体力が減っても攻撃力は変わらない', () => {
  const dmgAt = (ratio) => {
    const s = ready('kagari', 'kagari');
    s.ps[0].hp = Math.round(CHARS.kagari.hp * ratio);
    run(s, 2, BTN.C);
    run(s, 30);
    return s.ps[0].stats.dmg;
  };
  assert.equal(dmgAt(1), dmgAt(0.2));
});

test('クサリ：遠くの相手に鎖投げを当てると手元に引き寄せ、そこから攻撃がつながる', () => {
  const s = ready('kusari', 'kagari', 300);
  run(s, 2, BTN.S);
  let hit = false;
  for (let i = 0; i < 30 && !hit; i++) { step(s, [0, 0]); hit = s.ps[0].stats.hits > 0; }
  assert.ok(hit, '鎖が届いた');
  while (s.ps[0].st === 'attack') step(s, [0, 0]);
  const gap = Math.abs(s.ps[1].x - s.ps[0].x);
  assert.ok(gap < 130, `引き寄せた後の距離 ${Math.round(gap)}`);
  assert.equal(s.ps[1].st, 'hit', 'まだのけぞっている');
  run(s, 2, BTN.A);
  run(s, 8);
  assert.equal(s.ps[1].comboHits, 2, '次の攻撃がコンボになる');
});

test('クサリ：引き寄せなしの普通の技では相手は寄ってこない', () => {
  const s = ready('kagari', 'kagari', 90);
  const before = s.ps[1].x;
  run(s, 2, BTN.A);
  run(s, 15);
  assert.ok(s.ps[1].x >= before, '押し返される');
});

test('ユミ：天の矢は斜め上に飛び、跳んでいる相手を落とす', () => {
  const s = ready('yumi', 'kagari', 260);
  run(s, 2, BTN.D | BTN.S);
  run(s, 8);
  const q = s.projs[0];
  assert.ok(q && q.vy > 0, '上向きに飛ぶ');
  const s2 = ready('yumi', 'kagari', 220);
  run(s2, 6, 0, BTN.U);
  run(s2, 2, BTN.D | BTN.S);
  run(s2, 30);
  assert.ok(s2.ps[0].stats.hits >= 1, '空中の相手に当たる');
});

test('ユミ：退き撃ちは後ろへ下がってから矢を撃つ', () => {
  const s = ready('yumi', 'kagari', 300);
  const x0 = s.ps[0].x;
  run(s, 2, BTN.R | BTN.S);
  run(s, 14);
  assert.ok(s.ps[0].x < x0 - 40, `下がった距離 ${Math.round(x0 - s.ps[0].x)}`);
  assert.equal(s.projs.length, 1, '矢が出た');
});

test('ハミ：毒の相手は何もしなくても体力が少しずつ減り、毒では倒れない', () => {
  const s = ready('hami', 'kagari', 200);
  run(s, 2, BTN.S);
  for (let i = 0; i < 40 && s.ps[0].stats.hits === 0; i++) step(s, [0, 0]);
  assert.ok(s.ps[1].poison > 0, '毒になった');
  const hp = s.ps[1].hp;
  run(s, 120);
  assert.ok(s.ps[1].hp < hp, `毒で減った ${hp} → ${s.ps[1].hp}`);

  s.ps[1].hp = 5;
  s.ps[1].poison = 200;
  run(s, 200);
  assert.equal(s.ps[1].hp, 1, '毒だけでは倒れない');
});

test('ハミ：毒の相手には這い牙のダメージが増える', () => {
  const dmg = (poisoned) => {
    const s = ready('hami', 'kagari', 120);
    if (poisoned) s.ps[1].poison = 600;
    run(s, 2, BTN.D | BTN.S);
    run(s, 30);
    return s.ps[0].stats.dmg;
  };
  const plain = dmg(false);
  const venom = dmg(true);
  assert.ok(plain > 0 && venom >= Math.round(plain * 1.35), `${plain} → ${venom}`);
});

test('ハミ：噛みつき（投げ）は投げ抜けできず、毒にする', () => {
  const s = ready('hami', 'kagari');
  run(s, 2, BTN.R | BTN.S);
  // 掴まれたら投げ抜けを押し続ける
  for (let i = 0; i < 44; i++) step(s, [0, s.ps[1].st === 'thrown' && i % 2 ? BTN.T : 0]);
  assert.ok(s.ps[1].hp < CHARS.kagari.hp, '決まった');
  assert.ok(s.ps[1].poison > 0, '毒になった');
});

test('毒と溜めは次のラウンドに持ち越さない', () => {
  const s = ready('hami', 'kagari');
  s.ps[1].poison = 500;
  s.ps[1].hp = 1;
  s.ps[0].stats.hits = 0;
  run(s, 2, BTN.A);
  for (let i = 0; i < 400 && s.round === 1; i++) step(s, [0, 0]);
  assert.equal(s.round, 2);
  assert.equal(s.ps[1].poison, 0);
});

test('追加5人全員：超必殺が出てダメージを与える', () => {
  for (const id of ['tsuzumi', 'oni', 'kusari', 'yumi', 'hami']) {
    const s = ready(id, 'kagari', 140);
    s.ps[0].meter = 100;
    run(s, 2, BTN.X);
    run(s, 160);
    assert.equal(s.ps[0].stats.supers, 1, `${id} 超必殺が出た`);
    assert.ok(s.ps[0].stats.dmg >= 200, `${id} ダメージ ${s.ps[0].stats.dmg}`);
  }
});
