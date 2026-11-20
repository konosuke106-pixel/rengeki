# ランクマッチの Bot 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ランクマッチで人が10秒見つからなければ BOT と対戦し、サーバーが試合を再生して勝ち負けを決め、レートを動かす。

**Architecture:** 試合は手元で普通の CPU 戦として動かし、自分の入力を毎コマ記録する。Supabase の Edge Function `bot-match` が、始める時に BOT と種を決め、終わった時に記録から同じ試合を再生して結果を決め、`service_role` だけが呼べる SQL 関数でレートを動かす。再生には `src/` の戦闘コードをそのままコピーして使い、版の印が合う時だけレートを動かす。

**Tech Stack:** 素の JS（ビルドは import/export を外して連結）、Supabase（Postgres・Edge Functions（Deno）・Auth）、GitHub Actions、node:test。

**Spec:** `docs/superpowers/specs/2026-11-21-bot-ranked-design.md`

## Global Constraints
- BOT は名前に必ず「BOT」の印。人のふりをさせない
- BOT のレートは動かさない。人のレートは Elo（K：試合数20未満40・以後24、最低100）
- 人が見つからない時に BOT へ切り替えるまで 10秒（`RANDOM_WAIT_MS` を 30000→10000）
- 始めて20分たっても結果がない BOT 戦は負け。同じ BOT は1日5回まで（6試合目からは動かさず試合数にも入れない）。始めるのは人の試合と合わせて1時間60回まで
- 種はサーバーが決める。1試合につき結果は1回。版が違う・記録が壊れている・終わらない（21600コマ）時の扱いは Task 3 の表のとおり
- ゲストと名前のない人はサーバーに何も送らない（レートなし）
- `sim.js`・`ai.js` に乱数・時刻・画面の処理を入れない。各ファイルの最上位の名前を重複させない
- 新しい画面の文は4言語の訳も足す（`tests/i18n.test.mjs`）

## Review Focus
- 試合の途中でタブを閉じる・回線が切れる：20分後に負け（Task 1 のテスト「20分」）
- 結果の送信が失敗して送り直す：二重に動かない（Task 1 のテスト「二重」）
- 試合中にゲームが更新された（始めた時と送った時で Edge Function の版が違う）：レートなし（Task 3 のテスト「版」）
- 一時停止を挟んだ試合：再生結果が手元と一致（Task 2 のテスト「一時停止」＝停止中はコマが進まず記録もされない）
- ゲストが BOT 戦の後に結果画面で「もう一戦」：サーバーに何も送らない（Task 4 の確認）

---

### Task 1: サーバーの表と関数

**Files:**
- Create: `supabase/migrations/20261121_bots.sql`（`apply_migration` で適用）
- Modify: `supabase/tests/ranking.sql`（BOT のテストを足す）

**Interfaces:**
- Produces:
  - 表 `bots(id text pk, name text, char text, level text check in ('easy','normal','hard'), rating int)` に10体。`bot_matches(id uuid pk, player uuid → auth.users cascade, bot text → bots, seed int, version text, created_at, result text null check in ('win','loss','draw','timeout','void','invalid'), delta int, counted boolean)`。どちらも直接は読み書き不可
  - `list_bots() returns table(id, name, char, level, rating)`：anon・authenticated（ゲストが手元で遊ぶ用）
  - `bot_start(p_player uuid, p_version text) returns jsonb`：service_role のみ。名前がない・`too_disputed`・1時間60回超えなら null。自分のレートに近い3体のうち、自分が一番前に当たった（または当たったことのない）BOT。`{match_id, bot:{id,name,char,level,rating}, seed}`
  - `bot_finish(p_match uuid, p_player uuid, p_result text, p_version text) returns jsonb`：service_role のみ。p_result は `win|loss|draw|void|invalid`。持ち主でない・既に結果がある・20分過ぎは null。`void` は動かさない。`invalid` は負けとして扱う。それ以外は Elo（BOT のレートが相手）。同じ BOT は1日5回まで。`{delta, rating}`
  - `ranking()` は列 `is_bot boolean` を足し、BOT も混ぜて並べる。`my_rank()` も BOT を数に入れる
  - `finalize_stale()` に「結果のない20分過ぎの BOT 戦を `timeout`（負け）」を足す
- [ ] **Step 1: テストを書く**（`supabase/tests/ranking.sql` に BOT のブロック）：
  - `list_bots()` が10体、全員 `name like 'BOT %'` ではなく名前は自由だが、ランキングの `is_bot` が true
  - 1500 の人が `bot_start` → レート 1500 前後の BOT が返り、種がある
  - `bot_finish(win)` → 人のレートだけ上がり（BOT は不変）、試合数・勝ち数+1、`{delta, rating}` を返す
  - 二重：同じ試合にもう一度 `bot_finish` → null、レート不変
  - 他人の試合の番号 → null
  - `void` → 動かない。`invalid` → 負けと同じだけ下がる
  - 20分：`created_at` を21分前にして `finalize_stale()` → 負けの分だけ下がる。その後の `bot_finish` は null
  - 同じ BOT の6試合目は動かず試合数も増えない
  - 名前のない人の `bot_start` → null
  - authenticated から `bot_start`/`bot_finish` を直接呼べない
- [ ] **Step 2: 流して失敗を確かめる**
- [ ] **Step 3: マイグレーションを書いて適用**
- [ ] **Step 4: 全部（前のテストも）`ALL OK`、`get_advisors` で新しい警告がないこと**
- [ ] **Step 5: コミット**

### Task 2: 入力の記録と再生（手元とサーバーで共通）

**Files:**
- Create: `src/replay.js`
- Test: `tests/replay.test.mjs`
- Modify: `tools/build.mjs`（ORDER の `ai` の後に `replay`）

**Interfaces:**
- Consumes: `sim.js` の `createMatch`・`step`、`ai.js` の `createCpu`、`characters.js` の `CHARS`
- Produces:
  - `encodeInputs(masks: number[]) -> string`（同じ値が続く所を「値36進*回数」でまとめ、`.` 区切り）
  - `decodeInputs(text: string, maxFrames = REPLAY_MAX_FRAMES) -> number[] | null`（壊れていたら・長すぎたら null）
  - `REPLAY_MAX_FRAMES = 21600`
  - `botMatchState(playerChar, bot) -> state`（`createMatch({ p1: playerChar, p2: bot.char, stage: CHARS[bot.char].stage, gimmicks: true })`）
  - `replayBotMatch({ playerChar, bot: {char, level}, seed, inputs: number[] }) -> { winner: 0|1|-1, frames } | null`（入力が尽きても終わらなければ null）
- [ ] **Step 1: テスト**：
  - 往復：でたらめな配列を encode→decode で元どおり。空・長すぎ（21601）・壊れた文字は null
  - 「手元と一致」：全16キャラについて、プレイヤー側も CPU（easy、種 i）で動かしながら毎コマの入力を記録した試合と、`replayBotMatch` の勝者とコマ数が一致
  - 「一時停止」：途中で記録を止めた（コマを進めない）区間があっても、記録したコマだけで再生すれば一致
  - 入力が途中で尽きる → null
- [ ] **Step 2: 失敗を確かめる** `node --test tests/replay.test.mjs`
- [ ] **Step 3: 実装**（`replay.js` は `sim`・`ai`・`characters` 以外を import しない。Edge Function でもそのまま動くように）
- [ ] **Step 4: 通る、`npm test` も**
- [ ] **Step 5: コミット**

### Task 3: Edge Function と自動更新

**Files:**
- Create: `supabase/functions/bot-match/index.ts`（手書き）、`tools/make-bot-function.mjs`（`src/config.js characters.js stages.js sim.js ai.js replay.js` を `supabase/functions/bot-match/game/` にコピーし、`version.js` に版の印を書く）、`.github/workflows/bot-function.yml`
- Modify: `tools/build.mjs`（版の印を `dist/version.txt` にも書く）、`.gitignore`（`supabase/functions/bot-match/game/`）
- Test: `tests/botfn.test.mjs`

**Interfaces:**
- Consumes: Task 1 の `bot_start`・`bot_finish`、Task 2 の `decodeInputs`・`replayBotMatch`
- Produces（`POST /functions/v1/bot-match`、ログインの JWT 必須）:
  - `{ action: 'start', version }` → 版が自分と違えば `{ ranked: false }`。同じなら `bot_start` の結果に `ranked: true`
  - `{ action: 'finish', match_id, version, playerChar, inputs }` → 下の表で結果を決めて `bot_finish` を呼び、`{ delta, rating, result }`
  - 判定の表：Edge Function の版 ≠ 試合を始めた時の版 → `void`／送ってきた版 ≠ 始めた時の版 → `invalid`／`decodeInputs` が null・`playerChar` が CHARS にない・再生が null → `invalid`／それ以外は再生の勝者（0 なら win、1 なら loss、-1 なら draw）
  - 判定の部分は純粋関数 `judgeBotMatch({ fnVersion, startVersion, sentVersion, playerChar, inputs, bot, seed })` として `supabase/functions/bot-match/judge.js` に分け、Node のテストから使う
- [ ] **Step 1: テスト**（`tests/botfn.test.mjs`、`judge.js` を import）：表の各行。正しい記録で win／loss、版のずれ2種、壊れた記録、知らないキャラ
- [ ] **Step 2: 失敗を確かめる**
- [ ] **Step 3: 実装**：`index.ts` は Deno.serve。`Authorization` からユーザーを確かめ（`auth.getUser`）、`SUPABASE_SERVICE_ROLE_KEY` のクライアントで SQL 関数を呼ぶ。`make-bot-function.mjs` → MCP の `deploy_edge_function` で配置（verify_jwt は true）
- [ ] **Step 4: 本物で確かめる**：テスト用の仮ユーザーは作らず、`execute_sql` で `bot_start`→再生と同じ結果を `bot_finish` に入れる流れを rollback つきで試す。Edge Function は `start` に版違いを送って `{ranked:false}` が返ることを確かめる（JWT なしは 401）
- [ ] **Step 5: GitHub Actions**：`main` への push で、`npm ci` 不要 → `node tools/build.mjs` → `node tools/make-bot-function.mjs` → `npx supabase functions deploy bot-match --project-ref pneboddgrvktehjslplg`（`SUPABASE_ACCESS_TOKEN` は secrets）。秘密がまだ無い時は何もせず成功で終わる
- [ ] **Step 6: コミット**

### Task 4: 画面と試合の流れ

**Files:**
- Modify: `src/account.js`（`startBotMatch(version) -> {ranked, match_id?, bot, seed}`、`finishBotMatch({match_id, version, playerChar, inputs}) -> {delta, rating, result}|null`、`listBots()`）、`src/main.js`、`index.html`、`styles.css`、訳4つ
- Test: `tests/account.test.mjs`（`pickGuestBot(bots, rating=1500)` が一番近いレートを返す）

- [ ] **Step 1: テスト** `pickGuestBot` を書いて失敗を確かめる
- [ ] **Step 2: 実装**：
  - 人が10秒見つからない → 名前ありなら `startBotMatch(NET_VERSION)`、ゲストか失敗なら `listBots()` から `pickGuestBot` で選び手元の種（レートなし）。どちらも取れなければ今まで通りの CPU 戦
  - `app.mode = 'bot'`、`app.bot = { bot, seed, matchId|null, log: [] }`。キャラ選択は自分の1人だけ（見出し「BOT {name}（レート {rating}）と対戦。あなたのキャラを選ぶ」、強さの選択は隠す）。選んだらステージを飛ばしてすぐ試合（`botMatchState`）
  - コントローラーは `createCpu(bot.level, seed)`。`runFrame` で `step` の直前に自分の入力を `app.bot.log` に積む
  - 決着 → 結果の見出しに BOT の名前。`matchId` があれば `finishBotMatch` してレートの変化を出す（人の試合と同じ表示、`void` は「ゲームの更新中のため、今回はレートが動きません」）
  - 結果の「もう一戦」は「もう一度探す」にしてランクマッチの検索へ。一時停止の「やり直す」は BOT 戦では隠す
  - ランキングの BOT の行に「BOT」の印
- [ ] **Step 3: 訳を足して `npm test`**
- [ ] **Step 4: `?net=local` で1画面だけ検索 → 10秒で BOT 戦 → 決着 → 結果画面、まで確かめる（ゲストのまま。サーバーに何も送らないことを通信の記録で確かめる）**
- [ ] **Step 5: コミット**

### Task 5: 仕上げ
- [ ] 全体レビュー（別の確認役）→ 指摘の修正
- [ ] `CLAUDE.md` の「現状」「保留中」を更新、`main` に入れて push、本番で：ゲストの BOT 戦、ランキングの BOT 表示
- [ ] 本人に Supabase のアクセストークンを GitHub の秘密に登録してもらう（画面に合わせて案内）。その後、本番でログインして BOT 戦 → レートの変化 → ランキング、を確かめる
