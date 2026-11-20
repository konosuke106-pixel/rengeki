-- 名前（＝ID）のテスト：重複なし・登録後は変えられない・BOT と見分けがつく。Supabase 上で execute_sql で流す。最後に rollback。全部通ると 'ALL OK'
begin;

create function pg_temp.mk() returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role) values (v, v::text || '@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', v::text, 'role', 'authenticated')::text, true);
  return v;
end $$;
create function pg_temp.as_user(v uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', v::text, 'role', 'authenticated')::text, true)::text, null::void
$$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; end $$;
-- 名前を登録してみて、だめならその理由（エラーの文）を返す。通れば 'ok'
create function pg_temp.try(v uuid, p_name text) returns text language plpgsql as $$
begin
  perform pg_temp.as_user(v);
  perform public.set_name(p_name);
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

do $$
declare a uuid; b uuid; c uuid;
begin
  a := pg_temp.mk(); b := pg_temp.mk(); c := pg_temp.mk();
  perform pg_temp.check(pg_temp.try(a, 'Hayabusa') = 'ok', '最初の登録は通る');
  perform pg_temp.check(pg_temp.try(b, 'Hayabusa') = 'name taken', '同じ名前は使えない');
  perform pg_temp.check(pg_temp.try(b, 'HAYABUSA') = 'name taken', '大文字小文字の違いは同じ名前');
  perform pg_temp.check(pg_temp.try(b, 'Ｈａｙａｂｕｓａ') = 'name taken', '全角半角の違いは同じ名前');
  perform pg_temp.check(pg_temp.try(b, ' Hayabusa ') = 'name taken', '前後の空白は無視');
  perform pg_temp.check(pg_temp.try(a, 'Tsubame') = 'name is fixed', '登録後は変えられない');
  perform pg_temp.check((select name from public.profiles where id = a) = 'Hayabusa', '名前は元のまま');
  perform pg_temp.check(pg_temp.try(b, 'Koro') = 'name reserved', 'BOT の名前は使えない');
  perform pg_temp.check(pg_temp.try(b, 'kuro') = 'name reserved', 'BOT の名前は大文字小文字違いでも使えない');
  perform pg_temp.check(pg_temp.try(b, 'BOT Kagari') = 'name reserved', '「BOT」で始まる名前は使えない');
  perform pg_temp.check(pg_temp.try(b, 'bot_1') = 'name reserved', '「bot」＋記号も使えない');
  perform pg_temp.check(pg_temp.try(b, 'ＢＯＴ') = 'name reserved', '全角の BOT も使えない');
  perform pg_temp.check(pg_temp.try(b, 'Botan') = 'ok', '「Botan」のような普通の名前は使える');
  perform pg_temp.check(pg_temp.try(c, 'ア' || chr(10) || 'イ') = 'name invalid', '改行などの見えない文字は使えない');
  perform pg_temp.check(pg_temp.try(c, 'A') = 'name invalid', '1文字は使えない');
  -- 削除すると名前は空く
  perform pg_temp.as_user(a); perform public.delete_my_account();
  perform pg_temp.check(pg_temp.try(c, 'hayabusa') = 'ok', '削除された人の名前は使える');
end $$;

select 'ALL OK' as result;
rollback;
