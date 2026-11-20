-- ランクマッチの BOT。設計：docs/superpowers/specs/2026-11-21-bot-ranked-design.md
-- 試合は手元で動かし、Edge Function（bot-match）が記録から再生して結果を決める。ここはその結果でレートを動かす所。
-- bot_start / bot_finish は Edge Function（service_role）だけが呼べる
create table public.bots (
  id text primary key,
  name text not null,
  fighter text not null,
  level text not null check (level in ('easy', 'normal', 'hard')),
  rating int not null
);
insert into public.bots (id, name, fighter, level, rating) values
  ('koro',  'Koro',  'kagari',    'easy',   1100),
  ('pon',   'Pon',   'shizuku',   'easy',   1180),
  ('tanu',  'Tanu',  'goutetsu',  'easy',   1260),
  ('sato',  'Sato',  'rai',       'normal', 1380),
  ('mina',  'Mina',  'tsuzumi',   'normal', 1450),
  ('gan',   'Gan',   'oni',       'normal', 1520),
  ('shino', 'Shino', 'hayate',    'normal', 1600),
  ('ryu',   'Ryu',   'kabuto',    'hard',   1700),
  ('yuki',  'Yuki',  'kogarashi', 'hard',   1780),
  ('kuro',  'Kuro',  'kage',      'hard',   1850);

create table public.bot_matches (
  id uuid primary key default gen_random_uuid(),
  player uuid not null references auth.users (id) on delete cascade,
  bot text not null references public.bots (id),
  seed int not null,
  version text not null,
  created_at timestamptz not null default now(),
  result text check (result in ('win', 'loss', 'draw', 'timeout', 'void', 'invalid')),
  delta int not null default 0,
  counted boolean not null default false
);
create index bot_matches_player on public.bot_matches (player, created_at);
alter table public.bots enable row level security;
alter table public.bot_matches enable row level security;
revoke all on public.bots, public.bot_matches from anon, authenticated;

-- Elo の変化（人の側）。K は試合数20未満なら40、以後24
create or replace function public.elo_delta(p_rating int, p_opp int, p_games int, p_score real) returns int
language sql immutable set search_path = '' as $$
  select round((case when p_games < 20 then 40 else 24 end) * (p_score - 1 / (1 + power(10::float8, (p_opp - p_rating) / 400.0))))::int
$$;

create or replace function public.list_bots() returns table (id text, name text, fighter text, level text, rating int)
language sql stable security definer set search_path = '' as $$
  select b.id, b.name, b.fighter, b.level, b.rating from public.bots b order by b.rating
$$;

create or replace function public.bot_start(p_player uuid, p_version text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; b public.bots; v_seed int; v_id uuid;
begin
  select * into me from public.profiles where id = p_player;
  if me.id is null or public.too_disputed(me) then return null; end if;
  if (select count(*) from public.match_starts where player = p_player and created_at > now() - interval '1 hour')
     + (select count(*) from public.bot_matches where player = p_player and created_at > now() - interval '1 hour') >= 60 then
    return null;
  end if;
  -- レートの近い3体のうち、一番前に当たった（または当たったことのない）BOT
  select x.* into b from (
    select bb.* from public.bots bb order by abs(bb.rating - me.rating), bb.rating limit 3
  ) x
  order by (select max(created_at) from public.bot_matches bm where bm.player = p_player and bm.bot = x.id) nulls first, x.rating
  limit 1;
  v_seed := 1 + floor(random() * 2147483000)::int;
  insert into public.bot_matches (player, bot, seed, version) values (p_player, b.id, v_seed, coalesce(p_version, ''))
  returning id into v_id;
  return jsonb_build_object('match_id', v_id, 'seed', v_seed, 'version', coalesce(p_version, ''),
    'bot', jsonb_build_object('id', b.id, 'name', b.name, 'char', b.fighter, 'level', b.level, 'rating', b.rating));
end $$;

-- 結果を当てはめる（得点 1 勝ち・0 負け・0.5 引き分け、null は動かさない）
create or replace function public.bot_apply(p_match uuid, p_result text, p_score real) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.bot_matches; me public.profiles; b public.bots; d int := 0; n int; v_counted boolean := false;
begin
  select * into m from public.bot_matches where id = p_match for update;
  if m.id is null or m.result is not null then return null; end if;
  select * into me from public.profiles where id = m.player for update;
  select * into b from public.bots where id = m.bot;
  if p_score is not null and me.id is not null then
    select count(*) into n from public.bot_matches
      where player = m.player and bot = m.bot and counted and created_at > now() - interval '1 day';
    if n < 5 then
      v_counted := true;
      d := greatest(100, me.rating + public.elo_delta(me.rating, b.rating, me.games, p_score)) - me.rating;
      update public.profiles set rating = rating + d, games = games + 1, wins = wins + (case when p_score = 1 then 1 else 0 end)
        where id = me.id;
    end if;
  end if;
  update public.bot_matches set result = p_result, delta = d, counted = v_counted where id = p_match;
  return jsonb_build_object('delta', d, 'rating', (select rating from public.profiles where id = m.player), 'result', p_result, 'counted', v_counted);
end $$;

create or replace function public.bot_finish(p_match uuid, p_player uuid, p_result text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.bot_matches;
begin
  select * into m from public.bot_matches where id = p_match;
  if m.id is null or m.player <> p_player or m.result is not null or m.created_at < now() - interval '20 minutes' then return null; end if;
  return public.bot_apply(p_match, p_result, case p_result
    when 'win' then 1::real when 'loss' then 0::real when 'invalid' then 0::real when 'draw' then 0.5::real else null end);
end $$;

-- ランキングに BOT も混ぜる（is_bot で印）。列が増えるので作り直す
drop function if exists public.ranking();
create function public.ranking() returns table (rank int, name text, rating int, games int, wins int, is_bot boolean)
language sql stable security definer set search_path = '' as $$
  select (rank() over (order by x.rating desc, x.games desc))::int, x.name, x.rating, x.games, x.wins, x.is_bot
  from (
    select p.name, p.rating, p.games, p.wins, false as is_bot from public.profiles p where p.games > 0
    union all
    select b.name, b.rating, 0, 0, true from public.bots b
  ) x
  order by x.rating desc, x.games desc
  limit 100
$$;

create or replace function public.my_rank() returns int
language sql stable security definer set search_path = '' as $$
  select case when me.games > 0 then
    (select count(*)::int + 1 from public.profiles p where p.games > 0 and (p.rating > me.rating or (p.rating = me.rating and p.games > me.games)))
    + (select count(*)::int from public.bots b where b.rating > me.rating)
  end
  from public.profiles me where me.id = auth.uid()
$$;

-- 今までの片付けに「20分たっても結果のない BOT 戦は負け」を足す
create or replace function public.finalize_stale() returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    select mr.room, mr.gen, count(*) as n from public.match_reports mr
    where not exists (select 1 from public.rated_matches rm where rm.room = mr.room and rm.gen = mr.gen)
    group by mr.room, mr.gen
    having min(mr.created_at) < now() - interval '10 minutes'
  loop
    perform public.finalize_match(r.room, r.gen, r.n = 1);
  end loop;
  for r in select id from public.bot_matches where result is null and created_at < now() - interval '20 minutes' loop
    perform public.bot_apply(r.id, 'timeout', 0);
  end loop;
  delete from public.match_starts where created_at < now() - interval '1 day';
  delete from public.match_reports where created_at < now() - interval '1 day';
  delete from public.rated_matches where score_a is null and created_at < now() - interval '30 days';
  delete from public.bot_matches where created_at < now() - interval '30 days';
end $$;

revoke execute on function public.elo_delta(int, int, int, real), public.list_bots(), public.bot_start(uuid, text),
  public.bot_apply(uuid, text, real), public.bot_finish(uuid, uuid, text), public.ranking()
  from public, anon, authenticated;
grant execute on function public.list_bots(), public.ranking() to anon, authenticated;
grant execute on function public.bot_start(uuid, text), public.bot_finish(uuid, uuid, text) to service_role;
