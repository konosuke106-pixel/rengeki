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
