// 開発用の簡易サーバー。 npm run dev で http://localhost:5180 を開く
// node tools/serve.mjs dist なら、ビルド済みの dist を本番と同じ安全用ヘッダー（_headers）付きで出す
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = process.argv[2] === 'dist';
const root = fileURLToPath(new URL(dist ? '../dist/' : '..', import.meta.url));
// _headers の「名前: 値」の行だけを読む（全ページ共通の /* だけ使っている）
const extra = dist ? Object.fromEntries(readFileSync(root + '_headers', 'utf8').split('\n')
  .map((line) => line.match(/^\s+([\w-]+):\s*(.+)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()])) : {};
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const port = Number(process.env.PORT || (dist ? 5181 : 5180));

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = normalize(join(root, path === '/' ? 'index.html' : path));
  if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', ...extra });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}`));
