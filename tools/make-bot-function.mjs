// BOT 戦の Edge Function（supabase/functions/bot-match）に、ゲームの戦闘コードの写しと版の印を置く。
// 先に node tools/build.mjs を動かして dist/version.txt を作っておく。GitHub Actions が push のたびにこれを動かして配置する
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}supabase/functions/bot-match/game/`;
const FILES = ['config', 'characters', 'stages', 'sim', 'ai', 'replay'];

const version = readFileSync(`${root}dist/version.txt`, 'utf8').trim();
if (!/^[0-9a-f]{10}$/.test(version)) throw new Error(`版の印がおかしい: ${version}`);
mkdirSync(out, { recursive: true });
for (const f of FILES) copyFileSync(`${root}src/${f}.js`, `${out}${f}.js`);
writeFileSync(`${out}version.js`, `// tools/make-bot-function.mjs が作る。ゲームの版の印（net.js の NET_VERSION と同じ）\nexport const GAME_VERSION = '${version}';\n`);
console.log(`bot-match: ${FILES.length} files, version ${version}`);
