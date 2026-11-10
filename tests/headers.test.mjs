// 公開ページの安全用ヘッダー（_headers）が、ゲームの読み込み元と食い違っていないかを確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SUPABASE_URL } from '../src/online-config.js';

const root = new URL('..', import.meta.url);
const headers = readFileSync(new URL('_headers', root), 'utf8');
const csp = headers.match(/Content-Security-Policy:\s*(.+)/)[1];
const directive = (name) => (csp.split(';').map((d) => d.trim().split(/\s+/)).find((d) => d[0] === name) || []).slice(1);

test('CSP は既定で自分のサイトだけを許し、埋め込みを禁止する', () => {
  assert.deepEqual(directive('default-src'), ["'self'"]);
  assert.deepEqual(directive('frame-ancestors'), ["'none'"]);
  assert.ok(!csp.includes("'unsafe-inline'"), 'ページ内に直接書いたスクリプトを許していない');
  assert.ok(!csp.includes("'unsafe-eval'"));
  assert.match(headers, /Strict-Transport-Security: max-age=31536000; includeSubDomains/);
  assert.match(headers, /X-Frame-Options: DENY/);
});

test('オンライン対戦の読み込み元が CSP に入っている', () => {
  const net = readFileSync(new URL('src/net.js', root), 'utf8');
  const script = net.match(/SUPABASE_SCRIPT = '([^']+)'/)[1];
  assert.ok(directive('script-src').some((src) => script.startsWith(src) && src !== "'self'"), `script-src に ${script} がない`);
  const host = new URL(SUPABASE_URL).host;
  assert.ok(directive('connect-src').includes(`https://${host}`));
  assert.ok(directive('connect-src').includes(`wss://${host}`));
});

test('HTML にページ内のスクリプトや style 属性を書いていない（CSP で止まるため）', () => {
  const html = readFileSync(new URL('index.html', root), 'utf8');
  assert.ok(!/\son\w+\s*=/.test(html), 'onclick などの属性');
  assert.ok(!/\sstyle\s*=/.test(html), 'style 属性');
  assert.ok(!/<script(?![^>]*\ssrc=)/.test(html), 'src のない script');
});
