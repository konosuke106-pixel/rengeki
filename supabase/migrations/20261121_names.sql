-- 名前（＝ID）：重複なし・登録後は変えられない・BOT と見分けがつく
-- 重複は「前後の空白を除き、全角半角をそろえ（NFKC）、小文字にした形」（name_key）で比べる
create or replace function public.name_key(p_name text) returns text
language sql immutable set search_path = '' as $$
  select lower(normalize(btrim(coalesce(p_name, '')), NFKC))
$$;

alter table public.profiles add column if not exists name_key text;
update public.profiles set name_key = public.name_key(name) where name_key is null;
alter table public.profiles alter column name_key set not null;
create unique index if not exists profiles_name_key on public.profiles (name_key);

create or replace function public.set_name(p_name text) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.require_uid(); v_name text := btrim(coalesce(p_name, '')); v_key text; v public.profiles;
begin
  if char_length(v_name) < 2 or char_length(v_name) > 12 or v_name ~ '[[:cntrl:]]' then raise exception 'name invalid'; end if;
  -- 一度決めた名前は変えられない
  if exists (select 1 from public.profiles where id = v_uid) then raise exception 'name is fixed'; end if;
  v_key := public.name_key(v_name);
  -- BOT の名前と「BOT」で始まる名前は使えない（人と BOT を見分けるため。「Botan」のような名前は使える）
  if v_key ~ '^bot([^a-z]|$)' or exists (select 1 from public.bots b where public.name_key(b.name) = v_key) then
    raise exception 'name reserved';
  end if;
  begin
    insert into public.profiles (id, name, name_key) values (v_uid, v_name, v_key) returning * into v;
  exception when unique_violation then
    raise exception 'name taken';
  end;
  return v;
end $$;

revoke execute on function public.name_key(text) from public, anon, authenticated;
