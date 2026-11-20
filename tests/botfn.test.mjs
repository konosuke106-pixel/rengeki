// サーバー（Edge Function bot-match）が BOT 戦の結果を決める部分（judge.js）
import test from 'node:test';
import assert from 'node:assert/strict';
import { judgeBotMatch } from '../supabase/functions/bot-match/judge.js';
import { encodeInputs, decodeInputs, replayBotMatch, botMatchState } from '../src/replay.js';
import { step } from '../src/sim.js';
import { createCpu } from '../src/ai.js';

// 手元で BOT 戦を1試合して、記録と勝者を返す
function play(playerChar, bot, seed, playerSeed, playerLevel = 'hard') {
  const s = botMatchState(playerChar, bot);
  const me = createCpu(playerLevel, playerSeed);
  const cpu = createCpu(bot.level, seed);
  const log = [];
  while (s.phase !== 'over' && log.length < 21600) {
    const m = me(s, 0);
    log.push(m);
    step(s, [m, cpu(s, 1)]);
  }
  return { inputs: encodeInputs(log), winner: s.matchWinner };
}

const base = { fnVersion: 'v1', startVersion: 'v1', sentVersion: 'v1', decode: decodeInputs, replay: replayBotMatch };

test('正しい記録なら、再生した勝ち負けがそのまま結果になる', () => {
  let seen = new Set();
  for (let i = 0; i < 12 && seen.size < 2; i++) {
    // 強い自分と弱い BOT・弱い自分と強い BOT を交互に
    const bot = { char: 'rai', level: i % 2 ? 'hard' : 'easy' };
    const g = play('kagari', bot, 100 + i, 200 + i, i % 2 ? 'easy' : 'hard');
    const want = g.winner === 0 ? 'win' : g.winner === 1 ? 'loss' : 'draw';
    assert.equal(judgeBotMatch({ ...base, playerChar: 'kagari', bot, seed: 100 + i, inputs: g.inputs }), want);
    seen.add(want);
  }
  assert.ok(seen.has('win') && seen.has('loss'), `勝ちと負けの両方を確かめた: ${[...seen]}`);
});

test('嘘の結果は通らない：別の種で遊んだ記録は、サーバーの種で再生した結果になる', () => {
  const bot = { char: 'kage', level: 'hard' };
  const g = play('kagari', bot, 1, 5);
  const real = judgeBotMatch({ ...base, playerChar: 'kagari', bot, seed: 2, inputs: g.inputs });
  assert.ok(['win', 'loss', 'draw', 'invalid'].includes(real));
});

test('版がずれた時：試合中にサーバーが更新されたら void、送ってきた版が違えば invalid', () => {
  const bot = { char: 'rai', level: 'easy' };
  const g = play('kagari', bot, 3, 3);
  assert.equal(judgeBotMatch({ ...base, fnVersion: 'v2', playerChar: 'kagari', bot, seed: 3, inputs: g.inputs }), 'void');
  assert.equal(judgeBotMatch({ ...base, sentVersion: 'v0', playerChar: 'kagari', bot, seed: 3, inputs: g.inputs }), 'invalid');
});

test('壊れた記録・知らないキャラ・途中で尽きる記録は invalid（負け）', () => {
  const bot = { char: 'rai', level: 'easy' };
  assert.equal(judgeBotMatch({ ...base, playerChar: 'kagari', bot, seed: 3, inputs: 'zz*' }), 'invalid');
  assert.equal(judgeBotMatch({ ...base, playerChar: 'kagari', bot, seed: 3, inputs: 12345 }), 'invalid');
  assert.equal(judgeBotMatch({ ...base, playerChar: 'nobody', bot, seed: 3, inputs: '0*10' }), 'invalid');
  assert.equal(judgeBotMatch({ ...base, playerChar: 'kagari', bot, seed: 3, inputs: '0*gg' }), 'invalid'); // 592コマだけでは決着しない
});

test('試合にかかるはずの時間より早く届いた結果は、ズルとして負け（手元で何千通りも試してから送るのを防ぐ）', () => {
  const bot = { char: 'rai', level: 'easy' };
  const g = play('kagari', bot, 100, 200, 'hard');
  const frames = replayBotMatch({ playerChar: 'kagari', bot, seed: 100, inputs: decodeInputs(g.inputs) }).frames;
  assert.equal(judgeBotMatch({ ...base, playerChar: 'kagari', bot, seed: 100, inputs: g.inputs, elapsedSec: frames / 60 / 4 }), 'invalid');
  assert.equal(judgeBotMatch({ ...base, playerChar: 'kagari', bot, seed: 100, inputs: g.inputs, elapsedSec: frames / 60 + 5 }), g.winner === 0 ? 'win' : 'loss');
});
