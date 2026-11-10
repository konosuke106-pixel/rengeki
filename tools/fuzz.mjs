// でたらめな入力を大量に流して、おかしな状態を探す。使い方：node tools/fuzz.mjs [乱数の種] [キャラID]
import { createMatch, step, moveOf } from '../src/sim.js';
import { CHAR_IDS, CHARS } from '../src/characters.js';
import { STAGE_IDS } from '../src/stages.js';
import { METER_MAX } from '../src/config.js';

let seed = Number(process.argv[2] || 1);
const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
const only = process.argv[3];
const problems = new Map();
const note = (key, msg) => { if (!problems.has(key)) problems.set(key, msg); };

function inputGen() {
  let hold = 0; let t = 0;
  return () => {
    if (t-- <= 0) {
      t = Math.floor(rnd() * 20);
      hold = 0;
      const r = rnd();
      if (r < 0.3) hold |= [1, 2, 4, 8, 9, 5, 10, 6][Math.floor(rnd() * 8)];
      if (rnd() < 0.15) hold |= 1; // 上を押しっぱなし（滑空など）
    }
    let m = hold;
    if (rnd() < 0.18) m |= [16, 32, 64, 128, 256, 512][Math.floor(rnd() * 6)];
    if (rnd() < 0.05) m ^= (rnd() < 0.5 ? 4 : 8); // はじき（ダッシュ）
    return m;
  };
}

for (const a of CHAR_IDS) {
  if (only && a !== only) continue;
  for (const b of CHAR_IDS) {
    const stage = STAGE_IDS[Math.floor(rnd() * STAGE_IDS.length)];
    const s = createMatch({ p1: a, p2: b, stage, gimmicks: rnd() < 0.7, training: rnd() < 0.3 });
    const ga = inputGen(); const gb = inputGen();
    const air = [0, 0]; const same = [0, 0]; const last = [null, null];
    for (let f = 0; f < 6000 && s.phase !== 'over'; f++) {
      if (rnd() < 0.002) s.ps.forEach((p) => { p.meter = METER_MAX; });
      step(s, [ga(), gb()]);
      s.ps.forEach((p, i) => {
        const tag = `${p.char}(${i ? 'p2' : 'p1'}) vs ${s.ps[1 - i].char} @${s.stage}`;
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.hp) || !Number.isFinite(p.vx) || !Number.isFinite(p.vy)) note(`nan:${p.char}`, `数値が壊れた ${tag} st=${p.st} move=${p.move}`);
        if (p.y < 0) note(`under:${p.char}:${p.st}`, `地面の下 ${tag} st=${p.st} move=${p.move} y=${p.y}`);
        if (Math.abs(p.x) > 821) note(`out:${p.char}`, `場外 ${tag} x=${p.x}`);
        if (p.hp > CHARS[p.char].hp) note(`hpmax:${p.char}`, `体力が最大を超えた ${tag}`);
        if (p.meter > METER_MAX || p.meter < 0) note(`meter:${p.char}`, `ゲージ異常 ${tag} ${p.meter}`);
        // 空中に居続ける
        if (s.freeze === 0) air[i] = p.y > 0 ? air[i] + 1 : 0;
        if (p.y > 900) note(`high:${p.char}`, `画面のはるか上まで飛んだ ${tag} y=${p.y.toFixed(0)} combo=${p.comboHits} training=${s.training}`);
        if (air[i] > 600 && s.freeze === 0) note(`air:${p.char}:${p.st}:${p.move}`, `空中に10秒以上 ${tag} st=${p.st} move=${p.move} f=${p.f} y=${p.y.toFixed(1)} vy=${p.vy.toFixed(2)} vx=${p.vx.toFixed(2)} combo=${p.comboHits} 相手=${s.ps[1 - i].st}/${s.ps[1 - i].move} 毒=${p.poison} 爆弾=${p.bombT} training=${s.training}`);
        // 状態とコマが止まったまま
        const key = `${p.st}|${p.move}|${p.f}|${Math.round(p.x)}|${Math.round(p.y)}`;
        same[i] = key === last[i] && p.hitstop === 0 && s.freeze === 0 && p.st !== 'idle' && p.st !== 'crouch' && p.st !== 'block' && p.st !== 'win' ? same[i] + 1 : 0;
        last[i] = key;
        if (same[i] > 120) note(`stuck:${p.char}:${p.st}:${p.move}`, `動かない ${tag} st=${p.st} move=${p.move} f=${p.f} y=${p.y}`);
        // 技が長さを超えて続く
        const m = moveOf(p);
        if (p.st === 'attack' && m && p.f > m.total + 60 && !m.air) note(`long:${p.char}:${p.move}`, `技が終わらない ${tag} move=${p.move} f=${p.f}/${m.total} y=${p.y}`);
        if (p.st === 'attack' && !m) note(`nomove:${p.char}`, `技がないのに攻撃中 ${tag}`);
        if (p.stun > 400) note(`stun:${p.char}`, `のけぞりが長すぎる ${tag} ${p.stun}`);
      });
      if (s.projs.length > 30) note(`projs`, `飛び道具が増えすぎ ${s.projs.length} @${s.stage}`);
      if (s.gim && s.gim.haz.length > 10) note(`haz`, `仕掛けが増えすぎ @${s.stage}`);
    }
  }
}
for (const msg of problems.values()) console.log(msg);
console.log(`見つかった問題 ${problems.size} 件`);
