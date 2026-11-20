// ランクマッチ宣伝動画（tools/promo-ranked.html）の対戦場面を探す。
// 「あなた」（CPU つよい）が BOT（決まったキャラと強さ）と、BOT のキャラのステージ・ギミックありで戦い、
// あなたが勝って、長いコンボ・超必殺・決着の一撃がある試合を書き出す。同じ設定なら必ず同じ試合になる。
//   node tools/promo-scan.mjs [自分のキャラ] [BOTのキャラ] [BOTの強さ] [種の数]
//   例） node tools/promo-scan.mjs kagari tsuzumi normal 60
import { createMatch, step } from '../src/sim.js';
import { createCpu } from '../src/ai.js';
import { CHARS } from '../src/characters.js';

const [p1 = 'kagari', p2 = 'tsuzumi', level = 'normal', n = '60'] = process.argv.slice(2);
const stage = CHARS[p2].stage;
const out = [];

for (let seed = 1; seed <= Number(n); seed++) {
  const seeds = [seed * 7919, seed * 104729];
  const s = createMatch({ p1, p2, stage, gimmicks: true });
  const cpus = [createCpu('hard', seeds[0]), createCpu(level, seeds[1])];
  let best = null;
  const supers = [];
  let ko = null;
  let f = 0;
  for (f = 1; f <= 60 * 60 * 4 && s.phase !== 'over'; f++) {
    step(s, [cpus[0](s, 0), cpus[1](s, 1)]);
    for (const e of s.events) {
      if (e.t === 'hit' && e.by === 0 && (!best || e.hits > best.hits)) best = { f, hits: e.hits, dmg: e.combo };
      if (e.t === 'super' && e.by === 0) supers.push(f);
      if (e.t === 'hit' && e.ko && e.by === 0) ko = { f, hits: e.hits, dmg: e.combo };
    }
  }
  if (s.matchWinner !== 0 || !best || !ko) continue;
  const me = s.ps[0];
  out.push({
    seed: seeds, frames: f, wins: `${me.wins}-${s.ps[1].wins}`, best, supers, lastKo: ko,
    stats: { maxCombo: me.stats.maxCombo, dmg: me.stats.dmg, supers: me.stats.supers },
    score: best.hits + supers.length * 3 + (ko.hits >= 4 ? 5 : 0) + (s.ps[1].wins === 0 ? 4 : 0),
  });
}
out.sort((a, b) => b.score - a.score);
console.log(JSON.stringify({ p1, p2, level, stage, found: out.length, top: out.slice(0, 12) }, null, 1));
