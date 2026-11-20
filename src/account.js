// アカウント：Google ログイン・表示名・レートの報告・ランキング。計算と記録はサーバー（Supabase の関数）が行う。
// ゲストは通信用の部品（supabase-js）を読み込まない。一度ログインすると、ログアウトするまでログインしたまま
import { SUPABASE_URL, SUPABASE_KEY } from './online-config.js';
import { loadSupabase } from './net.js';

const ACCOUNT_RETRY_MS = [1000, 3000, 9000]; // 報告に失敗した時に送り直すまでの間
const NAME_MIN = 2;
const NAME_MAX = 12;
let authClient = null;
let authReady = null;
let acctState = { user: null, profile: null };
const acctListeners = [];

// 表示名：前後の空白を除いて2〜12文字なら返す。だめなら null
export function validName(s) {
  const v = String(s ?? '').trim();
  const n = [...v].length;
  return n >= NAME_MIN && n <= NAME_MAX ? v : null;
}

// 失敗したら waits の間を空けて送り直す。全部だめなら null（試合や画面は止めない）
export async function callWithRetry(rpc, fn, args, waits = ACCOUNT_RETRY_MS, sleep = (ms) => new Promise((r) => setTimeout(r, ms))) {
  for (let i = 0; i <= waits.length; i++) {
    try {
      const { data, error } = await rpc(fn, args);
      if (!error) return data;
    } catch { /* 送り直す */ }
    if (i < waits.length) await sleep(waits[i]);
  }
  return null;
}

const storageKey = () => {
  const ref = (SUPABASE_URL.match(/^https:\/\/([^.]+)\./) || [])[1] || '';
  return `sb-${ref}-auth-token`;
};

// この端末にログインの記録があるか（Google から戻ってきた直後も含む）
export function hasStoredLogin() {
  try {
    if (typeof location !== 'undefined' && /[?&]code=/.test(location.search)) return true;
    return typeof localStorage !== 'undefined' && !!localStorage.getItem(storageKey());
  } catch {
    return false;
  }
}

async function ensureClient() {
  if (authClient) return authClient;
  const lib = await loadSupabase();
  authClient = lib.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, flowType: 'pkce', detectSessionInUrl: true, storageKey: storageKey() },
  });
  return authClient;
}

const rpcCall = async (fn, args) => (await ensureClient()).rpc(fn, args);

function setAccount(next) {
  acctState = { ...acctState, ...next };
  for (const fn of acctListeners) fn(acctState);
}

export const account = () => acctState;
export const onAccount = (fn) => acctListeners.push(fn);
export const rankedReady = () => !!(acctState.user && acctState.profile);

async function refreshProfile() {
  if (!acctState.user) {
    setAccount({ profile: null });
    return;
  }
  const { data } = await rpcCall('my_profile');
  // 表示名がまだない人は、関数が中身の空の行（id が null）を返す
  setAccount({ profile: data && data.id ? data : null });
}

// 起動時に呼ぶ。ログインの記録がある時だけ部品を読み込み、ログイン状態と表示名を取る
export function initAccount() {
  if (authReady) return authReady;
  if (!hasStoredLogin()) return Promise.resolve();
  authReady = (async () => {
    try {
      const client = await ensureClient();
      const { data } = await client.auth.getSession();
      setAccount({ user: data.session ? { id: data.session.user.id } : null });
      client.auth.onAuthStateChange((_event, session) => {
        const id = session ? session.user.id : null;
        if (id !== (acctState.user && acctState.user.id)) {
          setAccount({ user: id ? { id } : null });
          refreshProfile().catch(() => {});
        }
      });
      // Google から戻ってきた URL の印を消す（再読み込みしても大丈夫なように）
      if (/[?&]code=/.test(location.search)) history.replaceState(null, '', location.pathname);
      await refreshProfile();
    } catch {
      setAccount({ user: null, profile: null });
    } finally {
      authReady = null;
    }
  })();
  return authReady;
}

export async function signInGoogle() {
  const client = await ensureClient();
  await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
}

export async function signOut() {
  if (authClient) await authClient.auth.signOut().catch(() => {});
  setAccount({ user: null, profile: null });
}

export async function deleteAccount() {
  const { error } = await rpcCall('delete_my_account');
  if (error) throw new Error(error.message);
  await signOut();
}

export async function saveName(name) {
  const v = validName(name);
  if (!v) throw new Error('name');
  const { data, error } = await rpcCall('set_name', { p_name: v });
  if (error) throw new Error(error.message);
  setAccount({ profile: data });
  return data;
}

export async function loadRanking() {
  const { data, error } = await rpcCall('ranking');
  if (error) throw new Error(error.message);
  let myRank = null;
  if (acctState.user) {
    const r = await rpcCall('my_rank');
    myRank = r.data ?? null;
  }
  return { rows: data || [], myRank };
}

export const reportStart = (room, gen, oppId) => callWithRetry(rpcCall, 'start_match', { p_room: room, p_gen: gen, p_opp: oppId });

export async function reportResult(room, gen, oppId, result) {
  const out = await callWithRetry(rpcCall, 'report_match', { p_room: room, p_gen: gen, p_opp: oppId, p_result: result });
  if (out && typeof out.rating === 'number' && acctState.profile) {
    setAccount({ profile: { ...acctState.profile, rating: out.rating } });
  }
  return out;
}

// レートが付く試合か。ランダム対戦で、自分も相手もログインして名前がある時だけ（部屋コードの対戦は八百長を防ぐため付けない）
export function rankedMatchInfo({ random, myUid, peerUid }) {
  if (!random || !myUid || !peerUid || myUid === peerUid) return null;
  return { oppId: peerUid };
}

// 試合の結果を、自分から見た win / loss / draw にする
export function matchResultFor(s, myIdx) {
  if (s.matchWinner < 0) return 'draw';
  return s.matchWinner === myIdx ? 'win' : 'loss';
}

// 自分のログインの id（レートの付く試合に出られる時だけ）
export const rankedUid = () => (rankedReady() ? acctState.user.id : null);

// 試合の途中で異常に終わった時（相手が切れた・通信が食い違った）に届ける結果。
// 何も届けないと、相手のでっち上げの「勝ち」だけが10分後に採用されてしまうので、必ず「相手が切れた」を届けて食い違いにする
export function abnormalEndResult({ ranked, inMatch, reportedGen, generation }) {
  return ranked && inMatch && reportedGen !== generation ? 'dc' : null;
}

/* ---------- ランクマッチの BOT ---------- */

// ログインしていない人の BOT：レートが一番近い1体（同じ近さなら弱い方）。レートは動かない
export function pickGuestBot(bots, rating = 1500) {
  let best = null;
  for (const b of bots || []) {
    const d = Math.abs(b.rating - rating);
    if (!best || d < best.d || (d === best.d && b.rating < best.bot.rating)) best = { bot: b, d };
  }
  return best ? best.bot : null;
}

// BOT の一覧（誰でも読める）。キャラは char にそろえる
export async function listBots() {
  const { data, error } = await rpcCall('list_bots');
  if (error || !data) return [];
  return data.map((b) => ({ id: b.id, name: b.name, char: b.fighter, level: b.level, rating: b.rating }));
}

const callBotFn = async (fn, body) => {
  const client = await ensureClient();
  return client.functions.invoke('bot-match', { body });
};

// BOT 戦を始める（ログイン＋名前ありの人だけ）。{ ranked, match_id, seed, bot, version } を返す。だめなら null
export async function startBotMatch(version) {
  if (!rankedReady()) return null;
  try {
    const { data, error } = await callBotFn('bot-match', { action: 'start', version });
    return error ? null : data;
  } catch {
    return null;
  }
}

// 結果をサーバーに送る。サーバーが記録から試合を再生して決めたレートの変化を返す（送れなければ null）
export async function finishBotMatch({ matchId, version, playerChar, inputs }) {
  const out = await callWithRetry(callBotFn, 'bot-match', { action: 'finish', match_id: matchId, version, playerChar, inputs });
  if (out && typeof out.rating === 'number' && acctState.profile) {
    setAccount({ profile: { ...acctState.profile, rating: out.rating } });
  }
  return out;
}
