// 宣伝動画を録画して dist/trailer.mp4（録れない環境では .webm）に保存する。
// 一時サーバーを立て、Edge を画面なしで開いて tools/trailer.html?record=1 を再生し、
// できた動画をこのサーバーに送ってもらう。再生と同じ時間（約32秒）かかる。
//   node tools/record-trailer.mjs
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, normalize, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const edge = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 5198;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

// 録画した mp4 は細切れ形式で、全体の長さが書かれていない（再生ソフトで長さが出ず、先送りもできない）。
// 細切れの中のコマの長さを足して全体の長さを求め、見出し（mvhd・tkhd・mdhd）に書き、mehd を足す
function fixMp4Duration(b) {
  const CONTAINERS = ['moov', 'trak', 'mdia', 'minf', 'stbl', 'mvex', 'moof', 'traf'];
  const walk = (s, e, out) => {
    for (let p = s; p < e;) {
      let size = b.readUInt32BE(p);
      const type = b.toString('latin1', p + 4, p + 8);
      if (size === 0) size = e - p;
      if (size === 1) size = Number(b.readBigUInt64BE(p + 8));
      out.push({ type, p, size });
      if (CONTAINERS.includes(type)) walk(p + 8, p + size, out);
      p += size;
    }
    return out;
  };
  const all = walk(0, b.length, []);
  const field = (box, v0, v1) => (b[box.p + 8] ? box.p + v1 : box.p + v0);
  const tracks = {};
  let tid = 0;
  for (const x of all) {
    if (x.type === 'tkhd') { tid = b.readUInt32BE(field(x, 20, 28)); tracks[tid] = { tkhd: x, dur: 0 }; }
    if (x.type === 'mdhd') { tracks[tid].mdhd = x; tracks[tid].ts = b.readUInt32BE(field(x, 20, 28)); }
    if (x.type === 'trex') tracks[b.readUInt32BE(x.p + 12)].defDur = b.readUInt32BE(x.p + 20);
  }
  let cur = 0;
  let defDur = 0;
  for (const x of all) {
    if (x.type === 'tfhd') {
      const flags = b.readUInt32BE(x.p + 8) & 0xffffff;
      cur = b.readUInt32BE(x.p + 12);
      let o = x.p + 16;
      if (flags & 1) throw new Error('base-data-offset 付きの mp4 には対応していません');
      if (flags & 2) o += 4;
      defDur = flags & 8 ? b.readUInt32BE(o) : tracks[cur].defDur;
    }
    if (x.type === 'trun') {
      const flags = b.readUInt32BE(x.p + 8) & 0xffffff;
      const n = b.readUInt32BE(x.p + 12);
      let o = x.p + 16 + (flags & 1 ? 4 : 0) + (flags & 4 ? 4 : 0);
      const per = [0x100, 0x200, 0x400, 0x800].filter((f) => flags & f).length * 4;
      for (let i = 0; i < n; i++, o += per) tracks[cur].dur += flags & 0x100 ? b.readUInt32BE(o) : defDur;
    }
  }
  const seconds = Math.max(...Object.values(tracks).map((t) => t.dur / t.ts));
  const mvhd = all.find((x) => x.type === 'mvhd');
  const movieTs = b.readUInt32BE(field(mvhd, 20, 28));
  const setDur = (box, v0, v1, value) => {
    if (b[box.p + 8]) b.writeBigUInt64BE(BigInt(value), box.p + v1);
    else b.writeUInt32BE(value, box.p + v0);
  };
  setDur(mvhd, 24, 32, Math.round(seconds * movieTs));
  for (const t of Object.values(tracks)) {
    setDur(t.tkhd, 28, 36, Math.round((t.dur / t.ts) * movieTs));
    setDur(t.mdhd, 24, 32, t.dur);
  }
  const moov = all.find((x) => x.type === 'moov');
  const mvex = all.find((x) => x.type === 'mvex');
  if (!mvex || all.some((x) => x.type === 'mehd')) return { buf: b, seconds };
  const mehd = Buffer.alloc(16);
  mehd.writeUInt32BE(16, 0);
  mehd.write('mehd', 4, 'latin1');
  mehd.writeUInt32BE(Math.round(seconds * movieTs), 12);
  b.writeUInt32BE(moov.size + 16, moov.p);
  b.writeUInt32BE(mvex.size + 16, mvex.p);
  return { buf: Buffer.concat([b.subarray(0, mvex.p + 8), mehd, b.subarray(mvex.p + 8)]), seconds };
}

let browser = null;
const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/upload') {
    const parts = [];
    for await (const c of req) parts.push(c);
    const ext = (req.headers['content-type'] || '').includes('mp4') ? 'mp4' : 'webm';
    await mkdir(join(root, 'dist'), { recursive: true });
    const out = join(root, 'dist', `trailer.${ext}`);
    let buf = Buffer.concat(parts);
    let note = '';
    if (ext === 'mp4') {
      const fixed = fixMp4Duration(buf);
      buf = fixed.buf;
      note = `, ${fixed.seconds.toFixed(1)}秒`;
    }
    await writeFile(out, buf);
    res.end('ok');
    console.log(`保存しました: ${out} (${(buf.length / 1e6).toFixed(1)} MB${note}, ${req.headers['content-type']})`);
    setTimeout(() => { browser?.kill(); server.close(); process.exit(0); }, 300);
    return;
  }
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = normalize(join(root, path));
  if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log('録画中…（約35秒）');
  browser = spawn(edge, [
    '--headless=new', '--hide-scrollbars', `--user-data-dir=${join(tmpdir(), `rengeki-trailer-${Date.now()}`)}`,
    '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--force-device-scale-factor=1', '--window-size=1280,720',
    `http://localhost:${port}/tools/trailer.html?record=1`,
  ], { stdio: 'ignore' });
  setTimeout(() => { console.error('時間内に動画が届きませんでした'); browser?.kill(); process.exit(1); }, 120000);
});
