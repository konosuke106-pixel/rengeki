// アカウント部品（src/account.js）の、サーバーにつながなくても確かめられる部分
import test from 'node:test';
import assert from 'node:assert/strict';
import { validName, callWithRetry, hasStoredLogin } from '../src/account.js';

test('表示名は前後の空白を除いて2〜12文字', () => {
  assert.equal(validName('  ア '), null);
  assert.equal(validName('カガリ'), 'カガリ');
  assert.equal(validName('  Kagari99 '), 'Kagari99');
  assert.equal(validName('あいうえおかきくけこさし'), 'あいうえおかきくけこさし');
  assert.equal(validName('あいうえおかきくけこさしす'), null);
  assert.equal(validName(''), null);
  assert.equal(validName(null), null);
});

test('報告は失敗したら間を空けて送り直し、成功した結果を返す', async () => {
  let calls = 0;
  const waits = [];
  const rpc = async (fn, args) => {
    calls++;
    assert.equal(fn, 'report_match');
    assert.deepEqual(args, { p_room: 'Rx', p_gen: 0 });
    return calls < 3 ? { data: null, error: { message: 'net' } } : { data: { delta: 16, rating: 1516 }, error: null };
  };
  const out = await callWithRetry(rpc, 'report_match', { p_room: 'Rx', p_gen: 0 }, [1000, 3000, 9000], async (ms) => { waits.push(ms); });
  assert.deepEqual(out, { delta: 16, rating: 1516 });
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1000, 3000]);
});

test('ずっと失敗しても例外を出さず null を返す（試合は止めない）', async () => {
  let calls = 0;
  const out = await callWithRetry(async () => { calls++; throw new Error('offline'); }, 'start_match', {}, [1, 1, 1], async () => {});
  assert.equal(out, null);
  assert.equal(calls, 4);
});

test('ログインの記録がなければ、通信用の部品を読み込まない', () => {
  assert.equal(hasStoredLogin(), false);
});

import { rankedMatchInfo, matchResultFor } from '../src/account.js';

test('レートが付くのは、ランダム対戦で2人ともログイン（名前あり）の時だけ', () => {
  assert.deepEqual(rankedMatchInfo({ random: true, myUid: 'a', peerUid: 'b' }), { oppId: 'b' });
  assert.equal(rankedMatchInfo({ random: false, myUid: 'a', peerUid: 'b' }), null, '部屋コードの対戦');
  assert.equal(rankedMatchInfo({ random: true, myUid: null, peerUid: 'b' }), null, '自分がゲスト');
  assert.equal(rankedMatchInfo({ random: true, myUid: 'a', peerUid: null }), null, '相手がゲスト');
  assert.equal(rankedMatchInfo({ random: true, myUid: 'a', peerUid: 'a' }), null, '同じ人');
});

test('試合の結果を自分から見た勝ち・負け・引き分けにする', () => {
  assert.equal(matchResultFor({ matchWinner: 0 }, 0), 'win');
  assert.equal(matchResultFor({ matchWinner: 0 }, 1), 'loss');
  assert.equal(matchResultFor({ matchWinner: 1 }, 1), 'win');
  assert.equal(matchResultFor({ matchWinner: -1 }, 0), 'draw');
});

import { abnormalEndResult } from '../src/account.js';
import { makeRoomCode } from '../src/net.js';

test('試合の途中で異常に終わったら（切断・食い違い）「相手が切れた」と届ける。結果を届けた後や、レートなしの試合は何もしない', () => {
  const base = { ranked: { oppId: 'b' }, inMatch: true, reportedGen: -1, generation: 0 };
  assert.equal(abnormalEndResult(base), 'dc');
  assert.equal(abnormalEndResult({ ...base, ranked: null }), null);
  assert.equal(abnormalEndResult({ ...base, inMatch: false }), null);
  assert.equal(abnormalEndResult({ ...base, reportedGen: 0 }), null);
});

test('ランダム対戦の部屋名は、サーバーが受け付ける形（R＋8文字）になっている', () => {
  for (let i = 0; i < 200; i++) assert.match(`R${makeRoomCode()}${makeRoomCode()}`, /^R[2-9A-HJ-NP-Z]{8}$/);
});

import { pickGuestBot } from '../src/account.js';

test('ログインしていない人の BOT は、レートが一番近い1体（同じ近さなら弱い方）', () => {
  const bots = [{ id: 'a', rating: 1100 }, { id: 'b', rating: 1450 }, { id: 'c', rating: 1550 }, { id: 'd', rating: 1850 }];
  assert.equal(pickGuestBot(bots).id, 'b');
  assert.equal(pickGuestBot(bots, 1800).id, 'd');
  assert.equal(pickGuestBot(bots, 900).id, 'a');
  assert.equal(pickGuestBot([]), null);
});
