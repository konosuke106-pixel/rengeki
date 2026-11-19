-- レートとランキング：見直しで見つかった穴をふさぐ
-- ・ランダム対戦の部屋名（R＋8文字）でなければ受け付けない
-- ・自分が始めていない試合の報告は残さない／始める回数は1時間60回まで（ゴミの記録を防ぐ）
-- ・報告が食い違うと2人とも「もめごと」が1つ増える。もめごとが3回以上かつ試合数の2割を超える人はレートの対象外（負けそうな時に嘘をついても得をしない）
-- ・同時に届いて締め損ねた試合も、あとで締める（同じ試合は順番に締める）
-- ・成績の表は直接読めない（id や登録日時を見せない。名前・レート・成績は関数から）
alter table public.profiles add column if not exists disputes int not null default 0;

drop policy if exists "誰でも成績を読める" on public.profiles;
revoke select on public.profiles from anon, authenticated;

create or replace function public.valid_room(p_room text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_room ~ '^R[2-9A-HJ-NP-Z]{8}$', false)
$$;

create or replace function public.start_match(p_room text, p_gen int, p_opp uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.require_uid();
begin
  if p_opp is null or p_opp = v_uid or not public.valid_room(p_room) or p_gen < 0 or p_gen > 1000 then return; end if;
  if (select count(*) from public.match_starts where player = v_uid and created_at > now() - interval '1 hour') >= 60 then return; end if;
  insert into public.match_starts (room, gen, player, opponent) values (p_room, p_gen, v_uid, p_opp)
  on conflict do nothing;
end $$;

-- もめごとの多い人か（嘘の報告を繰り返す人をレートから外す）
create or replace function public.too_disputed(p public.profiles) returns boolean
language sql immutable set search_path = '' as $$
  select p.disputes >= 3 and p.disputes * 5 > p.games
$$;

create or replace function public.finalize_match(p_room text, p_gen int, p_force boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r1 public.match_reports; r2 public.match_reports; n int;
  pa public.profiles; pb public.profiles;
  v_score real; s2 real; ea float8; ka int; kb int; na int; nb int; recent int;
begin
  -- 同じ試合の締めは順番に（2人の報告が同時に届いても、後の方が両方を見て締める）
  perform pg_advisory_xact_lock(hashtext('rengeki:' || p_room || ':' || p_gen));
  if exists (select 1 from public.rated_matches where room = p_room and gen = p_gen) then return; end if;
  select count(*) into n from public.match_reports where room = p_room and gen = p_gen;
  if n = 0 or (n = 1 and not p_force) then return; end if;
  select * into r1 from public.match_reports where room = p_room and gen = p_gen order by player limit 1;
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
      -- 両方 dc は回線の事故なので、もめごとに数えない
      if not (r1.result = 'dc' and r2.result = 'dc') then
        update public.profiles set disputes = disputes + 1 where id in (r1.player, r1.opponent);
      end if;
      return;
    end if;
  end if;
  select * into pa from public.profiles where id = r1.player for update;
  select * into pb from public.profiles where id = r1.opponent for update;
  select count(*) into recent from public.rated_matches
    where score_a is not null and created_at > now() - interval '1 day'
      and ((a = r1.player and b = r1.opponent) or (a = r1.opponent and b = r1.player));
  if pa.id is null or pb.id is null or recent >= 5 or public.too_disputed(pa) or public.too_disputed(pb) then
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
  if p_result not in ('win', 'loss', 'draw', 'dc') or p_opp is null or p_opp = v_uid or not public.valid_room(p_room) then return null; end if;
  -- 自分が「この相手と始めた」と届けた試合の報告だけを残す
  if not exists (select 1 from public.match_starts where room = p_room and gen = p_gen and player = v_uid and opponent = p_opp) then return null; end if;
  insert into public.match_reports (room, gen, player, opponent, result) values (p_room, p_gen, v_uid, p_opp, p_result)
  on conflict do nothing;
  perform public.finalize_match(p_room, p_gen, false);
  select * into m from public.rated_matches where room = p_room and gen = p_gen;
  if m.room is null or m.score_a is null then return null; end if;
  select rating into v_rating from public.profiles where id = v_uid;
  return jsonb_build_object('delta', case when m.a = v_uid then m.delta_a else m.delta_b end, 'rating', v_rating);
end $$;

create or replace function public.finalize_stale() returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  -- 片方だけのまま10分たった試合と、同時に届いて締め損ねた試合を締める
  for r in
    select mr.room, mr.gen, count(*) as n from public.match_reports mr
    where not exists (select 1 from public.rated_matches rm where rm.room = mr.room and rm.gen = mr.gen)
    group by mr.room, mr.gen
    having min(mr.created_at) < now() - interval '10 minutes'
  loop
    perform public.finalize_match(r.room, r.gen, r.n = 1);
  end loop;
  delete from public.match_starts where created_at < now() - interval '1 day';
  delete from public.match_reports where created_at < now() - interval '1 day';
  -- 数えなかった試合の記録は30日で消す
  delete from public.rated_matches where score_a is null and created_at < now() - interval '30 days';
end $$;

revoke execute on function public.valid_room(text), public.too_disputed(public.profiles) from public, anon, authenticated;
