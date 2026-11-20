// BOT 戦の窓口（Supabase Edge Function）。設計：docs/superpowers/specs/2026-11-21-bot-ranked-design.md
//   { action: 'start', version }  → BOT と種と試合の番号を決める（版が違えば ranked: false で、レートなしの試合）
//   { action: 'finish', match_id, version, playerChar, inputs } → 記録から試合を再生して結果を決め、レートを動かす
// game/ はゲームの戦闘コードの写し（tools/make-bot-function.mjs が作る。リポジトリには入れない）
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { judgeBotMatch } from './judge.js';
import { decodeInputs, replayBotMatch } from './game/replay.js';
import { CHARS } from './game/characters.js';
import { GAME_VERSION } from './game/version.js';

const ORIGINS = ['https://rengeki.pages.dev', 'http://localhost:5180'];
const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function headers(req: Request) {
  const origin = req.headers.get('Origin') || '';
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

Deno.serve(async (req) => {
  const h = headers(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: h });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  // ログインしている本人か確かめる
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await service.auth.getUser(token);
  const user = auth && auth.user;
  if (!user) return json({ error: 'login required' }, 401);

  let body: Record<string, unknown> | null = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  if (!body) return json({ error: 'bad request' }, 400);

  if (body.action === 'start') {
    if (body.version !== GAME_VERSION) return json({ ranked: false, version: GAME_VERSION });
    const { data, error } = await service.rpc('bot_start', { p_player: user.id, p_version: GAME_VERSION });
    if (error || !data) return json({ ranked: false, version: GAME_VERSION });
    return json({ ranked: true, ...data });
  }

  if (body.action === 'finish') {
    const { data: m } = await service.from('bot_matches').select('id, player, bot, seed, version, result, created_at')
      .eq('id', String(body.match_id || '')).maybeSingle();
    if (!m || m.player !== user.id || m.result) return json({ result: null });
    const { data: b } = await service.from('bots').select('fighter, level').eq('id', m.bot).single();
    const playerChar = typeof body.playerChar === 'string' && CHARS[body.playerChar] ? body.playerChar : '';
    const result = judgeBotMatch({
      fnVersion: GAME_VERSION, startVersion: m.version, sentVersion: body.version, playerChar,
      inputs: body.inputs, bot: { char: b.fighter, level: b.level }, seed: m.seed,
      decode: decodeInputs, replay: replayBotMatch,
      elapsedSec: (Date.now() - Date.parse(m.created_at)) / 1000,
    });
    const { data, error } = await service.rpc('bot_finish', { p_match: m.id, p_player: user.id, p_result: result });
    if (error || !data) return json({ result: null });
    return json(data);
  }

  return json({ error: 'bad request' }, 400);
});
