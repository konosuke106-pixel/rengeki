// 中継役（TURN）の合い鍵：サイトの窓口（functions/api/ice.js）と、ゲーム側の受け取り（net.js の loadIceServers）
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, ICE_TTL_SECONDS } from '../functions/api/ice.js';
import { loadIceServers } from '../src/net.js';

const req = (site = 'same-origin') => new Request('https://rengeki.pages.dev/api/ice', { headers: site ? { 'Sec-Fetch-Site': site } : {} });
const env = { TURN_KEY_ID: 'kid', TURN_KEY_API_TOKEN: 'secret-token' };

function withFetch(fake, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = fake;
  return Promise.resolve(fn()).finally(() => { globalThis.fetch = real; });
}

test('窓口：このサイトのページからだけ答え、鍵の暗号は外に出さない。ポート53は外す', async () => {
  let called = null;
  await withFetch(async (url, opts) => {
    called = { url, opts };
    return new Response(JSON.stringify({ iceServers: [
      { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
      { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' },
    ] }), { status: 201 });
  }, async () => {
    const res = await onRequestGet({ request: req(), env });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    const text = await res.text();
    assert.ok(!text.includes('secret-token'), '暗号を返さない');
    const body = JSON.parse(text);
    assert.deepEqual(body.iceServers[0].urls, ['stun:stun.cloudflare.com:3478']);
    assert.deepEqual(body.iceServers[1].urls, ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp']);
    assert.equal(body.iceServers[1].username, 'u');
  });
  assert.match(called.url, /\/v1\/turn\/keys\/kid\/credentials\/generate-ice-servers$/);
  assert.equal(called.opts.headers.Authorization, 'Bearer secret-token');
  assert.equal(JSON.parse(called.opts.body).ttl, ICE_TTL_SECONDS);
});

test('窓口：他のサイトからは断り、鍵がなければ「設定なし」と答える', async () => {
  await withFetch(async () => { throw new Error('呼ばれないはず'); }, async () => {
    assert.equal((await onRequestGet({ request: req('cross-site'), env })).status, 403);
    assert.equal((await onRequestGet({ request: req(null), env })).status, 403);
    assert.equal((await onRequestGet({ request: req(), env: {} })).status, 503);
  });
});

test('窓口：Cloudflare が失敗したら 502', async () => {
  await withFetch(async () => new Response('no', { status: 401 }), async () => {
    assert.equal((await onRequestGet({ request: req(), env })).status, 502);
  });
});

test('ゲーム側：合い鍵をもらえたら STUN に足す。もらえなければ STUN だけで続け、次は聞き直す', async () => {
  let calls = 0;
  const fail = async () => { calls++; return new Response('', { status: 503 }); };
  const first = await loadIceServers(fail);
  assert.deepEqual(first.map((s) => s.urls), ['stun:stun.l.google.com:19302']);
  const ok = async () => {
    calls++;
    return new Response(JSON.stringify({ iceServers: [{ urls: ['turn:turn.cloudflare.com:3478'], username: 'u', credential: 'c' }] }));
  };
  const second = await loadIceServers(ok);
  assert.equal(second.length, 2);
  assert.equal(second[1].username, 'u');
  await loadIceServers(ok); // 覚えているので聞かない
  assert.equal(calls, 2);
});
