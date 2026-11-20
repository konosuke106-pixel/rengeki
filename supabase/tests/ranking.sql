-- レートとランキングのサーバー側のテスト。Supabase 上で execute_sql で流す。
-- 最後に rollback するので何も残らない。失敗するとその場で例外になり、全部通ると 'ALL OK' を返す
begin;

create function pg_temp.mk(p_name text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role) values (v, v::text || '@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', v::text, 'role', 'authenticated')::text, true);
  perform public.set_name(p_name);
  return v;
end $$;
create function pg_temp.as_user(v uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', v::text, 'role', 'authenticated')::text, true)::text, null::void
$$;
create function pg_temp.r(v uuid) returns int language sql as $$ select rating from public.profiles where id = v $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; end $$;
-- 2人が試合を始める
create function pg_temp.start2(a uuid, b uuid, room text, gen int default 0) returns void language plpgsql as $$
begin
  perform pg_temp.as_user(a); perform public.start_match(room, gen, b);
  perform pg_temp.as_user(b); perform public.start_match(room, gen, a);
end $$;
create function pg_temp.rep(who uuid, opp uuid, room text, res text, gen int default 0) returns jsonb language plpgsql as $$
begin perform pg_temp.as_user(who); return public.report_match(room, gen, opp, res); end $$;

do $$
declare a uuid; b uuid; c uuid; d uuid; j jsonb; i int; p public.profiles;
begin
  -- 一致：A の勝ち
  a := pg_temp.mk('アカ'); b := pg_temp.mk('ブルー');
  perform pg_temp.start2(a, b, 'RTSTAAAA2');
  j := pg_temp.rep(a, b, 'RTSTAAAA2', 'win');
  perform pg_temp.check(j is null, '1人目の報告ではまだ確定しない');
  j := pg_temp.rep(b, a, 'RTSTAAAA2', 'loss');
  perform pg_temp.check((j->>'delta')::int = -20 and (j->>'rating')::int = 1480, '負けた側に -20 / 1480 が返る: ' || coalesce(j::text, 'null'));
  perform pg_temp.check(pg_temp.r(a) = 1520 and pg_temp.r(b) = 1480, '一致で ±20');
  select * into p from public.profiles where id = a;
  perform pg_temp.check(p.games = 1 and p.wins = 1, '試合数と勝ち数');
  -- 二重報告：同じ報告をもう一度送っても動かない
  j := pg_temp.rep(a, b, 'RTSTAAAA2', 'win');
  perform pg_temp.check(pg_temp.r(a) = 1520, '二重報告で二重に動かない');

  -- 食い違い：両方が勝ちを主張
  perform pg_temp.start2(a, b, 'RTSTAAAA3');
  perform pg_temp.rep(a, b, 'RTSTAAAA3', 'win'); perform pg_temp.rep(b, a, 'RTSTAAAA3', 'win');
  perform pg_temp.check(pg_temp.r(a) = 1520 and pg_temp.r(b) = 1480, '食い違いは動かない');

  -- 引き分け
  c := pg_temp.mk('シロ'); d := pg_temp.mk('クロ');
  perform pg_temp.start2(c, d, 'RTSTAAAA4');
  perform pg_temp.rep(c, d, 'RTSTAAAA4', 'draw'); perform pg_temp.rep(d, c, 'RTSTAAAA4', 'draw');
  perform pg_temp.check(pg_temp.r(c) = 1500 and (select games from public.profiles where id = c) = 1, '引き分けは同点どうしで動かず、試合数は増える');

  -- 両方「相手が切れた」
  perform pg_temp.start2(c, d, 'RTSTAAAA5');
  perform pg_temp.rep(c, d, 'RTSTAAAA5', 'dc'); perform pg_temp.rep(d, c, 'RTSTAAAA5', 'dc');
  perform pg_temp.check(pg_temp.r(c) = 1500 and pg_temp.r(d) = 1500, '両方 dc は動かない');

  -- 片方だけ：10分たつと報告した側の結果で確定（逃げても負けを避けられない）
  perform pg_temp.start2(c, d, 'RTSTAAAA6');
  perform pg_temp.rep(c, d, 'RTSTAAAA6', 'dc');
  perform public.finalize_stale();
  perform pg_temp.check(pg_temp.r(c) = 1500, '10分前は確定しない');
  update public.match_reports set created_at = now() - interval '11 minutes' where room = 'RTSTAAAA6';
  perform public.finalize_stale();
  perform pg_temp.check(pg_temp.r(c) = 1520 and pg_temp.r(d) = 1480, '10分後に dc の報告で勝ち');

  -- 開始が片方しか届いていない試合は数えない（でっち上げ防止）
  perform pg_temp.as_user(c); perform public.start_match('RTSTAAAA7', 0, d);
  perform pg_temp.rep(c, d, 'RTSTAAAA7', 'win');
  update public.match_reports set created_at = now() - interval '11 minutes' where room = 'RTSTAAAA7';
  perform public.finalize_stale();
  perform pg_temp.check(pg_temp.r(c) = 1520, '開始が片方だけなら動かない');

  -- 同じ2人は1日5回まで（a-b はここまでで数えた試合が1回）
  for i in 1..5 loop
    perform pg_temp.start2(a, b, 'RCAPAAAA' || (i + 1));
    perform pg_temp.rep(a, b, 'RCAPAAAA' || (i + 1), 'win'); perform pg_temp.rep(b, a, 'RCAPAAAA' || (i + 1), 'loss');
  end loop;
  perform pg_temp.check((select games from public.profiles where id = a) = 5, '同じ相手との6試合目は数えない');

  -- 名前の長さ
  begin perform pg_temp.as_user(a); perform public.set_name('ア'); perform pg_temp.check(false, '1文字は通らない');
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform public.set_name('あいうえおかきくけこさしす'); perform pg_temp.check(false, '13文字は通らない');
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;

  -- ランキングと自分の順位
  perform pg_temp.check((select name from public.ranking() where not is_bot limit 1) = 'アカ', 'ランキングの1位（人の中で）');
  perform pg_temp.as_user(a); perform pg_temp.check(public.my_rank() = 1 + (select count(*)::int from public.list_bots() lb where lb.rating > pg_temp.r(a)), '自分の順位（BOT も数える）');

  -- 削除
  perform pg_temp.as_user(b); perform public.delete_my_account();
  perform pg_temp.check(not exists (select 1 from public.profiles where id = b), '削除で成績が消える');
  perform pg_temp.check(not exists (select 1 from public.ranking() where name = 'ブルー'), '削除でランキングから消える');
  perform pg_temp.check(exists (select 1 from public.rated_matches rm where rm.room = 'RTSTAAAA2' and (rm.a is null or rm.b is null)), '相手の記録は残る（id は消える）');
end $$;

-- 見直しで見つかった穴への対策
do $$
declare e uuid; f uuid; g uuid; h uuid; i int;
begin
  e := pg_temp.mk('イー'); f := pg_temp.mk('エフ'); g := pg_temp.mk('ジー'); h := pg_temp.mk('エイチ');
  -- ランダム対戦の部屋名の形でなければ受け付けない（でっち上げの部屋を防ぐ）
  perform pg_temp.start2(e, f, 'Rbad');
  perform pg_temp.check(not exists (select 1 from public.match_starts where room = 'Rbad'), '部屋名の形が違えば始められない');
  -- 自分が始めていない試合の報告は保存しない（ゴミの記録を防ぐ）
  perform pg_temp.rep(e, f, 'RNSTARTA2', 'win');
  perform pg_temp.check(not exists (select 1 from public.match_reports where room = 'RNSTARTA2'), '始めていない試合の報告は残らない');
  -- 報告が食い違うと2人とも「もめごと」が増え、もめごとの多い人はレートの対象外
  for i in 2..4 loop
    perform pg_temp.start2(e, f, 'RDSPAAAA' || i);
    perform pg_temp.rep(e, f, 'RDSPAAAA' || i, 'win'); perform pg_temp.rep(f, e, 'RDSPAAAA' || i, 'win');
  end loop;
  perform pg_temp.check((select disputes from public.profiles where id = e) = 3, 'もめごとが数えられる');
  perform pg_temp.start2(e, g, 'RDSPAAAA5');
  perform pg_temp.rep(e, g, 'RDSPAAAA5', 'win'); perform pg_temp.rep(g, e, 'RDSPAAAA5', 'loss');
  perform pg_temp.check(pg_temp.r(e) = 1500 and pg_temp.r(g) = 1500, 'もめごとの多い人との試合は動かない');
  -- 同時に届いて締め損ねた試合も、あとで締める
  perform pg_temp.start2(g, h, 'RRACEAAA2');
  insert into public.match_reports (room, gen, player, opponent, result, created_at) values
    ('RRACEAAA2', 0, g, h, 'win', now() - interval '11 minutes'), ('RRACEAAA2', 0, h, g, 'loss', now() - interval '11 minutes');
  perform public.finalize_stale();
  perform pg_temp.check(pg_temp.r(g) = 1520 and pg_temp.r(h) = 1480, '締め損ねた試合も締める');
  -- 試合を始める回数は1時間60回まで
  for i in 1..61 loop
    perform pg_temp.as_user(h); perform public.start_match('RLMTAAA' || substr('ABCDEFGHJKLMNPQRSTUVWXYZ', i / 24 + 1, 1) || substr('ABCDEFGHJKLMNPQRSTUVWXYZ', i % 24 + 1, 1), 0, g);
  end loop;
  perform pg_temp.check((select count(*) from public.match_starts where player = h) = 60, '始める回数の上限（この人の全部で1時間60回）');
end $$;

-- 表には直接書けない（RLS）
set local role authenticated;
do $$
begin
  begin
    insert into public.profiles (id, name) values (gen_random_uuid(), 'ズル');
    raise exception 'FAIL: profiles に直接書けた';
  exception when insufficient_privilege or check_violation or foreign_key_violation then null;
    when others then if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    update public.profiles set rating = 9999;
    if exists (select 1 from public.profiles where rating = 9999) then raise exception 'FAIL: レートを書き換えられた'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.profiles limit 1;
    raise exception 'FAIL: 成績の表を直接読めた（id や登録日時まで見える）';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.finalize_stale();
    raise exception 'FAIL: 内部の関数を呼べた';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'ALL OK' as result;
rollback;
