// BOT 戦の入力の記録と再生。手元のゲームとサーバー（Edge Function bot-match）の両方で使う。
// 同じ操作なら必ず同じ結果になる戦闘エンジンと、種で決まる CPU を使って、記録から試合をもう一度動かす。
// サーバーでもそのまま動くよう、戦闘・CPU・キャラ以外は読み込まない
import { createMatch, step } from './sim.js';
import { createCpu } from './ai.js';
import { CHARS } from './characters.js';

export const REPLAY_MAX_FRAMES = 21600; // 6分。試合はこれより前に必ず決着する

// 毎コマの押しボタンを、同じ値が続く所をまとめて短い文字にする（「値*回数」を . でつなぐ、36進）
export function encodeInputs(masks) {
  const parts = [];
  for (let i = 0; i < masks.length;) {
    let j = i;
    while (j < masks.length && masks[j] === masks[i]) j++;
    const n = j - i;
    parts.push(n === 1 ? masks[i].toString(36) : `${masks[i].toString(36)}*${n.toString(36)}`);
    i = j;
  }
  return parts.join('.');
}

// 壊れている・長すぎる記録は null
export function decodeInputs(text, maxFrames = REPLAY_MAX_FRAMES) {
  if (typeof text !== 'string') return null;
  if (text === '') return [];
  const out = [];
  for (const part of text.split('.')) {
    const m = /^([0-9a-z]{1,4})(?:\*([0-9a-z]{1,5}))?$/.exec(part);
    if (!m) return null;
    const value = parseInt(m[1], 36);
    const n = m[2] === undefined ? 1 : parseInt(m[2], 36);
    if (value > 0xffff || n < 1 || out.length + n > maxFrames) return null;
    for (let k = 0; k < n; k++) out.push(value);
  }
  return out;
}

// BOT 戦の始まりの状態。ステージは BOT のキャラのステージ、ギミックあり（オンラインと同じ）
export function botMatchState(playerChar, bot) {
  return createMatch({ p1: playerChar, p2: bot.char, stage: CHARS[bot.char].stage, gimmicks: true });
}

// 記録から試合を最初から動かし、勝者（0 プレイヤー・1 BOT・-1 引き分け）と進んだコマ数を返す。決着しなければ null
export function replayBotMatch({ playerChar, bot, seed, inputs }) {
  if (!CHARS[playerChar] || !bot || !CHARS[bot.char] || !Array.isArray(inputs)) return null;
  const s = botMatchState(playerChar, bot);
  const cpu = createCpu(bot.level, seed);
  let f = 0;
  for (; f < inputs.length && s.phase !== 'over'; f++) step(s, [inputs[f], cpu(s, 1)]);
  if (s.phase !== 'over') return null;
  return { winner: s.matchWinner, frames: f };
}
