// BOT 戦の結果を決める（サーバー側）。手元のゲームの報告は信じず、記録から試合を再生して決める。
// decode・replay は呼ぶ側が渡す（Node のテストは src/ のもの、Edge Function は game/ に写したもの）
//   試合中にサーバーが更新された（始めた時の版と今の版が違う）→ void（レートは動かない）
//   送ってきた版が始めた時の版と違う・記録が壊れている・知らないキャラ・決着しない → invalid（負け）
//   試合にかかるはずの時間（コマ数÷60秒の8割）より早く届いた → invalid（手元で何千通りも試して勝てる記録を探すのを防ぐ）
//   それ以外 → 再生した勝者で win / loss / draw
export function judgeBotMatch({ fnVersion, startVersion, sentVersion, playerChar, inputs, bot, seed, decode, replay, elapsedSec }) {
  if (fnVersion !== startVersion) return 'void';
  if (sentVersion !== startVersion) return 'invalid';
  const masks = decode(inputs);
  if (!masks) return 'invalid';
  const out = replay({ playerChar, bot, seed, inputs: masks });
  if (!out) return 'invalid';
  if (typeof elapsedSec === 'number' && elapsedSec < (out.frames / 60) * 0.8) return 'invalid';
  if (out.winner === 0) return 'win';
  if (out.winner === 1) return 'loss';
  return 'draw';
}
