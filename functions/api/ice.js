// /api/ice：オンライン対戦で直結できない時の中継役（Cloudflare の TURN サーバー）の、短い時間だけ使える合い鍵を配る。
// 本物の鍵は Cloudflare Pages の「環境変数」に置き、ここ（サーバー側）でだけ使う。ゲームのコードやリポジトリには書かない
//   TURN_KEY_ID        … TURN の鍵の番号
//   TURN_KEY_API_TOKEN … TURN の鍵の暗号（秘密）
// 鍵が設定されていなければ 503 を返し、ゲームは今まで通り（直結できなければ Supabase 中継）で動く
export const ICE_TTL_SECONDS = 4 * 60 * 60; // 合い鍵の有効時間。長い対戦＋再戦でも切れない長さ

export async function onRequestGet({ request, env }) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  // このサイトのページからの問い合わせだけに答える（他のサイトから合い鍵を取られにくくする）
  if (request.headers.get('Sec-Fetch-Site') !== 'same-origin') return json({ error: 'forbidden' }, 403);
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return json({ error: 'not configured' }, 503);
  let res;
  try {
    res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: ICE_TTL_SECONDS }),
    });
  } catch {
    return json({ error: 'upstream' }, 502);
  }
  // 失敗の番号だけ返す（原因を調べるため。鍵の中身は返さない）。401/403 は鍵の番号と暗号の取り違えや貼り間違いが多い
  if (!res.ok) return json({ error: 'upstream', status: res.status }, 502);
  const data = await res.json();
  // ポート53の入口はブラウザでは使えず、つながるまで待たされるだけなので外す
  const iceServers = (data.iceServers || []).map((s) => {
    const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53(\?|$)/.test(u));
    return { ...s, urls };
  }).filter((s) => s.urls.length);
  return json({ iceServers });
}
