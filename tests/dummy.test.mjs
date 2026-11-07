import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step } from '../src/sim.js';
import { dummyInput } from '../src/ai.js';
import { BTN } from '../src/config.js';

const away = (s, i) => (s.ps[1 - i].x > s.ps[i].x ? BTN.L : BTN.R);

function runGuardPractice(char, hold) {
  const s = createMatch({ p1: 'kagari', p2: char, training: true });
  const seen = { block: 0, hit: 0 };
  for (let f = 0; f < 900; f++) {
    step(s, [hold(s), dummyInput(s, 1, 'attack')]);
    for (const e of s.events) {
      if (e.t === 'block' && e.by === 1) seen.block++;
      if (e.t === 'hit' && e.by === 1) seen.hit++;
    }
  }
  return seen;
}

for (const char of ['kagari', 'goutetsu', 'shizuku']) {
  test(`攻撃してくる相手（${char}）は近づいて当て、後ろを押し続ければ防げる`, () => {
    assert.ok(runGuardPractice(char, () => 0).hit > 0, '何もしないと当たる');
    const guarded = runGuardPractice(char, (s) => away(s, 0));
    assert.ok(guarded.block > 0, 'ガードできる');
    assert.equal(guarded.hit, 0, 'ガード中は当たらない');
  });
}
