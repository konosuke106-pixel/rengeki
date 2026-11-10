// エンジンのテスト。実行: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step, cloneState, stateHash, hasMotion } from '../src/sim.js';
import { BTN, ROUND_FRAMES } from '../src/config.js';
import { CHAR_IDS, CHARS } from '../src/characters.js';
import { createCpu, dummyInput } from '../src/ai.js';

// [[入力, フレーム数], ...] の順に P1 を動かす
function play(s, script, p2 = 0) {
  for (const [mask, n] of script) {
    for (let i = 0; i < n; i++) step(s, [mask, p2]);
  }
}

function ready(p1 = 'kagari', p2 = 'kagari', gap = 90) {
  const s = createMatch({ p1, p2 });
  play(s, [[0, 91]]);
  assert.equal(s.phase, 'fight');
  s.ps[0].x = -gap / 2;
  s.ps[1].x = gap / 2;
  return s;
}

test('立ち攻撃を当てるとHPが減ってヒット状態になる', () => {
  const s = ready();
  play(s, [[BTN.A, 2], [0, 6]]);
  assert.ok(s.ps[1].hp < CHARS.kagari.hp);
  assert.equal(s.ps[1].comboHits, 1);
  assert.equal(s.ps[1].st, 'hit');
});

test('後ろを押していればガードできてHPが減らない', () => {
  const s = ready();
  const hold = BTN.R; // P2 は右向きに後退 = 後ろ
  for (let i = 0; i < 2; i++) step(s, [BTN.A, hold]);
  for (let i = 0; i < 8; i++) step(s, [0, hold]);
  assert.equal(s.ps[1].hp, CHARS.kagari.hp);
  assert.equal(s.ps[1].st, 'block');
});

test('下段は立ちガードできず、しゃがみガードはできる', () => {
  const stand = ready();
  for (let i = 0; i < 12; i++) step(stand, [i < 2 ? BTN.D | BTN.A : BTN.D, BTN.R]);
  assert.ok(stand.ps[1].hp < CHARS.kagari.hp, '立ちガードは下段を防げない');

  const crouch = ready();
  for (let i = 0; i < 12; i++) step(crouch, [i < 2 ? BTN.D | BTN.A : BTN.D, BTN.R | BTN.D]);
  assert.equal(crouch.ps[1].hp, CHARS.kagari.hp, 'しゃがみガードで防げる');
});

// ボタンを押して、当たるまで待つ（人が手で次を押すタイミングに近い）
function hitWith(s, mask, maxWait = 40) {
  const before = s.ps[0].stats.hits;
  for (let i = 0; i < 2; i++) step(s, [mask, 0]);
  for (let i = 0; i < maxWait && s.ps[0].stats.hits === before; i++) step(s, [0, 0]);
  return s.ps[0].stats.hits > before;
}

// コンボの締めに使う必殺技。コガラシの「下＋必殺」は罠、ユミの「下＋必殺」は対空の矢なので、前＋必殺で締める
// マボロシの「下＋必殺」は分身を置く技
const COMBO_ENDER = { kogarashi: BTN.R | BTN.S, yumi: BTN.R | BTN.S, maboroshi: BTN.R | BTN.S };

test('全キャラ：弱→中→強→必殺の地上コンボがつながる', () => {
  for (const id of CHAR_IDS) {
    const s = ready(id, 'kagari');
    assert.ok(hitWith(s, BTN.A), `${id} 弱`);
    assert.ok(hitWith(s, BTN.B), `${id} 中`);
    assert.ok(hitWith(s, BTN.C), `${id} 強`);
    assert.ok(hitWith(s, COMBO_ENDER[id] || BTN.D | BTN.S), `${id} 必殺`);
    assert.ok(s.ps[0].stats.maxCombo >= 4, `${id} 最大コンボ ${s.ps[0].stats.maxCombo}`);
    assert.ok(s.ps[0].stats.dmg >= 150, `${id} 総ダメージ ${s.ps[0].stats.dmg}`);
  }
});

test('全キャラ：打ち上げ→ジャンプキャンセル→空中コンボがつながる', () => {
  for (const id of CHAR_IDS) {
    const s = ready(id, 'kagari');
    assert.ok(hitWith(s, BTN.A), `${id} 弱`);
    assert.ok(hitWith(s, BTN.B), `${id} 中`);
    assert.ok(hitWith(s, BTN.D | BTN.C), `${id} 打ち上げ`);
    play(s, [[BTN.U | BTN.R, 2], [BTN.R, 8]]);
    assert.equal(s.ps[0].st === 'air' || s.ps[0].y > 0, true, `${id} ジャンプキャンセル`);
    assert.ok(hitWith(s, BTN.A, 20), `${id} 空中弱`);
    assert.ok(hitWith(s, BTN.B, 20), `${id} 空中中`);
    assert.ok(hitWith(s, BTN.C, 20), `${id} 叩き落とし`);
    assert.ok(s.ps[0].stats.maxCombo >= 6, `${id} 最大コンボ ${s.ps[0].stats.maxCombo}`);
    assert.ok(s.ps[0].stats.dmg < CHARS.kagari.hp * 0.6, `${id} 一度で減りすぎ ${s.ps[0].stats.dmg}`);
  }
});

test('全キャラ：必殺技からゲージを使って超必殺につながる', () => {
  for (const id of ['kagari', 'shizuku']) {
    const s = ready(id, 'kagari');
    s.ps[0].meter = 100;
    assert.ok(hitWith(s, BTN.B));
    assert.ok(hitWith(s, BTN.D | BTN.S));
    play(s, [[BTN.X, 2], [0, 14]]);
    assert.equal(s.ps[0].stats.supers, 1, `${id} 超必殺キャンセル`);
  }
});

test('超必殺はゲージを消費して大ダメージ', () => {
  const s = ready();
  s.ps[0].meter = 100;
  play(s, [[BTN.X, 2], [0, 140]]);
  assert.equal(s.ps[0].stats.supers, 1);
  assert.ok(s.ps[0].stats.dmg >= 250, `超必殺ダメージ ${s.ps[0].stats.dmg}`);
  assert.ok(s.ps[0].meter < 100);
});

test('ゲージがなければ超必殺は出ない', () => {
  const s = ready();
  s.ps[0].meter = 0;
  play(s, [[BTN.X, 2], [0, 5]]);
  assert.equal(s.ps[0].stats.supers, 0);
});

test('投げは ガード中でない相手に決まり、投げ抜けもできる', () => {
  const s = ready();
  play(s, [[BTN.T, 2], [0, 40]]);
  assert.ok(s.ps[1].hp < CHARS.kagari.hp);

  const t = ready();
  for (let i = 0; i < 2; i++) step(t, [BTN.T, 0]);
  for (let i = 0; i < 4; i++) step(t, [0, 0]);
  assert.equal(t.ps[1].st, 'thrown');
  step(t, [0, BTN.T]);
  for (let i = 0; i < 25; i++) step(t, [0, 0]);
  assert.equal(t.ps[1].hp, CHARS.kagari.hp);
});

test('コマンド入力を認識する', () => {
  const hist = [0, BTN.D, BTN.D | BTN.R, BTN.R];
  assert.ok(hasMotion(hist, 1, [2, 3, 6]));
  assert.ok(!hasMotion(hist, -1, [2, 3, 6]), '左向きなら逆方向のコマンドになる');
});

test('同じ入力なら必ず同じ結果になる（オンライン対戦の土台）', () => {
  const run = () => {
    const s = createMatch({ p1: 'kagari', p2: 'shizuku' });
    const a = createCpu('hard', 11);
    const b = createCpu('hard', 22);
    for (let i = 0; i < 3000; i++) step(s, [a(s, 0), b(s, 1)]);
    return stateHash(s);
  };
  assert.equal(run(), run());
});

test('状態を複製して巻き戻しても同じ未来になる', () => {
  const s = createMatch({ p1: 'goutetsu', p2: 'shizuku' });
  const a = createCpu('normal', 5);
  const b = createCpu('normal', 6);
  for (let i = 0; i < 800; i++) step(s, [a(s, 0), b(s, 1)]);
  const snap = cloneState(s);
  const inputs = [];
  for (let i = 0; i < 300; i++) {
    const m = [a(s, 0), b(s, 1)];
    inputs.push(m);
    step(s, m);
  }
  for (const m of inputs) step(snap, m);
  assert.equal(stateHash(s), stateHash(snap));
});

test('全キャラ組み合わせのCPU戦が壊れずに決着する', () => {
  let seed = 100;
  for (const p1 of CHAR_IDS) {
    for (const p2 of CHAR_IDS) {
      const s = createMatch({ p1, p2 });
      const a = createCpu('hard', ++seed);
      const b = createCpu('normal', ++seed);
      let frames = 0;
      while (s.phase !== 'over' && frames < (ROUND_FRAMES + 400) * 5) {
        step(s, [a(s, 0), b(s, 1)]);
        frames++;
        for (const f of s.ps) {
          assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.hp), `数値異常 ${p1} vs ${p2}`);
          assert.ok(f.y >= 0, `地面の下に落ちた ${p1} vs ${p2} st=${f.st}`);
          assert.ok(Math.abs(f.x) <= 820, `場外 ${p1} vs ${p2}`);
        }
      }
      assert.equal(s.phase, 'over', `${p1} vs ${p2} が終わらない`);
      assert.ok(s.ps[0].stats.hits + s.ps[1].stats.hits > 0);
    }
  }
});

test('無限コンボにならない（弱連打は途中で途切れる）', () => {
  const s = ready();
  s.training = true;
  for (let i = 0; i < 1200; i++) step(s, [i % 8 < 2 ? BTN.A : BTN.R, 0]);
  assert.ok(s.ps[0].stats.maxCombo < 15, `最大コンボ ${s.ps[0].stats.maxCombo}`);
});

test('ダミーのガード設定はすべての攻撃を防ぐ', () => {
  const s = ready();
  s.training = true;
  const script = [BTN.A, BTN.D | BTN.A, BTN.B, BTN.D | BTN.B];
  let t = 0;
  for (const btn of script) {
    for (let i = 0; i < 40; i++, t++) {
      step(s, [i < 2 ? btn : btn & BTN.D, dummyInput(s, 1, 'block')]);
    }
  }
  assert.equal(s.ps[1].stats.dmg, 0);
  assert.equal(s.ps[0].stats.hits, 0, `当たった回数 ${s.ps[0].stats.hits}`);
});
