// 追加4人（マボロシ・ツバサ・カブト・ハゼ）で増えた仕組みのテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step } from '../src/sim.js';
import { BTN, METER_MAX } from '../src/config.js';
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

// 動けるようになるまで待つ
function settle(s, idx = 0, max = 80) {
  for (let i = 0; i < max && s.ps[idx].st !== 'idle'; i++) step(s, [0, 0]);
}

test('マボロシ：分身はその場に残り、5秒で消える', () => {
  const s = ready('maboroshi', 'kagari', 600);
  run(s, 2, BTN.D | BTN.S);
  run(s, 12);
  assert.ok(s.ps[0].clone, '分身ができた');
  const cx = s.ps[0].clone.x;
  settle(s);
  run(s, 20, BTN.L);
  assert.equal(s.ps[0].clone.x, cx, '本体が動いても分身は動かない');
  run(s, 320);
  assert.equal(s.ps[0].clone, null, '時間で消えた');
});

test('マボロシ：分身がいると幻刃が2本出る。いなければ1本', () => {
  const one = ready('maboroshi', 'kagari', 800);
  run(one, 2, BTN.S);
  run(one, 12);
  assert.equal(one.projs.length, 1);

  const two = ready('maboroshi', 'kagari', 800);
  run(two, 2, BTN.D | BTN.S);
  settle(two);
  two.ps[0].x -= 200;
  run(two, 2, BTN.S);
  run(two, 12);
  assert.equal(two.projs.length, 2, '本体と分身から1本ずつ');
});

test('マボロシ：相手の後ろに置いた分身の刃は、前を向いてガードしていても当たる', () => {
  const s = ready('maboroshi', 'kagari', 200);
  // 分身を相手の向こう側に置いておく
  s.ps[0].clone = { x: s.ps[1].x + 160, facing: -1, life: 300 };
  s.ps[0].x = s.ps[1].x - 400;
  run(s, 2, BTN.S, BTN.R);
  run(s, 40, 0, BTN.R);
  assert.ok(s.ps[1].hp < CHARS.kagari.hp, '後ろから当たった');
});

test('マボロシ：入れ替わりで分身の位置へ移り、分身は元の位置に来る', () => {
  const s = ready('maboroshi', 'kagari', 700);
  run(s, 2, BTN.D | BTN.S);
  settle(s);
  const cloneX = s.ps[0].clone.x;
  s.ps[0].x = cloneX - 250;
  const from = s.ps[0].x;
  run(s, 2, BTN.R | BTN.S);
  run(s, 8);
  assert.ok(Math.abs(s.ps[0].x - cloneX) < 15, '分身の位置に移った');
  assert.ok(Math.abs(s.ps[0].clone.x - from) < 15, '分身が元の位置に');
});

// ジャンプしてから空中で右を2回はじく
function jumpAndDash(id, taps = 1) {
  const s = ready(id, 'kagari', 700);
  s.ps[1].x = 800;
  run(s, 2, BTN.U);
  run(s, 10);
  const seq = [];
  for (let t = 0; t < taps; t++) seq.push(BTN.R, 0, BTN.R, 0, 0, 0, 0, 0);
  s.dashes = 0;
  for (const m of seq) {
    step(s, [m, 0]);
    s.dashes += s.events.filter((e) => e.t === 'airdash').length;
  }
  return s;
}

test('ツバサ：空中で同じ方向を2回押すと空中ダッシュ。1回のジャンプで1回だけ', () => {
  const s = jumpAndDash('tsubasa');
  assert.ok(s.ps[0].airDashed, '空中ダッシュした');
  assert.ok(s.ps[0].vx >= 12, `横の速さ ${s.ps[0].vx}`);
  const twice = jumpAndDash('tsubasa', 2);
  assert.equal(twice.dashes, 1, '2回はじいてもダッシュは1回');
  const other = jumpAndDash('kagari');
  assert.ok(!other.ps[0].airDashed, '他のキャラは空中ダッシュできない');
});

test('ツバサ：着地すると、次のジャンプでまた空中ダッシュできる', () => {
  const s = jumpAndDash('tsubasa');
  for (let i = 0; i < 120 && s.ps[0].y > 0; i++) step(s, [0, 0]);
  settle(s);
  assert.equal(s.ps[0].airDashed, false);
});

// ジャンプして着地するまでのコマ数と、いちばん速く落ちた速さを測る。
// mode: 'none' 何もしない / 'hold' ジャンプを押しっぱなし / 'glide' 空中でもう一度押して押し続ける
function airtime(id, mode) {
  const s = ready(id, 'kagari', 700);
  s.ps[1].x = 800;
  let minVy = 0;
  let n = 0;
  run(s, 2, BTN.U);
  for (; n < 400; n++) {
    let m = 0;
    if (mode === 'hold') m = BTN.U;
    if (mode === 'glide') m = n >= 10 && n < 12 ? 0 : n >= 12 ? BTN.U : 0;
    step(s, [m, 0]);
    if (s.ps[0].st === 'air' && s.ps[0].vy < 0 && n > 14) minVy = Math.min(minVy, s.ps[0].vy);
    if (s.ps[0].y <= 0 && n > 10) break;
  }
  return { n, minVy };
}

test('ツバサ：空中でもう一度ジャンプを押し続けると、ゆっくり落ちて長く飛べる', () => {
  const glide = airtime('tsubasa', 'glide');
  const plain = airtime('tsubasa', 'none');
  assert.ok(glide.minVy >= -CHARS.tsubasa.glide - 0.01, `落ちる速さ ${glide.minVy}`);
  assert.ok(glide.n > plain.n + 20, `滞空 ${plain.n} → ${glide.n}`);
  const other = airtime('kagari', 'glide');
  assert.ok(other.minVy < -5, '他のキャラは滑空しない');
});

test('ツバサ：ジャンプを押しっぱなしにしただけでは滑空しない（空中で止まって見えない）', () => {
  const hold = airtime('tsubasa', 'hold');
  const plain = airtime('tsubasa', 'none');
  assert.ok(Math.abs(hold.n - plain.n) <= 2, `押しっぱなし ${hold.n} / 何もしない ${plain.n}`);
});

test('ツバサ：滑空には長さの上限があり、高い所からでも必ず降りてくる', () => {
  const s = ready('tsubasa', 'kagari', 700);
  s.ps[1].x = 800;
  run(s, 2, BTN.U);
  run(s, 10);
  run(s, 2, BTN.U); // 空中でもう一度押して滑空を始める
  s.ps[0].y = 1500; // とても高い所にいることにする
  let gliding = 0;
  let n = 0;
  for (; n < 600 && s.ps[0].y > 0; n++) {
    step(s, [BTN.U, 0]);
    if (Math.abs(s.ps[0].vy + CHARS.tsubasa.glide) < 0.01) gliding++;
  }
  assert.ok(gliding > 60 && gliding <= 92, `滑空したコマ ${gliding}`);
  assert.ok(s.ps[0].y <= 0, '着地した');
});

test('カブト：ガード中に必殺ボタンでゲージを使って反撃する', () => {
  const s = ready('kabuto', 'kagari');
  s.ps[0].meter = 100;
  // 相手の強攻撃をガードし、ガード中に必殺を押す
  run(s, 2, BTN.L, BTN.C);
  let gc = false;
  for (let i = 0; i < 30 && !gc; i++) {
    step(s, [s.ps[0].st === 'block' ? BTN.L | BTN.S : BTN.L, 0]);
    gc = s.ps[0].move === 'gc';
  }
  assert.ok(gc, '反撃が出た');
  assert.equal(s.ps[0].meter, 100 + 3 - 50, 'ゲージを50使った');
  run(s, 20);
  assert.ok(s.ps[1].hp < CHARS.kagari.hp, '反撃が当たった');
});

test('カブト：ゲージが足りないとガード中の反撃は出ない。他のキャラも出ない', () => {
  for (const [id, meter] of [['kabuto', 0], ['kagari', METER_MAX]]) {
    const s = ready(id, 'kagari');
    s.ps[0].meter = meter;
    run(s, 2, BTN.L, BTN.C);
    for (let i = 0; i < 30; i++) step(s, [s.ps[0].st === 'block' ? BTN.L | BTN.S : BTN.L, 0]);
    assert.notEqual(s.ps[0].move, 'gc', `${id} meter=${meter}`);
  }
});

test('カブト：ガードしても削られない（他のキャラは削られる）', () => {
  const chip = (id) => {
    const s = ready('goutetsu', id, 120);
    run(s, 2, BTN.S, BTN.R);
    run(s, 40, 0, BTN.R);
    return CHARS[id].hp - s.ps[1].hp;
  };
  assert.ok(chip('kagari') > 0, '普通は削られる');
  assert.equal(chip('kabuto'), 0, 'カブトは削られない');
});

test('カブト：盾弾きで飛び道具を打ち返し、撃った相手に当たる', () => {
  const s = ready('kabuto', 'kagari', 500);
  run(s, 2, 0, BTN.S);
  let reflected = false;
  for (let i = 0; i < 80; i++) {
    const near = s.projs.some((q) => q.owner === 1 && Math.abs(q.x - s.ps[0].x) < 140);
    step(s, [near && s.ps[0].st !== 'attack' ? BTN.D | BTN.S : 0, 0]);
    if (s.projs.some((q) => q.owner === 0)) reflected = true;
  }
  assert.ok(reflected, '持ち主が入れ替わった');
  assert.equal(s.ps[0].hp, CHARS.kabuto.hp, 'カブトは無傷');
  assert.ok(s.ps[1].hp < CHARS.kagari.hp, '撃った相手に当たった');
});

test('ハゼ：当てた相手に時限爆弾が付き、時間が来るとガードしていても爆発する', () => {
  const s = ready('haze', 'kagari', 120);
  run(s, 2, BTN.R | BTN.S);
  run(s, 20);
  assert.ok(s.ps[1].bombT > 0, '爆弾が付いた');
  const hp = s.ps[1].hp;
  let boomed = false;
  for (let i = 0; i < 120 && !boomed; i++) {
    step(s, [0, BTN.R]);
    boomed = s.ps[1].bombT === 0;
  }
  assert.ok(boomed, '爆発した');
  run(s, 2, 0, BTN.R);
  assert.ok(hp - s.ps[1].hp >= 60, `爆発のダメージ ${hp - s.ps[1].hp}`);
});

test('ハゼ：投げた爆弾は放物線を描いて落ちる', () => {
  const s = ready('haze', 'kagari', 900);
  s.ps[1].x = 800;
  run(s, 2, BTN.S);
  run(s, 14);
  const q = s.projs[0];
  const ys = [];
  for (let i = 0; i < 40 && s.projs.length; i++) { ys.push(s.projs[0].y); step(s, [0, 0]); }
  const top = Math.max(...ys);
  assert.ok(top > ys[0] + 20, '一度上がる');
  assert.ok(ys[ys.length - 1] < top - 20 || !s.projs.length, '落ちてくる');
  assert.ok(q);
});

test('爆弾と分身は次のラウンドに持ち越さない', () => {
  const s = ready('haze', 'maboroshi');
  s.ps[1].bombT = 500;
  s.ps[1].bombBy = 0;
  s.ps[0].clone = { x: 0, facing: 1, life: 900 };
  s.ps[1].hp = 1;
  run(s, 2, BTN.A);
  for (let i = 0; i < 400 && s.round === 1; i++) step(s, [0, 0]);
  assert.equal(s.round, 2);
  assert.equal(s.ps[1].bombT, 0);
  assert.equal(s.ps[0].clone, null);
});

test('追加4人全員：超必殺が出てダメージを与える', () => {
  for (const id of ['maboroshi', 'tsubasa', 'kabuto', 'haze']) {
    const s = ready(id, 'kagari', 140);
    s.ps[0].meter = 100;
    run(s, 2, BTN.X);
    run(s, 170);
    assert.equal(s.ps[0].stats.supers, 1, `${id} 超必殺が出た`);
    assert.ok(s.ps[0].stats.dmg >= 200, `${id} ダメージ ${s.ps[0].stats.dmg}`);
  }
});
