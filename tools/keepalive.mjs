// Supabase の無料プランは、1週間データベースへの問い合わせが少ないと自動で止まる。
// オンライン対戦の通信は問い合わせに数えられないので、毎日これで小さな問い合わせ（keepalive 関数、1を返すだけ）をする。
// GitHub Actions（.github/workflows/keepalive.yml）が毎日動かす。手元では node tools/keepalive.mjs
import { SUPABASE_URL, SUPABASE_KEY } from '../src/online-config.js';

const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/keepalive`, {
  method: 'POST',
  headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
  body: '{}',
});
const text = await res.text();
if (!res.ok || text.trim() !== '1') {
  console.error(`起こせませんでした: ${res.status} ${text.slice(0, 200)}`);
  process.exit(1);
}
console.log(`起きています（${new Date().toISOString()}）`);
