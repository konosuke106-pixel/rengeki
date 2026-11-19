-- レートとランキング。設計：docs/superpowers/specs/2026-11-19-ranking-design.md
-- 表には直接書けない（RLS）。書き込みは本人確認（auth.uid()）をする関数からだけ。
create extension if not exists pg_cron;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 12),
  rating int not null default 1500,
  games int not null default 0,
  wins int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "誰でも成績を読める" on public.profiles for select using (true);
revoke insert, update, delete, truncate on public.profiles from anon, authenticated;

-- 2人それぞれの「この試合を始めた」と「結果」。両方そろった試合だけを数える
create table public.match_starts (
  room text not null, gen int not null,
  player uuid not null references auth.users (id) on delete cascade,
  opponent uuid not null,
  created_at timestamptz not null default now(),
  primary key (room, gen, player)
);
create table public.match_reports (
  room text not null, gen int not null,
  player uuid not null references auth.users (id) on delete cascade,
  opponent uuid not null,
  result text not null check (result in ('win', 'loss', 'draw', 'dc')),
  created_at timestamptz not null default now(),
  primary key (room, gen, player)
);
-- 締めた試合（同じ試合を2回数えない）。score_a が null なら数えなかった試合（食い違い・回数超え）
create table public.rated_matches (
  room text not null, gen int not null,
  a uuid references auth.users (id) on delete set null,
  b uuid references auth.users (id) on delete set null,
  score_a real,
  delta_a int not null default 0,
  delta_b int not null default 0,
  created_at timestamptz not null default now(),
  primary key (room, gen)
);
create index rated_matches_pair on public.rated_matches (a, b, created_at);
alter table public.match_starts enable row level security;
alter table public.match_reports enable row level security;
alter table public.rated_matches enable row level security;
revoke all on public.match_starts, public.match_reports, public.rated_matches from anon, authenticated;

create or replace function public.require_uid() returns uuid
language plpgsql stable set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'login required'; end if;
  return v;
end $$;

create or replace function public.set_name(p_name text) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.require_uid(); v_name text := btrim(coalesce(p_name, '')); v public.profiles;
begin
  if char_length(v_name) < 2 or char_length(v_name) > 12 then raise exception 'name must be 2-12 characters'; end if;
  insert into public.profiles (id, name) values (v_uid, v_name)
  on conflict (id) do update set name = excluded.name
  returning * into v;
  return v;
end $$;

create or replace function public.my_profile() returns public.profiles
language sql stable security definer set search_path = '' as $$
  select * from public.profiles where id = auth.uid()
$$;

create or replace function public.start_match(p_room text, p_gen int, p_opp uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.require_uid();
begin
  if p_opp is null or p_opp = v_uid or char_length(coalesce(p_room, '')) not between 1 and 40 then return; end if;
  insert into public.match_starts (room, gen, player, opponent) values (p_room, p_gen, v_uid, p_opp)
  on conflict do nothing;
end $$;

-- 報告の主張を「a から見た得点」にする（1 勝ち・0 負け・0.5 引き分け）。dc は「相手が切れたので自分の勝ち」
create or replace function public.claim_score(p_result text, p_reporter_is_a boolean) returns real
language sql immutable set search_path = '' as $$
  select case
    when p_result in ('win', 'dc') then (case when p_reporter_is_a then 1 else 0 end)::real
    when p_result = 'loss' then (case when p_reporter_is_a then 0 else 1 end)::real
    else 0.5::real end
$$;

create or replace function public.finalize_match(p_room text, p_gen int, p_force boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r1 public.match_reports; r2 public.match_reports; n int;
  pa public.profiles; pb public.profiles;
  v_score real; s2 real; ea float8; ka int; kb int; na int; nb int; recent int;
begin
  if exists (select 1 from public.rated_matches where room = p_room and gen = p_gen) then return; end if;
  select count(*) into n from public.match_reports where room = p_room and gen = p_gen;
  if n = 0 or (n = 1 and not p_force) then return; end if;
  select * into r1 from public.match_reports where room = p_room and gen = p_gen order by player limit 1;
  -- 2人ともが「この相手と始めた」と届けていなければ数えない
  if not exists (select 1 from public.match_starts where room = p_room and gen = p_gen and player = r1.player and opponent = r1.opponent)
     or not exists (select 1 from public.match_starts where room = p_room and gen = p_gen and player = r1.opponent and opponent = r1.player) then
    if p_force then
      insert into public.rated_matches (room, gen, a, b, score_a) values (p_room, p_gen, r1.player, r1.opponent, null) on conflict do nothing;
    end if;
    return;
  end if;
  v_score := public.claim_score(r1.result, true);
  if n = 2 then
    select * into r2 from public.match_reports where room = p_room and gen = p_gen and player <> r1.player limit 1;
    s2 := public.claim_score(r2.result, false);
    if r2.player <> r1.opponent or r2.opponent <> r1.player or s2 <> v_score or (r1.result = 'dc' and r2.result = 'dc') then
      insert into public.rated_matches (room, gen, a, b, score_a) values (p_room, p_gen, r1.player, r1.opponent, null) on conflict do nothing;
      return;
    end if;
  end if;
  select * into pa from public.profiles where id = r1.player for update;
  select * into pb from public.profiles where id = r1.opponent for update;
  -- 同じ2人は1日5回まで
  select count(*) into recent from public.rated_matches
    where score_a is not null and created_at > now() - interval '1 day'
      and ((a = r1.player and b = r1.opponent) or (a = r1.opponent and b = r1.player));
  if pa.id is null or pb.id is null or recent >= 5 then
    insert into public.rated_matches (room, gen, a, b, score_a) values (p_room, p_gen, r1.player, r1.opponent, null) on conflict do nothing;
    return;
  end if;
  ea := 1 / (1 + power(10::float8, (pb.rating - pa.rating) / 400.0));
  ka := case when pa.games < 20 then 40 else 24 end;
  kb := case when pb.games < 20 then 40 else 24 end;
  na := greatest(100, pa.rating + round(ka * (v_score - ea))::int);
  nb := greatest(100, pb.rating + round(kb * ((1 - v_score) - (1 - ea)))::int);
  insert into public.rated_matches (room, gen, a, b, score_a, delta_a, delta_b)
    values (p_room, p_gen, pa.id, pb.id, v_score, na - pa.rating, nb - pb.rating);
  update public.profiles set rating = na, games = games + 1, wins = wins + (case when v_score = 1 then 1 else 0 end) where id = pa.id;
  update public.profiles set rating = nb, games = games + 1, wins = wins + (case when v_score = 0 then 1 else 0 end) where id = pb.id;
end $$;

create or replace function public.report_match(p_room text, p_gen int, p_opp uuid, p_result text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.require_uid(); m public.rated_matches; v_rating int;
begin
  if p_result not in ('win', 'loss', 'draw', 'dc') or p_opp is null or p_opp = v_uid then return null; end if;
  insert into public.match_reports (room, gen, player, opponent, result) values (p_room, p_gen, v_uid, p_opp, p_result)
  on conflict do nothing;
  perform public.finalize_match(p_room, p_gen, false);
  select * into m from public.rated_matches where room = p_room and gen = p_gen;
  if m.room is null or m.score_a is null then return null; end if;
  select rating into v_rating from public.profiles where id = v_uid;
  return jsonb_build_object('delta', case when m.a = v_uid then m.delta_a else m.delta_b end, 'rating', v_rating);
end $$;

-- 片方しか報告しないまま10分たった試合を締め、1日より古い記録を掃除する（pg_cron が5分ごと）
create or replace function public.finalize_stale() returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    select mr.room, mr.gen from public.match_reports mr
    where not exists (select 1 from public.rated_matches rm where rm.room = mr.room and rm.gen = mr.gen)
    group by mr.room, mr.gen
    having count(*) = 1 and min(mr.created_at) < now() - interval '10 minutes'
  loop
    perform public.finalize_match(r.room, r.gen, true);
  end loop;
  delete from public.match_starts where created_at < now() - interval '1 day';
  delete from public.match_reports where created_at < now() - interval '1 day';
end $$;

create or replace function public.ranking() returns table (rank int, name text, rating int, games int, wins int)
language sql stable security definer set search_path = '' as $$
  select (rank() over (order by p.rating desc, p.games desc))::int, p.name, p.rating, p.games, p.wins
  from public.profiles p where p.games > 0
  order by p.rating desc, p.games desc
  limit 100
$$;

create or replace function public.my_rank() returns int
language sql stable security definer set search_path = '' as $$
  select case when me.games > 0 then
    (select count(*)::int + 1 from public.profiles p where p.games > 0 and (p.rating > me.rating or (p.rating = me.rating and p.games > me.games)))
  end
  from public.profiles me where me.id = auth.uid()
$$;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.require_uid();
begin
  delete from auth.users where id = v_uid;
end $$;

-- 呼べる関数を絞る（内部用は誰も呼べない）
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.set_name(text), public.my_profile(), public.start_match(text, int, uuid),
  public.report_match(text, int, uuid, text), public.my_rank(), public.delete_my_account() to authenticated;
grant execute on function public.ranking() to anon, authenticated;
grant execute on function public.keepalive() to anon, authenticated;

select cron.schedule('rengeki-finalize-stale', '*/5 * * * *', 'select public.finalize_stale()');
