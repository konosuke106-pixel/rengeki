// リーチ・威力・速さ・隙の釣り合いの決まりを見張る（数え方は tools/reach.mjs、決まりは characters.js の normals() の上）
// リーチが長いのに威力・速さ・隙で払っていない（＝得しすぎの）キャラや必殺技が出たら落ちる
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAR_IDS, CHARS } from '../src/characters.js';
import { measure, normalScore, specialScore, isLongSpecial } from '../tools/reach.mjs';

const base = measure('kagari');
const table = Object.fromEntries(CHAR_IDS.map((id) => [id, measure(id)]));

test('通常技：リーチ・威力・速さ・隙の点数が全員 −1〜+0.5 に収まっている', () => {
  for (const id of CHAR_IDS) {
    const { score, reach, dmg, sp, rec } = normalScore(table[id], base);
    const detail = `リーチ${Math.round(reach * 100)}% 威力${Math.round(dmg * 100)}% 発生${sp.toFixed(1)} 隙${rec.toFixed(1)}`;
    assert.ok(score <= 0.5, `${CHARS[id].name} が得しすぎ（${score.toFixed(2)}点：${detail}）`);
    assert.ok(score >= -1, `${CHARS[id].name} が損しすぎ（${score.toFixed(2)}点：${detail}）`);
  }
});

test('必殺の突進・突き技：遠くまで届く技は、威力・速さ・ガードされた時の不利で払っている（+2点まで）', () => {
  let n = 0;
  for (const id of CHAR_IDS) {
    for (const r of table[id].filter((x) => isLongSpecial(CHARS[id], x))) {
      n++;
      const score = specialScore(r);
      assert.ok(score <= 2, `${CHARS[id].name}の${r.name}が得しすぎ（${score.toFixed(2)}点：届く${r.reach} 発生${r.startup} 威力${r.dmg} ガード${r.adv}）`);
    }
  }
  assert.ok(n >= 10, `数えた技が少なすぎる（${n}）`);
});

test('ライ：一番遠くまで届く代わりに、威力が低めで隙が大きい', () => {
  const rai = normalScore(table.rai, base);
  for (const id of CHAR_IDS.filter((x) => x !== 'rai')) {
    assert.ok(rai.reach > normalScore(table[id], base).reach, `ライより ${CHARS[id].name} の方が届く`);
  }
  assert.ok(rai.dmg < 0, '威力がカガリより低い');
  assert.ok(rai.rec >= 3, '隙がカガリより3コマ以上大きい');
});
