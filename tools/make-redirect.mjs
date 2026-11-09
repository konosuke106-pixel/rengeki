// 旧公開先（GitHub Pages）に置く、新しいアドレスへ自動で移動するページを作る。
// node tools/make-redirect.mjs → redirect/index.html と redirect/404.html
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const NEW_URL = 'https://rengeki.pages.dev/';
const root = fileURLToPath(new URL('..', import.meta.url));
const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>連撃 RENGEKI は引っ越しました</title>
<link rel="canonical" href="${NEW_URL}">
<meta http-equiv="refresh" content="0; url=${NEW_URL}">
<script>location.replace(${JSON.stringify(NEW_URL)});</script>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #15101c; color: #f5ecd6;
    font-family: "Hiragino Sans", "Yu Gothic", sans-serif; text-align: center; padding: 16px; box-sizing: border-box; }
  a { color: #f6c445; font-size: 1.3em; font-weight: 700; }
</style></head>
<body><div>
  <p>連撃 RENGEKI は新しいアドレスに引っ越しました。</p>
  <p><a href="${NEW_URL}">${NEW_URL}</a></p>
  <p>ホーム画面に追加している人は、新しいアドレスで追加し直してね。</p>
</div></body></html>
`;
mkdirSync(root + 'redirect', { recursive: true });
for (const name of ['index.html', '404.html']) writeFileSync(root + 'redirect/' + name, html);
console.log('redirect/ を作りました →', NEW_URL);
