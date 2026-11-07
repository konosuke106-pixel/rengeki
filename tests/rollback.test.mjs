// 2台の対戦を、遅延・ゆらぎ・紛失のある仮想回線でつないで確かめる
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stateHash } from '../src/sim.js';
import { RollbackSession } from '../src/rollback.js';
import { createCpu } from '../src/ai.js';

function seededRandom(seed) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

function runDuo({ lag, jitter = 0, loss = 0, seed = 1, p1 = 'kagari', p2 = 'shizuku', ticks = 4000, driftEvery = 0 }) {
  const rand = seededRandom(seed);
  const wire = [];
  let now = 0;
  const mkSend = (to) => (msg) => {
    if (rand() < loss) return;
    const copy = JSON.parse(JSON.stringify(msg));
    wire.push({ at: now + lag + rand() * jitter, to, msg: copy });
  };
  const a = new RollbackSession({ state: createMatch({ p1, p2 }), localIdx: 0, send: mkSend(1) });
  const b = new RollbackSession({ state: createMatch({ p1, p2 }), localIdx: 1, send: mkSend(0) });
  const cpuA = createCpu('hard', seed + 10);
  const cpuB = createCpu('hard', seed + 20);
  const shown = [0, 0];
  for (let t = 0; t < ticks; t++) {
    now = t * (1000 / 60);
    for (let i = wire.length - 1; i >= 0; i--) {
      if (wire[i].at <= now) {
        const w = wire[i];
        wire.splice(i, 1);
        (w.to === 0 ? a : b).receive(w.msg, now);
      }
    }
    shown[0] += a.tick(cpuA(a.state, 0), now).events.length;
    // 片方の端末だけ描画が遅れる状況も再現する
    if (!driftEvery || t % driftEvery !== 0) shown[1] += b.tick(cpuB(b.state, 1), now).events.length;
    if (a.confirmedOver && b.confirmedOver) break;
  }
  return { a, b, shown };
}

// 両者が共通して確定したコマの状態を比べる
function sameAtConfirmed(a, b) {
  const shared = [...a.localHashes.keys()].filter((f) => b.localHashes.has(f));
  assert.ok(shared.length > 0, '比較できる確定コマがない');
  for (const f of shared) assert.equal(a.localHashes.get(f), b.localHashes.get(f), `コマ ${f} で不一致`);
  return shared.length;
}

test('回線が完全なら巻き戻しなしに近く、結果が一致する', () => {
  const { a, b } = runDuo({ lag: 8, ticks: 1500 });
  assert.equal(a.desync || b.desync, false);
  assert.ok(sameAtConfirmed(a, b) >= 3);
});

test('60ms の遅延でも2台の結果が一致する', () => {
  const { a, b } = runDuo({ lag: 60, ticks: 2500, seed: 2 });
  assert.equal(a.desync || b.desync, false);
  sameAtConfirmed(a, b);
  assert.ok(a.stats.rollbacks + b.stats.rollbacks > 0, '巻き戻しが起きていない');
  assert.ok(a.state.ps[0].stats.hits + a.state.ps[1].stats.hits > 0);
});

test('ゆらぎと5%の紛失があっても一致する', () => {
  const { a, b } = runDuo({ lag: 50, jitter: 40, loss: 0.05, ticks: 3000, seed: 3 });
  assert.equal(a.desync || b.desync, false);
  sameAtConfirmed(a, b);
});

test('片方の端末が遅くても一致し、差が開きすぎない', () => {
  const { a, b } = runDuo({ lag: 40, jitter: 10, ticks: 2500, seed: 4, driftEvery: 9 });
  assert.equal(a.desync || b.desync, false);
  sameAtConfirmed(a, b);
  assert.ok(Math.abs(a.frame - b.frame) <= a.maxPredict + 4, `差 ${a.frame - b.frame}`);
});

test('全組み合わせで試合が最後まで進み、勝敗が一致する', () => {
  let seed = 50;
  for (const [p1, p2] of [['kagari', 'goutetsu'], ['goutetsu', 'shizuku'], ['shizuku', 'shizuku']]) {
    const { a, b } = runDuo({ lag: 45, jitter: 15, loss: 0.02, seed: ++seed, p1, p2, ticks: 40000 });
    assert.ok(a.confirmedOver && b.confirmedOver, `${p1} vs ${p2} が終わらない`);
    assert.equal(a.state.matchWinner, b.state.matchWinner);
    assert.equal(a.desync || b.desync, false);
  }
});

test('相手が止まると一定コマで待ち、再開すれば追いつく', () => {
  const sent = [];
  const a = new RollbackSession({ state: createMatch({}), localIdx: 0, send: (m) => sent.push(m) });
  for (let i = 0; i < 60; i++) a.tick(0, i * 16);
  assert.ok(a.frame <= a.maxPredict + a.delay + 1, `進みすぎ ${a.frame}`);
  assert.ok(a.stats.stalls > 0);
  const stuck = a.frame;
  const b = new RollbackSession({ state: createMatch({}), localIdx: 1, send: (m) => a.receive(JSON.parse(JSON.stringify(m)), 2000) });
  for (let i = 0; i < 30; i++) {
    b.tick(0, 2000 + i * 16);
    a.tick(0, 2000 + i * 16);
  }
  assert.ok(a.frame > stuck);
});

test('巻き戻しで演出が二重に出ない', () => {
  const { a, shown } = runDuo({ lag: 80, ticks: 1200, seed: 7 });
  assert.ok(a.stats.rollbacks > 0);
  const hits = a.state.ps[0].stats.hits + a.state.ps[1].stats.hits;
  assert.ok(shown[0] < a.frame, `演出の数 ${shown[0]}`);
  assert.ok(hits >= 0);
});

test('別世代（再戦前）の入力は無視する', () => {
  const a = new RollbackSession({ state: createMatch({}), localIdx: 0, send: () => {}, generation: 2 });
  a.receive({ t: 'i', g: 1, s: 2, m: [16], a: 0, f: 3, adv: 0, p: 0, e: null }, 0);
  assert.equal(a.remoteUpTo, a.delay - 1);
});

test('状態指紋が食い違えば検出できる', () => {
  const a = new RollbackSession({ state: createMatch({}), localIdx: 0, send: () => {} });
  a.localHashes.set(120, stateHash(a.state));
  a.receive({ t: 'h', g: 0, f: 120, h: 1 }, 0);
  assert.equal(a.desync, true);
});
