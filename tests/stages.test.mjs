// ステージの仕掛け（ギミック）のテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step, cloneState, stateHash } from '../src/sim.js';
import { BTN, ROUND_FRAMES } from '../src/config.js';
import { CHARS } from '../src/characters.js';
import { STAGE_IDS, STAGE_INFO } from '../src/stages.js';
import { createCpu } from '../src/ai.js';

function ready(stage, { gimmicks = true, p1 = 'kagari', p2 = 'kagari', gap = 420 } = {}) {
  const s = createMatch({ p1, p2, stage, gimmicks });
  for (let i = 0; i < 91; i++) step(s, [0, 0]);
  assert.equal(s.phase, 'fight');
  s.ps[0].x = -gap / 2;
  s.ps[1].x = gap / 2;
  return s;
}

function run(s, n, p1 = 0, p2 = 0) {
  for (let i = 0; i < n; i++) step(s, [typeof p1 === 'function' ? p1(i, s) : p1, typeof p2 === 'function' ? p2(i, s) : p2]);
}

// 仕掛けのコマ（s.gim.t）が n になるまで進める
function until(s, n, p1 = 0, p2 = 0) {
  while (s.gim.t < n) step(s, [p1, p2]);
}

test('全ステージに名前と仕掛けの説明がある', () => {
  assert.equal(STAGE_IDS.length, 17);
  for (const id of STAGE_IDS) {
    assert.ok(STAGE_INFO[id].name && STAGE_INFO[id].note && STAGE_INFO[id].gim, id);
  }
  for (const ch of Object.values(CHARS)) assert.ok(STAGE_IDS.includes(ch.stage), `${ch.id} のステージ ${ch.stage}`);
});

test('ギミックなしなら、どのステージでも何も起きない', () => {
  for (const id of STAGE_IDS) {
    const s = ready(id, { gimmicks: false });
    const xs = s.ps.map((p) => p.x);
    run(s, 1300);
    assert.deepEqual(s.ps.map((p) => p.x), xs, `${id} 立っているだけで動かない`);
    assert.equal(s.ps[0].hp + s.ps[1].hp, CHARS.kagari.hp * 2, `${id} ダメージなし`);
    assert.equal(s.gim.haz.length, 0);
  }
});

test('闘技場：ギミック「あり」でも何も起きない普通の舞台', () => {
  const s = ready('arena');
  const xs = s.ps.map((p) => p.x);
  run(s, 2000);
  assert.deepEqual(s.ps.map((p) => p.x), xs);
  assert.equal(s.ps[0].hp + s.ps[1].hp, CHARS.kagari.hp * 2);
  assert.equal(s.ps[0].meter + s.ps[1].meter, 0);
  assert.equal(s.gim.haz.length, 0);
  assert.equal(STAGE_IDS[0], 'arena', '選択画面で「おまかせ」の次に出る');
});

test('夕焼け峠：予告のあと突風が吹き、2人とも同じ向きに流される', () => {
  const s = ready('sunset');
  const w = STAGE_INFO.sunset.gim.wind;
  until(s, w.every + w.warn);
  const xs = s.ps.map((p) => p.x);
  run(s, 60);
  const moved = s.ps.map((p, i) => p.x - xs[i]);
  assert.ok(Math.abs(moved[0]) > 80 && Math.abs(moved[1]) > 80, `流れた距離 ${moved.map(Math.round)}`);
  assert.equal(Math.sign(moved[0]), Math.sign(moved[1]), '同じ向き');
});

test('鉄の製錬所：画面端に叩きつけられると、やけどで追加のダメージ', () => {
  const dmg = (gimmicks) => {
    const s = ready('foundry', { gimmicks, gap: 0 });
    s.ps[0].x = 690;
    s.ps[1].x = 770;
    run(s, 2, BTN.C);
    run(s, 60);
    return CHARS.kagari.hp - s.ps[1].hp;
  };
  const plain = dmg(false);
  const hot = dmg(true);
  assert.ok(hot >= plain + 30, `${plain} → ${hot}`);
});

test('雨の社：攻撃を受けると遠くまで滑る', () => {
  const slide = (gimmicks) => {
    const s = ready('rain', { gimmicks, gap: 90 });
    const x0 = s.ps[1].x;
    run(s, 2, BTN.C);
    run(s, 50);
    return s.ps[1].x - x0;
  };
  assert.ok(slide(true) > slide(false) * 1.3, `${Math.round(slide(false))} → ${Math.round(slide(true))}`);
});

test('雷雲の頂：印の場所に雷が落ちる。印から離れればよけられる', () => {
  const sp = STAGE_INFO.storm.gim.spot;
  const stay = ready('storm');
  until(stay, sp.every);
  assert.equal(stay.gim.haz.length, 1, '印が出た');
  const target = stay.gim.haz[0].x;
  const who = stay.ps.findIndex((p) => p.x === target);
  run(stay, sp.warn + sp.active + 2);
  assert.ok(stay.ps[who].hp < CHARS.kagari.hp, '立ったままだと当たる');

  const flee = ready('storm');
  until(flee, sp.every);
  const t2 = flee.gim.haz[0].x;
  const who2 = flee.ps.findIndex((p) => p.x === t2);
  const away = flee.ps[who2].x < 0 ? BTN.L : BTN.R;
  run(flee, sp.warn + sp.active + 2, who2 === 0 ? away : 0, who2 === 1 ? away : 0);
  assert.equal(flee.ps[who2].hp, CHARS.kagari.hp, '印から離れればよけられる');
});

test('竹林・屋根・城門も印の場所に当たる（狙いは2人に交互）', () => {
  for (const id of ['bamboo', 'moonroof', 'castle']) {
    const sp = STAGE_INFO[id].gim.spot;
    const s = ready(id);
    until(s, sp.every);
    const first = s.gim.haz[0].x;
    run(s, sp.warn + sp.active + 2);
    assert.ok(s.ps[0].hp + s.ps[1].hp < CHARS.kagari.hp * 2, `${id} 当たった`);
    until(s, sp.every * 2);
    const second = s.gim.haz[s.gim.haz.length - 1].x;
    assert.notEqual(Math.sign(first), Math.sign(second), `${id} 狙いが交互`);
  }
});

test('雪原：歩きとダッシュが遅くなる', () => {
  const walk = (gimmicks) => {
    const s = ready('snow', { gimmicks });
    const x0 = s.ps[0].x;
    run(s, 40, BTN.R);
    return s.ps[0].x - x0;
  };
  const ratio = walk(true) / walk(false);
  assert.ok(ratio > 0.75 && ratio < 0.85, `比 ${ratio.toFixed(2)}`);
});

test('祭りの舞台：太鼓が鳴るたびに2人ともゲージが増える', () => {
  const s = ready('festival');
  const d = STAGE_INFO.festival.gim.drum;
  until(s, d.every - 1);
  const before = s.ps.map((p) => p.meter);
  run(s, 1);
  assert.deepEqual(s.ps.map((p, i) => p.meter - before[i]), [d.meter, d.meter]);
});

test('鬼の岩山：大岩が転がってくる。跳べばよけられる', () => {
  const mv = STAGE_INFO.onirock.gim.mover;
  const stand = ready('onirock');
  until(stand, mv.every);
  run(stand, mv.warn + 200);
  assert.ok(stand.ps[0].hp < CHARS.kagari.hp && stand.ps[1].hp < CHARS.kagari.hp, '立っていると2人とも当たる');

  const hop = ready('onirock');
  until(hop, mv.every);
  // 岩が近づいたら跳ぶ
  const jumper = (i, s) => {
    const h = s.gim.haz[0];
    return h && h.warn === 0 && Math.abs(h.x - s.ps[0].x) < 200 && Math.sign(s.ps[0].x - h.x) === Math.sign(h.vx) ? BTN.U : 0;
  };
  run(hop, mv.warn + 200, jumper, 0);
  assert.equal(hop.ps[0].hp, CHARS.kagari.hp, '跳んだ側は当たらない');
  assert.ok(hop.ps[1].hp < CHARS.kagari.hp, '跳ばなかった側は当たる');
});

test('港の倉庫：揺れる荷物に当たると吹き飛ぶ。しゃがめばくぐれる', () => {
  const c = STAGE_INFO.harbor.gim.crate;
  const stand = ready('harbor', { gap: 300 });
  run(stand, c.period);
  assert.ok(stand.ps[0].hp < CHARS.kagari.hp, '立っていると当たる');
  const duck = ready('harbor', { gap: 300 });
  run(duck, c.period, BTN.D, BTN.D);
  assert.equal(duck.ps[0].hp + duck.ps[1].hp, CHARS.kagari.hp * 2, 'しゃがむとくぐれる');
});

test('紅葉の山道：つむじ風に巻き込まれると打ち上げられる', () => {
  const mv = STAGE_INFO.autumn.gim.mover;
  const s = ready('autumn');
  until(s, mv.every);
  let launched = false;
  for (let i = 0; i < mv.warn + 400 && !launched; i++) {
    step(s, [0, 0]);
    launched = s.ps.some((p) => p.st === 'hitair');
  }
  assert.ok(launched);
});

test('霧の沼地：霧の中にいると毒になる', () => {
  const sp = STAGE_INFO.swamp.gim.spot;
  const s = ready('swamp');
  until(s, sp.every);
  run(s, sp.warn + 5);
  assert.ok(s.ps.some((p) => p.poison > 0), '毒になった');
});

test('鏡の間：飛び道具が画面端で1回だけ跳ね返る', () => {
  // 相手は撃つ向きと反対側にいる。火の玉は壁で返ってきて、撃った側を通り越し相手に向かう
  const shoot = (gimmicks) => {
    const s = ready('mirror', { gimmicks, gap: 0 });
    s.ps[0].x = 500;
    s.ps[1].x = -700;
    run(s, 1);
    s.ps[0].facing = 1;
    s.ps[1].x = -700;
    const flips = [];
    let lastVx = 0;
    step(s, [BTN.S, 0]);
    s.ps[0].facing = 1;
    step(s, [BTN.S, 0]);
    for (let i = 0; i < 160; i++) {
      step(s, [0, 0]);
      const q = s.projs[0];
      if (q) {
        if (lastVx && Math.sign(q.vx) !== Math.sign(lastVx)) flips.push(Math.round(q.x));
        lastVx = q.vx;
      }
    }
    return flips;
  };
  const on = shoot(true);
  assert.equal(on.length, 1, `跳ね返りは1回 ${on}`);
  assert.ok(on[0] > 780, '右の画面端で返った');
  assert.equal(shoot(false).length, 0, 'ギミックなしでは跳ね返らない');

  // 長く飛ぶ物でも、反対の端では跳ね返らずに消える
  const s = ready('mirror', { gap: 0 });
  s.ps[0].x = 0;
  s.ps[1].x = 0;
  s.ps[1].y = 900; // 当たらないよう遠くへ
  s.projs.push({ owner: 0, x: 700, y: 100, vx: 30, vy: 0, w: 40, h: 40, life: 999, age: 0, kind: 'fire', data: { dmg: 1 } });
  let flips = 0;
  let last = 30;
  for (let i = 0; i < 120 && s.projs.length; i++) {
    s.ps[1].y = 900;
    step(s, [0, 0]);
    const q = s.projs.find((p) => p.life > 0 && p.data.dmg === 1);
    if (q && Math.sign(q.vx) !== Math.sign(last)) { flips++; last = q.vx; }
  }
  assert.equal(flips, 1, '2回目の端では返らない');
});

test('雲の上の塔：重力が軽く、長く飛んでいられる', () => {
  const airtime = (gimmicks) => {
    const s = ready('skytower', { gimmicks });
    run(s, 2, BTN.U);
    let n = 0;
    while ((s.ps[0].y > 0 || n < 5) && n < 300) { step(s, [0, 0]); n++; }
    return n;
  };
  assert.ok(airtime(true) > airtime(false) * 1.2, `${airtime(false)} → ${airtime(true)}`);
});

test('火薬工房：樽に攻撃を当てると爆発して、近くの相手を吹き飛ばす', () => {
  const b = STAGE_INFO.powder.gim.barrels;
  const s = ready('powder', { gap: 0 });
  // 樽を挟んで、自分は樽の左、相手は樽の右
  // 足払いは相手まで届かないが、爆発は届く位置
  s.ps[0].x = b.xs[1] - 70;
  s.ps[1].x = b.xs[1] + 110;
  run(s, 2, BTN.D | BTN.B); // 足元への攻撃で樽を叩く
  run(s, 40);
  assert.equal(s.ps[0].stats.hits, 0, '足払い自体は相手に当たっていない');
  assert.equal(s.gim.barrels[1].cd > 0, true, '樽が壊れた');
  assert.ok(s.ps[1].hp < CHARS.kagari.hp, '相手が吹き飛んだ');
});

test('ギミックありでも、同じ入力なら必ず同じ結果になる（全ステージ）', () => {
  for (const id of STAGE_IDS) {
    const runOnce = () => {
      const s = createMatch({ p1: 'hayate', p2: 'kogarashi', stage: id, gimmicks: true });
      const a = createCpu('hard', 7);
      const b = createCpu('normal', 8);
      for (let i = 0; i < 1500; i++) step(s, [a(s, 0), b(s, 1)]);
      return stateHash(s);
    };
    assert.equal(runOnce(), runOnce(), id);
  }
});

test('ギミックありでも、巻き戻して同じ入力を流すと同じ未来になる', () => {
  for (const id of ['storm', 'harbor', 'powder', 'sunset']) {
    const s = createMatch({ p1: 'kagari', p2: 'oni', stage: id, gimmicks: true });
    const a = createCpu('normal', 3);
    const b = createCpu('normal', 4);
    for (let i = 0; i < 700; i++) step(s, [a(s, 0), b(s, 1)]);
    const snap = cloneState(s);
    const inputs = [];
    for (let i = 0; i < 600; i++) {
      const m = [a(s, 0), b(s, 1)];
      inputs.push(m);
      step(s, m);
    }
    for (const m of inputs) step(snap, m);
    assert.equal(stateHash(s), stateHash(snap), id);
  }
});

test('ギミックありのCPU戦が全ステージで壊れずに決着する', () => {
  let seed = 500;
  for (const id of STAGE_IDS) {
    const s = createMatch({ p1: 'kusari', p2: 'tsubasa', stage: id, gimmicks: true });
    const a = createCpu('hard', ++seed);
    const b = createCpu('normal', ++seed);
    let frames = 0;
    while (s.phase !== 'over' && frames < (ROUND_FRAMES + 400) * 5) {
      step(s, [a(s, 0), b(s, 1)]);
      frames++;
      for (const f of s.ps) {
        assert.ok(Number.isFinite(f.x) && Number.isFinite(f.hp) && f.y >= 0 && Math.abs(f.x) <= 820, `${id} 数値異常`);
      }
    }
    assert.equal(s.phase, 'over', `${id} が終わらない`);
  }
});
