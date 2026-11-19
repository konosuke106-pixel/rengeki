// 多言語対応のテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickLang, T, getLang, setLang, I18N_DICTS, LANGS } from '../src/i18n.js';

test('端末の言語から決める（地域付き・対象外を含む）', () => {
  assert.equal(pickLang(['fr']), 'en');
  assert.equal(pickLang(['pt-BR', 'es-419']), 'es');
  assert.equal(pickLang(['zh-TW']), 'zh');
  assert.equal(pickLang(['ko-KR']), 'ko');
  assert.equal(pickLang(['ja-JP', 'en']), 'ja');
  assert.equal(pickLang([]), 'en');
  assert.deepEqual(LANGS.map((l) => l.id), ['ja', 'en', 'es', 'zh', 'ko']);
});

test('訳を引き、なければ日本語のまま。差し込みは訳がなくても効く', () => {
  setLang('ja');
  assert.equal(T('勝利！'), '勝利！');
  I18N_DICTS.en['テスト{n}回'] = 'test {n} times';
  setLang('en');
  assert.equal(T('テスト{n}回', { n: 3 }), 'test 3 times');
  assert.equal(T('未訳の文{n}', { n: 1 }), '未訳の文1');
  delete I18N_DICTS.en['テスト{n}回'];
  setLang('ja');
});

test('保存できない環境でも言語を切り替えられる', () => {
  setLang('ko');
  assert.equal(getLang(), 'ko');
  setLang('ja');
  assert.equal(getLang(), 'ja');
});

// ---- 訳の抜けを防ぐ ----
import { readFileSync, readdirSync } from 'node:fs';
import { CHARS, SPECIAL_COMMANDS } from '../src/characters.js';
import { STAGE_INFO } from '../src/stages.js';
import { createMatch, step, stateHash } from '../src/sim.js';
import { createCpu } from '../src/ai.js';

const root = new URL('../', import.meta.url);
function collectKeys() {
  const keys = new Set();
  for (const f of readdirSync(new URL('src/', root))) {
    if (!f.endsWith('.js') || f.startsWith('text-')) continue;
    const src = readFileSync(new URL(`src/${f}`, root), 'utf8');
    for (const m of src.matchAll(/\bTX?\((['"`])((?:(?!\1).)*)\1/g)) keys.add(m[2]);
  }
  const html = readFileSync(new URL('index.html', root), 'utf8');
  for (const m of html.matchAll(/<(\w+)\s[^>]*?\bdata-i18n(?=[\s>])[^>]*>([\s\S]*?)<\/\1>/g)) keys.add(m[2].trim().replace(/\s+/g, ' '));
  for (const m of html.matchAll(/aria-label="([^"]*)"[^>]*data-i18n-label/g)) keys.add(m[1]);
  for (const m of html.matchAll(/placeholder="([^"]*)"[^>]*data-i18n-ph/g)) keys.add(m[1]);
  for (const ch of Object.values(CHARS)) {
    [ch.name, ch.title, ch.style, ...Object.keys(ch.stats)].forEach((k) => keys.add(k));
    for (const mv of Object.values(ch.moves)) {
      if (mv.name) keys.add(mv.name);
      if (mv.hint) keys.add(mv.hint);
    }
  }
  for (const [, simple, motion] of SPECIAL_COMMANDS) [simple, motion].forEach((k) => k && keys.add(k));
  for (const st of Object.values(STAGE_INFO)) [st.name, st.note].forEach((k) => k && keys.add(k));
  keys.delete('');
  return keys;
}
const vars = (str) => [...str.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('全部の文に4言語の訳がある', () => {
  const keys = collectKeys();
  assert.ok(keys.size > 300, `鍵の数 ${keys.size}`);
  for (const [lang, dict] of Object.entries(I18N_DICTS)) {
    const missing = [...keys].filter((k) => !dict[k]);
    assert.deepEqual(missing, [], `${lang} に訳がない`);
  }
});

test('差し込みの名前が日本語と訳で一致する', () => {
  for (const [lang, dict] of Object.entries(I18N_DICTS)) {
    for (const [k, v] of Object.entries(dict)) assert.equal(vars(v), vars(k), `${lang}: ${k}`);
  }
});

test('辞書に使われていない鍵がない', () => {
  const keys = collectKeys();
  for (const [lang, dict] of Object.entries(I18N_DICTS)) {
    assert.deepEqual(Object.keys(dict).filter((k) => !keys.has(k)), [], `${lang} の古い訳`);
  }
});

test('言語を変えても試合は同じ', () => {
  const run = (lang) => {
    setLang(lang);
    const s = createMatch({ p1: 'kagari', p2: 'hayate', stage: 'storm', gimmicks: true });
    const a = createCpu('hard', 3);
    const b = createCpu('normal', 4);
    for (let i = 0; i < 1500; i++) step(s, [a(s, 0), b(s, 1)]);
    return stateHash(s);
  };
  const ja = run('ja');
  assert.equal(run('es'), ja);
  setLang('ja');
});

test('タイトルのロゴはどの言語でも同じ字体（中国語の字体の差し替えを受けない）', () => {
  const css = readFileSync(new URL('styles.css', root), 'utf8');
  const logo = css.match(/^\.logo\s*\{([^}]*)\}/m);
  assert.ok(logo && /font-family:\s*"Dela Gothic One"/.test(logo[1]), '.logo に "Dela Gothic One" を直接指定する');
});
