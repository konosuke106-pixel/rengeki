// BOT 戦の入力の記録と再生（src/replay.js）。手元で遊んだ試合と、記録から再生した試合が必ず一致すること
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, botMatchState, replayBotMatch, REPLAY_MAX_FRAMES } from '../src/replay.js';
import { step } from '../src/sim.js';
import { createCpu } from '../src/ai.js';
import { CHAR_IDS } from '../src/characters.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

test('記録は詰めても元どおりに戻り、壊れた記録・長すぎる記録は受け付けない', () => {
  const r = rng(3);
  const masks = [];
  for (let i = 0; i < 3000; i++) masks.push(r() < 0.9 && i ? masks[i - 1] : Math.floor(r() * 4096));
  const text = encodeInputs(masks);
  assert.ok(text.length < masks.length * 2, `詰めた長さ ${text.length}`);
  assert.deepEqual(decodeInputs(text), masks);
  assert.deepEqual(decodeInputs(encodeInputs([])), []);
  assert.equal(decodeInputs('zz*'), null);
  assert.equal(decodeInputs('1..2'), null);
  assert.equal(decodeInputs('zzzzz'), null); // 押しボタンの値として大きすぎる
  assert.equal(decodeInputs('1*-3'), null);
  assert.equal(decodeInputs(42), null);
  assert.equal(decodeInputs(encodeInputs(new Array(REPLAY_MAX_FRAMES + 1).fill(0))), null);
});

// 手元の BOT 戦と同じ流れ：毎コマ、自分の入力を記録してから BOT の入力を出し、1コマ進める
function playLocal(playerChar, bot, seed, playerSeed, pauseEvery = 0) {
  const s = botMatchState(playerChar, bot);
  const me = createCpu('normal', playerSeed);
  const cpu = createCpu(bot.level, seed);
  const log = [];
  for (let tick = 0; tick < 40000 && s.phase !== 'over'; tick++) {
    if (pauseEvery && tick % pauseEvery < 3) continue; // 一時停止中はコマが進まず、記録もしない
    const mine = me(s, 0);
    log.push(mine);
    step(s, [mine, cpu(s, 1)]);
  }
  return { winner: s.phase === 'over' ? s.matchWinner : null, frames: log.length, log };
}

test('全キャラで、手元の試合と記録から再生した試合の勝者とコマ数が一致する', () => {
  CHAR_IDS.forEach((id, i) => {
    const bot = { char: CHAR_IDS[(i * 5 + 3) % CHAR_IDS.length], level: ['easy', 'normal', 'hard'][i % 3] };
    const local = playLocal(id, bot, 1000 + i, 7 + i);
    assert.notEqual(local.winner, null, `${id} が決着しない`);
    const out = replayBotMatch({ playerChar: id, bot, seed: 1000 + i, inputs: decodeInputs(encodeInputs(local.log)) });
    assert.deepEqual(out, { winner: local.winner, frames: local.frames }, id);
  });
});

test('一時停止を挟んでも、記録したコマだけで再生すれば一致する', () => {
  const bot = { char: 'kage', level: 'hard' };
  const local = playLocal('kagari', bot, 55, 9, 50);
  assert.deepEqual(replayBotMatch({ playerChar: 'kagari', bot, seed: 55, inputs: local.log }), { winner: local.winner, frames: local.frames });
});

test('入力が途中で尽きて決着しない記録は null', () => {
  const bot = { char: 'rai', level: 'easy' };
  const local = playLocal('shizuku', bot, 8, 8);
  assert.equal(replayBotMatch({ playerChar: 'shizuku', bot, seed: 8, inputs: local.log.slice(0, 600) }), null);
  assert.equal(replayBotMatch({ playerChar: 'nobody', bot, seed: 8, inputs: local.log }), null);
});

test('5ラウンドすべて時間切れの長い試合（約3万コマ）でも、記録を受け付ける', () => {
  assert.ok(REPLAY_MAX_FRAMES >= 36000, `上限 ${REPLAY_MAX_FRAMES}`);
  assert.equal(decodeInputs(encodeInputs(new Array(32000).fill(0))).length, 32000);
});
