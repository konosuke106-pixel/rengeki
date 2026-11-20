-- ランクマッチの BOT のサーバー側のテスト。Supabase 上で execute_sql で流す。最後に rollback。全部通ると 'ALL OK'
begin;

create function pg_temp.mk(p_name text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role) values (v, v::text || '@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', v::text, 'role', 'authenticated')::text, true);
  if p_name is not null then perform public.set_name(p_name); end if;
  return v;
end $$;
create function pg_temp.r(v uuid) returns int language sql as $$ select rating from public.profiles where id = v $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; end $$;

do $$
declare a uuid; b uuid; n uuid; j jsonb; m uuid; m2 uuid; br int; i int; before int;
begin
  perform pg_temp.check((select count(*) from public.list_bots()) = 10, 'BOT は10体');
  perform pg_temp.check((select count(*) from public.ranking() where is_bot) = 10, 'ランキングに BOT が10体、印つき');

  a := pg_temp.mk('エー'); b := pg_temp.mk('ビー');
  j := public.bot_start(a, 'v1');
  perform pg_temp.check(j is not null and (j->>'seed') is not null, 'BOT 戦を始められる');
  perform pg_temp.check(abs((j->'bot'->>'rating')::int - 1500) <= 200, 'レートの近い BOT: ' || j::text);
  m := (j->>'match_id')::uuid;
  br := (select rating from public.bots where id = j->'bot'->>'id');

  j := public.bot_finish(m, a, 'win');
  perform pg_temp.check((j->>'delta')::int > 0 and pg_temp.r(a) = 1500 + (j->>'delta')::int, '勝てば上がる: ' || coalesce(j::text, 'null'));
  perform pg_temp.check((select rating from public.bots where id = (select bot from public.bot_matches where id = m)) = br, 'BOT のレートは動かない');
  perform pg_temp.check((select games from public.profiles where id = a) = 1 and (select wins from public.profiles where id = a) = 1, '試合数と勝ち数');

  before := pg_temp.r(a);
  perform pg_temp.check(public.bot_finish(m, a, 'win') is null and pg_temp.r(a) = before, '二重には動かない');
  perform pg_temp.check(public.bot_finish(m, b, 'win') is null, '他人の試合には出せない');

  m := (public.bot_start(a, 'v1')->>'match_id')::uuid;
  perform public.bot_finish(m, a, 'void');
  perform pg_temp.check(pg_temp.r(a) = before, 'void は動かない');

  m := (public.bot_start(b, 'v1')->>'match_id')::uuid;
  perform public.bot_finish(m, b, 'invalid');
  perform pg_temp.check(pg_temp.r(b) < 1500, 'invalid は負け');

  -- 20分たっても結果がなければ負け
  m := (public.bot_start(a, 'v1')->>'match_id')::uuid;
  before := pg_temp.r(a);
  update public.bot_matches set created_at = now() - interval '21 minutes' where id = m;
  perform public.finalize_stale();
  perform pg_temp.check(pg_temp.r(a) < before, '20分で負け');
  perform pg_temp.check(public.bot_finish(m, a, 'win') is null, '負けが決まった後は出せない');

  -- 同じ BOT は1日5回まで
  n := pg_temp.mk('エヌ');
  for i in 1..5 loop
    insert into public.bot_matches (player, bot, seed, version) values (n, 'koro', i, 'v1') returning id into m;
    perform public.bot_finish(m, n, 'win');
  end loop;
  before := pg_temp.r(n);
  insert into public.bot_matches (player, bot, seed, version) values (n, 'koro', 9, 'v1') returning id into m;
  perform public.bot_finish(m, n, 'win');
  perform pg_temp.check(pg_temp.r(n) = before and (select games from public.profiles where id = n) = 5, '同じ BOT の6試合目は数えない');

  -- 名前のない人は始められない
  perform pg_temp.check(public.bot_start(pg_temp.mk(null), 'v1') is null, '名前がなければ始められない');
end $$;

-- ログインした人が直接呼ぶことはできない（Edge Function だけが呼ぶ）
set local role authenticated;
do $$
begin
  begin perform public.bot_start(gen_random_uuid(), 'v1'); raise exception 'FAIL: bot_start を直接呼べた';
  exception when insufficient_privilege then null; end;
  begin perform public.bot_finish(gen_random_uuid(), gen_random_uuid(), 'win'); raise exception 'FAIL: bot_finish を直接呼べた';
  exception when insufficient_privilege then null; end;
  perform 1 from public.list_bots();
end $$;
reset role;

select 'ALL OK' as result;
rollback;
