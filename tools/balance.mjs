// キャラの強さの目安：全キャラの総当たりを、強さ「つよい」の CPU どうしで戦わせて勝率を出す。
// 人の遊び方とは違うので目安だが、同じ条件で比べられる。node tools/balance.mjs [1組あたりの試合数(偶数)]
// 試合はギミックなし・闘技場。左右を入れ替えて同じ数ずつ戦う
import { createMatch, step } from '../src/sim.js';
import { createCpu } from '../src/ai.js';
import { CHARS, CHAR_IDS } from '../src/characters.js';

const games = Number(process.argv[2] || 6);
const MAX_FRAMES = 60 * 60 * 6;

function play(p1, p2, seed) {
  const s = createMatch({ p1, p2, stage: 'arena' });
  const a = createCpu('hard', seed * 2 + 1);
  const b = createCpu('hard', seed * 2 + 2);
  for (let f = 0; f < MAX_FRAMES && s.phase !== 'over'; f++) step(s, [a(s, 0), b(s, 1)]);
  return s.phase === 'over' ? s.matchWinner : -1;
}

const score = Object.fromEntries(CHAR_IDS.map((id) => [id, { w: 0, n: 0, vs: {} }]));
let seed = 1;
for (let i = 0; i < CHAR_IDS.length; i++) {
  for (let j = i + 1; j < CHAR_IDS.length; j++) {
    const x = CHAR_IDS[i];
    const y = CHAR_IDS[j];
    let xw = 0;
    for (let g = 0; g < games; g++) {
      const swap = g % 2 === 1;
      const w = play(swap ? y : x, swap ? x : y, seed++);
      if (w < 0) { xw += 0.5; continue; }
      if ((w === 0) !== swap) xw++;
    }
    score[x].w += xw; score[x].n += games; score[x].vs[y] = xw / games;
    score[y].w += games - xw; score[y].n += games; score[y].vs[x] = (games - xw) / games;
  }
}
const rows = CHAR_IDS.map((id) => ({ id, name: CHARS[id].name, rate: score[id].w / score[id].n, vs: score[id].vs }))
  .sort((p, q) => q.rate - p.rate);
for (const r of rows) {
  const worst = Object.entries(r.vs).sort((p, q) => p[1] - q[1]).slice(0, 3).map(([k, v]) => `${CHARS[k].name}${Math.round(v * 100)}`).join(' ');
  console.log(`${r.name.padEnd(6, '　')} ${(r.rate * 100).toFixed(1).padStart(5)}%  苦手: ${worst}`);
}
if (process.argv.includes('--json')) console.log(JSON.stringify(Object.fromEntries(rows.map((r) => [r.id, r.rate]))));
