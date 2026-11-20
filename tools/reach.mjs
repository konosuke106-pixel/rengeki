// 技の「リーチ・威力・速さ・隙」の表を、戦闘エンジンで実際に動かして測る。
// node tools/reach.mjs [キャラID...] [--json]
//  届く … 自分の体の前の端から、技が当たる一番遠い所までの長さ（相手はカガリで、何もしない立ち）。
//         前へ出ながら殴る技は、その分も入る。体の幅が違っても比べられるよう、自分と相手の体の半分を引いている
//  発生 … ボタンを押してから最初に当たり判定が出るまでのコマ数
//  隙   … 当たり判定が消えてから動けるまでのコマ数（空振りした時に殴られる長さ）
//  ガード … ガードされた後、相手より何コマ早く動けるか（マイナスは不利＝反撃されやすい）
import { createMatch, step, cloneState } from '../src/sim.js';
import { BTN } from '../src/config.js';
import { CHARS, CHAR_IDS } from '../src/characters.js';

const INPUT = {
  sL: BTN.A, sM: BTN.B, sH: BTN.C, cL: BTN.D | BTN.A, cM: BTN.D | BTN.B, cH: BTN.D | BTN.C,
  spN: BTN.S, spD: BTN.S | BTN.D, spF: BTN.S | BTN.R,
};
const DUMMY = 'kagari';

function ready(id) {
  const s = createMatch({ p1: id, p2: DUMMY });
  for (let i = 0; i < 91; i++) step(s, [0, 0]);
  return s;
}

function place(base, gap) {
  const s = cloneState(base);
  s.ps[0].x = -gap / 2;
  s.ps[1].x = gap / 2;
  s.ps[0].facing = 1;
  s.ps[1].facing = -1;
  return s;
}

// 技を1回出して、相手に与えた合計ダメージを返す（guard を渡すとガードさせて有利不利も測る）
function run(base, id, gap, guard = 0) {
  const s = place(base, gap);
  const [a, d] = s.ps;
  if (guard) for (let i = 0; i < 12; i++) step(s, [0, guard]);
  const hp0 = d.hp;
  let blocked = false;
  let atkFree = -1;
  let defFree = -1;
  for (let f = 0; f < 200; f++) {
    step(s, [f < 2 ? INPUT[id] : 0, guard]);
    if (d.st === 'block') blocked = true;
    if (f > 2 && atkFree < 0 && a.st === 'idle') atkFree = f;
    if (blocked && defFree < 0 && (d.st === 'guard' || d.st === 'idle' || d.st === 'crouch')) defFree = f;
    if (atkFree >= 0 && (!guard || !blocked || defFree >= 0)) break;
  }
  return { dmg: hp0 - d.hp, blocked, adv: blocked && atkFree >= 0 && defFree >= 0 ? defFree - atkFree : null };
}

export function measure(id) {
  const ch = CHARS[id];
  const base = ready(id);
  const rows = [];
  for (const mid of Object.keys(INPUT)) {
    const m = ch.moves[mid];
    if (!m) continue;
    const boxes = m.boxes || [];
    const proj = !!(m.spawn && m.spawn.length);
    if (!boxes.length && !proj) { rows.push({ id: mid, name: m.name, special: true }); continue; }
    if (boxes.length && boxes[0].throw) { rows.push({ id: mid, name: m.name, throw: true }); continue; }
    // 近い所から遠い所まで並べて、当たる一番遠い間合いと、一番ダメージが出る間合いを探す
    let far = -1;
    let best = { gap: -1, dmg: 0 };
    for (let gap = 70; gap <= 900; gap += 2) {
      const r = run(base, mid, gap);
      if (r.dmg > 0) far = gap;
      if (r.dmg > best.dmg) best = { gap, dmg: r.dmg };
    }
    const first = boxes[0];
    const last = boxes[boxes.length - 1];
    const lv = first ? first.lv : m.spawn[0].lv;
    const guard = BTN.G | (lv === 'l' ? BTN.D : 0);
    const g = best.gap > 0 ? run(base, mid, best.gap, guard) : { adv: null };
    rows.push({
      id: mid, name: m.name, proj,
      startup: first ? first.from : m.spawn[0].f,
      total: m.total,
      recovery: last ? m.total - last.to : m.total - m.spawn[m.spawn.length - 1].f,
      dmg: best.dmg,
      reach: far > 0 ? Math.round(far - CHARS[DUMMY].w / 2 - ch.w / 2) : null,
      adv: g.adv,
    });
  }
  return rows;
}

// 釣り合いの点数。リーチ1割長い ＝ 威力2割高い ＝ 発生1コマ速い ＝ 隙3コマ短い を、どれも「1点の得」と数える
const GROUND = ['sL', 'sM', 'sH', 'cL', 'cM', 'cH'];
const sum = (rows, key) => GROUND.reduce((t, id) => t + rows.find((r) => r.id === id)[key], 0);

// 通常技：カガリを 0点として、地上の通常技6つの合計で比べる。0点（±0.5）に収めるのが決まり
export function normalScore(rows, base) {
  const reach = sum(rows, 'reach') / sum(base, 'reach') - 1;
  const dmg = sum(rows, 'dmg') / sum(base, 'dmg') - 1;
  const sp = (sum(rows, 'startup') - sum(base, 'startup')) / GROUND.length;
  const rec = (sum(rows, 'recovery') - sum(base, 'recovery')) / GROUND.length;
  return { reach, dmg, sp, rec, score: reach / 0.1 + dmg / 0.2 - sp - rec / 3 };
}

// 必殺の突進・突き技（飛び道具・投げ・回り込みを除き、体から150以上届く地上の技）：
// 「届く250・発生10・威力85・ガード−15」を 0点として、+2点以内に収める（アーマー・下段・引き寄せ・毒・爆弾は個性として数えない）
export const SPECIAL_BASE = { reach: 250, startup: 10, dmg: 85, adv: -15 };
export function specialScore(r) {
  const b = SPECIAL_BASE;
  return (r.reach / b.reach - 1) / 0.1 + (r.dmg / b.dmg - 1) / 0.2 + (b.startup - r.startup) + (r.adv - b.adv) / 3;
}
export const isLongSpecial = (ch, r) => r.id.startsWith('sp') && !r.proj && !r.special && !r.throw
  && !ch.moves[r.id].warp && r.reach >= 150 && r.adv !== null;

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/reach.mjs');
if (isMain) {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const out = {};
  const base = measure('kagari');
  const scores = [];
  for (const id of ids.length ? ids : CHAR_IDS) {
    out[id] = measure(id);
    const ns = normalScore(out[id], base);
    const sps = out[id].filter((r) => isLongSpecial(CHARS[id], r)).map((r) => ({ name: r.name, score: specialScore(r) }));
    scores.push({ id, ns, sps });
    if (process.argv.includes('--json')) continue;
    console.log(`\n${CHARS[id].name}（体の幅 ${CHARS[id].w}）`);
    console.log('技        届く  発生  隙  全体  威力  ガード');
    for (const r of out[id]) {
      const label = `${r.id.padEnd(5)} `;
      if (r.special || r.throw) { console.log(`${label}${r.throw ? '（投げ）' : '（当たり判定なし）'} ${r.name}`); continue; }
      const cols = [r.proj ? '飛' : String(r.reach ?? '-'), r.startup, r.recovery, r.total, r.dmg, r.adv ?? '-'];
      console.log(`${label}${cols.map((c, i) => String(c).padStart(i === 0 ? 4 : 5)).join(' ')}  ${r.name}`);
    }
  }
  if (process.argv.includes('--json')) { console.log(JSON.stringify(out)); process.exit(0); }
  const pct = (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
  const num = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
  console.log('\n釣り合いの点数（カガリ＝0。通常技は ±0.5 以内、必殺の突進・突き技は +2 以内が決まり）');
  console.log('キャラ        リーチ  威力  発生  隙   通常技の点  必殺の突進・突き技');
  for (const { id, ns, sps } of scores) {
    const mark = Math.abs(ns.score) > 0.5 ? (ns.score > 0 ? ' ←得しすぎ' : ' ←損') : '';
    const spText = sps.map((x) => `${x.name}${num(x.score)}${x.score > 2 ? '←' : ''}`).join(' ');
    console.log(`${CHARS[id].name.padEnd(6, '　')} ${pct(ns.reach).padStart(5)} ${pct(ns.dmg).padStart(5)} ${num(ns.sp).padStart(5)} ${num(ns.rec).padStart(4)}  ${num(ns.score).padStart(6)}${mark.padEnd(7, '　')}  ${spText}`);
  }
}
