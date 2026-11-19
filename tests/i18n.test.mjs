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
