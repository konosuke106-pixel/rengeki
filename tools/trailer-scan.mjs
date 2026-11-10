// 宣伝動画（tools/trailer.html）に使う見せ場を探す。CPU どうしを戦わせて、
// 長いコンボ・超必殺・ジャストガード・回避・ステージの仕掛けが起きたコマを書き出す。
// 同じ設定なら必ず同じ試合になるので、見つけた場面は trailer.html で再生できる。
//   node tools/trailer-scan.mjs [種の数]
import { createMatch, step } from '../src/sim.js';
import { createCpu } from '../src/ai.js';
import { CHARS } from '../src/characters.js';

const ids = Object.keys(CHARS);
const seeds = Number(process.argv[2] || 6);
const found = { combo: [], super: [], justGuard: [], evade: [], stage: [], ko: [] };

for (let a = 0; a < ids.length; a++) {
  for (let seed = 1; seed <= seeds; seed++) {
    const p1 = ids[a];
    const p2 = ids[(a + seed) % ids.length];
    const stage = CHARS[p2].stage;
    const s = createMatch({ p1, p2, stage, gimmicks: true });
    const cpus = [createCpu('hard', seed * 7919 + a), createCpu('hard', seed * 104729 + a)];
    for (let f = 1; f <= 60 * 60 * 3 && s.phase !== 'over'; f++) {
      step(s, [cpus[0](s, 0), cpus[1](s, 1)]);
      const clip = { p1, p2, stage, seed: [seed * 7919 + a, seed * 104729 + a], f };
      for (const e of s.events) {
        if (e.t === 'hit' && e.hits >= 6) found.combo.push({ ...clip, hits: e.hits, dmg: e.combo, by: e.by });
        if (e.t === 'hit' && e.ko) found.ko.push({ ...clip, hits: e.hits, by: e.by });
        if (e.t === 'super') found.super.push({ ...clip, by: e.by });
        if (e.t === 'justGuard') found.justGuard.push({ ...clip, by: e.by });
        if (e.t === 'evade') found.evade.push({ ...clip, by: e.by });
        if (['gust', 'burn', 'barrel', 'mirror', 'drum'].includes(e.t) || (e.t === 'hit' && e.by === -1)) found.stage.push({ ...clip, kind: e.t });
      }
    }
  }
}

const who = (c) => (c.by === 0 ? c.p1 : c.p2);
// キャラごとに一番長いコンボと、最初の超必殺を1つずつ
const bestBy = (list, key) => Object.values(list.reduce((m, c) => {
  const k = who(c);
  if (c.by >= 0 && (!m[k] || (key && c[key] > m[k][key]))) m[k] = c;
  return m;
}, {})).sort((x, y) => (y[key] || 0) - (x[key] || 0));
console.log(JSON.stringify({
  combo: bestBy(found.combo, 'hits'),
  ko: bestBy(found.ko, 'hits'),
  super: bestBy(found.super),
  justGuard: found.justGuard.slice(0, 20),
  evade: found.evade.slice(0, 20),
  stage: found.stage.filter((c, i, a) => a.findIndex((d) => d.stage === c.stage) === i),
}, null, 1));
