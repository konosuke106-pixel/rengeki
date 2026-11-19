// 多言語対応。コード中の日本語の文そのものを鍵にして、表示の直前に T() で訳を引く（訳がなければ日本語のまま）。
// HTML は data-i18n（中身）・data-i18n-label（aria-label）・data-i18n-ph（placeholder）を付けた要素を差し替える。
// 戦闘（sim.js）には関わらない。訳の辞書は text-en.js などに言語ごとに置く
import { TEXT_EN } from './text-en.js';
import { TEXT_ES } from './text-es.js';
import { TEXT_ZH } from './text-zh.js';
import { TEXT_KO } from './text-ko.js';

export const LANGS = [
  { id: 'ja', label: '日本語' },
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
  { id: 'zh', label: '简体中文' },
  { id: 'ko', label: '한국어' },
];
export const I18N_DICTS = { en: TEXT_EN, es: TEXT_ES, zh: TEXT_ZH, ko: TEXT_KO };
// 中国語・韓国語は日本語の字体に無い字があるので、その言語のときだけ字体を読み込む
const LANG_FONTS = {
  zh: { family: 'Noto Sans SC', url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@500;700;900&display=swap' },
  ko: { family: 'Noto Sans KR', url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@500;700;900&display=swap' },
};
const LANG_KEY = 'rengeki-lang';
const langListeners = [];
const domOriginals = new WeakMap();
const fontsLoaded = new Set();

// 端末の言語一覧（navigator.languages）から、最初に当てはまる言語を選ぶ。どれでもなければ英語
export function pickLang(list) {
  for (const raw of list || []) {
    const code = String(raw).toLowerCase();
    for (const id of ['ja', 'zh', 'ko', 'es', 'en']) {
      if (code === id || code.startsWith(`${id}-`)) return id;
    }
  }
  return 'en';
}

function startLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (LANGS.some((l) => l.id === saved)) return saved;
  } catch { /* 保存できない環境 */ }
  try {
    if (typeof navigator !== 'undefined') return pickLang(navigator.languages || [navigator.language]);
  } catch { /* 判定できない環境 */ }
  return 'ja';
}

let curLang = startLang();

export const getLang = () => curLang;

export function setLang(id) {
  if (!LANGS.some((l) => l.id === id)) return;
  curLang = id;
  try { localStorage.setItem(LANG_KEY, id); } catch { /* 保存できなくても切り替えは効く */ }
  for (const fn of langListeners) fn(id);
}

export function onLangChange(fn) {
  langListeners.push(fn);
}

export function T(ja, vars) {
  const dict = I18N_DICTS[curLang];
  let out = (dict && dict[ja]) || ja;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return out;
}

// 訳す文の目印だけを付ける（訳は表示する時に T で引く）。抜け検査のテストがこの印を探す
export const TX = (ja) => ja;

// 今の言語の字体の名前（canvas の font の先頭に足す用）。日本語・英語・スペイン語は空
export function langFontFamily() {
  const f = LANG_FONTS[curLang];
  return f ? `"${f.family}", ` : '';
}

export function applyDom(root) {
  if (typeof document === 'undefined') return;
  const remember = (el, key, read) => {
    let o = domOriginals.get(el);
    if (!o) domOriginals.set(el, (o = {}));
    if (!(key in o)) o[key] = read();
    return o[key];
  };
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.innerHTML = T(remember(el, 'html', () => el.innerHTML.trim().replace(/\s+/g, ' ')));
  }
  for (const el of root.querySelectorAll('[data-i18n-label]')) {
    el.setAttribute('aria-label', T(remember(el, 'label', () => el.getAttribute('aria-label') || '')));
  }
  for (const el of root.querySelectorAll('[data-i18n-ph]')) {
    el.setAttribute('placeholder', T(remember(el, 'ph', () => el.getAttribute('placeholder') || '')));
  }
  const html = document.documentElement;
  html.lang = curLang === 'zh' ? 'zh-Hans' : curLang;
  for (const l of LANGS) html.classList.toggle(`lang-${l.id}`, l.id === curLang);
  const font = LANG_FONTS[curLang];
  if (font && !fontsLoaded.has(curLang)) {
    fontsLoaded.add(curLang);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = font.url;
    document.head.append(link);
  }
}
