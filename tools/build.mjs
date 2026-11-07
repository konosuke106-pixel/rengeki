// 全ファイルを1つのHTMLにまとめる。 npm run build → dist/rengeki.html
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');
const ORDER = ['config', 'characters', 'sim', 'rollback', 'online-config', 'net', 'ai', 'input', 'poses', 'audio', 'render', 'main'];

const js = ORDER.map((name) => read(`src/${name}.js`)
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*$/gm, '')
  .replace(/^export\s+(?=(const|let|function|class)\b)/gm, '')).join('\n');
if (/^\s*(import|export)\s/m.test(js)) throw new Error('import/export が残っています');

const html = read('index.html');
const body = html.match(/<!-- build:body -->([\s\S]*?)<!-- \/build:body -->/)[1];
const css = read('styles.css');

const out = `<title>連撃 RENGEKI</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Zen+Kaku+Gothic+New:wght@500;700;900&display=swap">
<style>
${css}</style>
${body}
<script>
(() => {
${js.replace(/<\/script/g, '<\\/script')}
})();
</script>
`;
mkdirSync(root + 'dist', { recursive: true });
writeFileSync(root + 'dist/rengeki.html', out);
// 普通のWebサイトとして置く場合や、公開前の確認に使う完全なページ
writeFileSync(root + 'dist/index.html', `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<meta name="theme-color" content="#15101c">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="連撃">
${out}</html>
`);
for (const file of ['manifest.webmanifest', 'icon.svg']) copyFileSync(root + file, root + 'dist/' + file);
console.log(`dist/rengeki.html ${(out.length / 1024).toFixed(0)} KB`);
