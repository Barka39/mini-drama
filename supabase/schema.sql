-- ============================================================
-- МИНИ ДРАМ — S2.5 схем (Supabase): кино бүр нэг үнэтэй загвар
-- khiye-ийн project дээр зэрэгцэн ажиллана: бүх хүснэгт md_ угтвартай.
-- Coin систем хасагдсан: кино бүр өөрийн үнэтэй, эхний минутууд үнэгүй,
-- худалдан авалт = нэг удаагийн шилжүүлэг + админы баталгаажуулалт.
-- Суулгах: Management API-ийн database/query эсвэл Dashboard SQL Editor.
-- Дахин ажиллуулахад аюулгүй (idempotent).
-- ============================================================

-- 1) Хэрэглэгчийн профайл (утас = данс)
create table if not exists public.md_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text unique not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Эзний утасны дугаараар бүртгүүлсэн хэрэглэгч автоматаар админ болно
create or replace function public.md_owner_is_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.phone = '91300737' then
    new.is_admin := true;
  end if;
  return new;
end;
$$;

drop trigger if exists md_owner_admin on public.md_profiles;
create trigger md_owner_admin
  before insert on public.md_profiles
  for each row execute function public.md_owner_is_admin();

-- 2) Кинонуудын үнэ (сервер талын үнэн — client үнэ илгээдэггүй)
--    price = 0 бол бүх анги үнэгүй; free_minutes = эхний хэдэн минут үнэгүй
-- Киноны бүх засварлах мэдээлэл ЭНД байна (админ хуудаснаас удирдана).
-- catalog.json нь зөвхөн ангиудын файлын жагсаалтыг агуулна.
create table if not exists public.md_series (
  id text primary key,
  price integer not null default 3500,
  free_minutes numeric not null default 20
);

alter table public.md_series add column if not exists price integer not null default 3500;
alter table public.md_series add column if not exists free_minutes numeric not null default 20;
alter table public.md_series add column if not exists title text not null default '';
alter table public.md_series add column if not exists tagline text not null default '';
alter table public.md_series add column if not exists genre text not null default '';
alter table public.md_series add column if not exists sort_order integer not null default 0;
alter table public.md_series add column if not exists hidden boolean not null default false;
-- Ангиудын урт (секунд) ба түүнээс тооцсон үнэгүй ангийн тоо.
-- Бичлэг дамжуулагч (Cloudflare Function) энэ тоог хараад эрхийг шийддэг тул
-- үнэгүй хязгаарыг клиент талаас хуурах боломжгүй.
alter table public.md_series add column if not exists ep_durations numeric[] not null default '{}';
alter table public.md_series add column if not exists free_eps integer not null default 0;

-- Эхний free_minutes минутад ЭХЭЛДЭГ ангиудыг үнэгүй гэж тооцно
create or replace function public.md_free_eps_from(p_durations numeric[], p_free_min numeric)
returns integer
language plpgsql
immutable
as $$
declare
  v_limit numeric := coalesce(p_free_min, 0) * 60;
  v_acc numeric := 0;
  v_cnt integer := 0;
  d numeric;
begin
  if p_durations is null then return 0; end if;
  foreach d in array p_durations loop
    exit when v_acc >= v_limit;
    v_cnt := v_cnt + 1;
    v_acc := v_acc + coalesce(d, 0);
  end loop;
  return v_cnt;
end;
$$;

create or replace function public.md_series_sync_free_eps()
returns trigger
language plpgsql
as $$
begin
  new.free_eps := public.md_free_eps_from(new.ep_durations, new.free_minutes);
  return new;
end;
$$;

drop trigger if exists md_series_free_eps on public.md_series;
create trigger md_series_free_eps
  before insert or update on public.md_series
  for each row execute function public.md_series_sync_free_eps();
alter table public.md_series drop column if exists free_count;
alter table public.md_series drop column if exists unlock_cost;
alter table public.md_series drop column if exists bundle_cost;

insert into public.md_series (id, price, free_minutes) values
  ('altan-zagas', 0, 20),
  ('tsuutiin-guu', 0, 20),
  ('series-260802-0128', 3500, 20),
  ('series-260802-0147', 3500, 20)
on conflict (id) do update
  set price = excluded.price,
      free_minutes = excluded.free_minutes;

-- 3) Сайтын тохиргоо (данс г.м) — админ хуудаснаас удирдана, ганц мөр
create table if not exists public.md_settings (
  id integer primary key default 1 check (id = 1),
  bank_name text not null default '',
  account_number text not null default '',
  iban text not null default '',
  account_name text not null default '',
  contact text not null default ''
);

alter table public.md_settings add column if not exists iban text not null default '';

insert into public.md_settings (id, bank_name, account_number, account_name, contact)
values (1, 'Хаан банк', '', '', '')
on conflict (id) do nothing;

-- 4) Худалдан авалтууд (хүсэлт → админ баталгаажуулбал кино бүрмөсөн нээгдэнэ)
create table if not exists public.md_purchases (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.md_profiles (id) on delete cascade,
  series_id text not null,
  price integer not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- Захиалга бүр ӨВӨРМӨЦ дүнтэй: банкнаас ирсэн мэдэгдлийг гүйлгээний утгагүйгээр
-- таних боломж олгоно (хэрэглэгчид утгаа буруу бичдэг/мартдаг).
alter table public.md_purchases add column if not exists amount integer;
update public.md_purchases set amount = price where amount is null;
create index if not exists md_purchases_amount_pending
  on public.md_purchases (amount) where status = 'pending';

-- Банкнаас ирсэн мэдэгдлийн бүртгэл (танигдсан ч, танигдаагүй ч бүгд энд)
create table if not exists public.md_bank_msgs (
  id bigint generated always as identity primary key,
  raw text not null,
  amount numeric,
  purchase_id bigint references public.md_purchases (id) on delete set null,
  matched boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.md_bank_msgs enable row level security;
drop policy if exists md_bank_msgs_select on public.md_bank_msgs;
create policy md_bank_msgs_select on public.md_bank_msgs
  for select using (public.md_is_admin());

-- Нууц тохиргоо. RLS асаалттай ба ямар ч policy байхгүй тул API-гаар ХЭН Ч уншиж
-- чадахгүй; зөвхөн security definer функцууд дотроос хандана.
create table if not exists public.md_config (
  id integer primary key default 1 check (id = 1),
  bank_secret text not null default ''
);
alter table public.md_config enable row level security;
insert into public.md_config (id) values (1) on conflict (id) do nothing;

-- Нэг хэрэглэгч нэг киног давхардуулж хүсэх/авахгүй
create unique index if not exists md_purchases_one_pending
  on public.md_purchases (user_id, series_id) where status = 'pending';
create unique index if not exists md_purchases_one_confirmed
  on public.md_purchases (user_id, series_id) where status = 'confirmed';

-- ============================================================
-- RLS
-- ============================================================
alter table public.md_profiles enable row level security;
alter table public.md_series enable row level security;
alter table public.md_purchases enable row level security;
alter table public.md_settings enable row level security;

create or replace function public.md_is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select is_admin from md_profiles where id = auth.uid()),
    false
  );
$$;

drop policy if exists md_profiles_select on public.md_profiles;
create policy md_profiles_select on public.md_profiles
  for select using (id = auth.uid() or public.md_is_admin());

drop policy if exists md_profiles_insert on public.md_profiles;
create policy md_profiles_insert on public.md_profiles
  for insert with check (id = auth.uid());

drop policy if exists md_series_select on public.md_series;
create policy md_series_select on public.md_series
  for select using (true);

drop policy if exists md_purchases_select on public.md_purchases;
create policy md_purchases_select on public.md_purchases
  for select using (user_id = auth.uid() or public.md_is_admin());

drop policy if exists md_settings_select on public.md_settings;
create policy md_settings_select on public.md_settings
  for select using (true);

-- ============================================================
-- Функцууд (бүх мөнгөн гүйлгээ зөвхөн эндээс — атомар, сервер талын үнээр)
-- ============================================================

-- Худалдан авах хүсэлт үүсгэх
create or replace function public.md_request_purchase(p_series text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price integer;
  v_id bigint;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  select price into v_price from md_series where id = p_series;
  if v_price is null then
    raise exception 'unknown_series';
  end if;
  if v_price <= 0 then
    raise exception 'free_series';
  end if;

  if exists (select 1 from md_purchases
             where user_id = auth.uid() and series_id = p_series and status = 'confirmed') then
    raise exception 'already_owned';
  end if;
  if exists (select 1 from md_purchases
             where user_id = auth.uid() and series_id = p_series and status = 'pending') then
    raise exception 'already_pending';
  end if;
  -- Спам хамгаалалт
  if (select count(*) from md_purchases where user_id = auth.uid() and status = 'pending') >= 10 then
    raise exception 'too_many_pending';
  end if;

  -- Өвөрмөц дүн онооно: зарласан үнээс 1..N төгрөг ХАСНА (нэмэхгүй — хэрэглэгч
  -- зарласнаас илүү төлөх ёсгүй). Хүлээгдэж буй бусад захиалгатай давхцахгүй.
  declare
    v_max_off integer := least(99, greatest(1, floor(v_price * 0.03)::integer));
    v_amount integer := null;
    v_off integer;
  begin
    for v_off in
      select g from generate_series(1, v_max_off) g order by random()
    loop
      if not exists (
        select 1 from md_purchases
        where amount = v_price - v_off
          and status = 'pending'
          and created_at > now() - interval '48 hours'
      ) then
        v_amount := v_price - v_off;
        exit;
      end if;
    end loop;
    if v_amount is null then v_amount := v_price; end if;

    insert into md_purchases (user_id, series_id, price, amount)
    values (auth.uid(), p_series, v_price, v_amount)
    returning id into v_id;
  end;

  return v_id;
end;
$$;

-- ============================================================
-- Банкны мэдэгдлээр АВТОМАТ баталгаажуулах
-- Ямар ч суваг (Legion-ий и-мэйл, Android-ийн SMS, гар) энд залгана.
-- Нууц үгээр хамгаалагдсан тул нээлттэй дуудагдах боловч хуурах боломжгүй.
-- ============================================================
drop function if exists public.md_confirm_by_amount(text, numeric, text);

create or replace function public.md_confirm_by_amount(
  p_secret text,
  p_amount numeric,
  p_raw text,
  p_utga text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
  v_id bigint;
  v_series text;
  v_phone text;
  v_how text;
begin
  select bank_secret = p_secret and length(bank_secret) > 10
    into v_ok from md_config where id = 1;
  if not coalesce(v_ok, false) then
    raise exception 'bad_secret';
  end if;

  -- 1) ҮНДСЭН ЗАМ: яг тэр өвөрмөц дүнтэй хүлээгдэж буй захиалга
  select p.id, p.series_id, u.phone
    into v_id, v_series, v_phone
    from md_purchases p
    join md_profiles u on u.id = p.user_id
   where p.amount = p_amount
     and p.status = 'pending'
     and p.created_at > now() - interval '48 hours'
   order by p.created_at
   limit 1;
  if v_id is not null then v_how := 'amount'; end if;

  -- 2) НӨӨЦ ЗАМ: гүйлгээний утганд хэрэглэгчийн утасны дугаар байвал.
  --    Дүн нь киноны үнийг хангасан байх ёстой (дутуу төлбөрөөр нээхгүй).
  if v_id is null and coalesce(p_utga, '') <> '' then
    select p.id, p.series_id, u.phone
      into v_id, v_series, v_phone
      from md_purchases p
      join md_profiles u on u.id = p.user_id
     where p.status = 'pending'
       and p.created_at > now() - interval '48 hours'
       and length(u.phone) = 8
       and regexp_replace(p_utga, '\D', '', 'g') like '%' || u.phone || '%'
       and p_amount >= p.amount
     order by p.created_at
     limit 1;
    if v_id is not null then v_how := 'utga'; end if;
  end if;

  if v_id is null then
    insert into md_bank_msgs (raw, amount, matched) values (p_raw, p_amount, false);
    return jsonb_build_object('matched', false);
  end if;

  update md_purchases set status = 'confirmed', decided_at = now() where id = v_id;
  insert into md_bank_msgs (raw, amount, purchase_id, matched)
  values (p_raw, p_amount, v_id, true);

  return jsonb_build_object(
    'matched', true, 'how', v_how,
    'purchase_id', v_id, 'series_id', v_series, 'phone', v_phone
  );
end;
$$;

grant execute on function public.md_confirm_by_amount(text, numeric, text, text) to anon, authenticated;

-- АДМИН: хүсэлтийг баталгаажуулах (кино тухайн хэрэглэгчид бүрмөсөн нээгдэнэ)
create or replace function public.md_confirm_purchase(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.md_is_admin() then
    raise exception 'not_admin';
  end if;
  update md_purchases
     set status = 'confirmed', decided_at = now()
   where id = p_id and status = 'pending';
  if not found then
    raise exception 'not_pending';
  end if;
end;
$$;

-- АДМИН: хүсэлтийг татгалзах
create or replace function public.md_reject_purchase(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.md_is_admin() then
    raise exception 'not_admin';
  end if;
  update md_purchases
     set status = 'rejected', decided_at = now()
   where id = p_id and status = 'pending';
  if not found then
    raise exception 'not_pending';
  end if;
end;
$$;

-- АДМИН: утсаар нь киног гараар нээж өгөх (бэлнээр авсан, урамшуулал г.м)
create or replace function public.md_admin_grant(p_phone text, p_series text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if not public.md_is_admin() then
    raise exception 'not_admin';
  end if;
  select id into v_user from md_profiles where phone = p_phone;
  if v_user is null then
    raise exception 'phone_not_found';
  end if;
  if not exists (select 1 from md_series where id = p_series) then
    raise exception 'unknown_series';
  end if;

  -- Хүлээгдэж буй хүсэлт байвал түүнийг нь баталгаажуулна, үгүй бол шууд нээнэ
  update md_purchases
     set status = 'confirmed', decided_at = now()
   where user_id = v_user and series_id = p_series and status = 'pending';
  if not found then
    insert into md_purchases (user_id, series_id, price, status, decided_at)
    values (v_user, p_series, 0, 'confirmed', now())
    on conflict do nothing;
  end if;
end;
$$;

-- АДМИН: сайтын тохиргоог (данс) шинэчлэх
drop function if exists public.md_update_settings(text, text, text, text);

create or replace function public.md_update_settings(
  p_bank_name text,
  p_account_number text,
  p_iban text,
  p_account_name text,
  p_contact text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.md_is_admin() then
    raise exception 'not_admin';
  end if;
  update md_settings
     set bank_name = p_bank_name,
         account_number = p_account_number,
         iban = p_iban,
         account_name = p_account_name,
         contact = p_contact
   where id = 1;
end;
$$;

-- АДМИН: киноны мэдээллийг засах (нэр, ангилал, үнэ, эрэмбэ, нуух)
create or replace function public.md_update_series(
  p_id text,
  p_title text,
  p_tagline text,
  p_genre text,
  p_price integer,
  p_free_minutes numeric,
  p_sort_order integer,
  p_hidden boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.md_is_admin() then
    raise exception 'not_admin';
  end if;
  if p_price < 0 then
    raise exception 'bad_price';
  end if;
  update md_series
     set title = p_title,
         tagline = p_tagline,
         genre = p_genre,
         price = p_price,
         free_minutes = greatest(0, p_free_minutes),
         sort_order = p_sort_order,
         hidden = p_hidden
   where id = p_id;
  if not found then
    raise exception 'unknown_series';
  end if;
end;
$$;

-- Админ хуудасны жагсаалт: хүсэлт + утасны дугаар
create or replace view public.md_purchases_admin as
  select t.id, t.series_id, t.price, t.status, t.created_at, t.decided_at, p.phone
    from public.md_purchases t
    join public.md_profiles p on p.id = t.user_id;

alter view public.md_purchases_admin set (security_invoker = true);

grant execute on function
  public.md_is_admin(),
  public.md_request_purchase(text),
  public.md_confirm_purchase(bigint),
  public.md_reject_purchase(bigint),
  public.md_admin_grant(text, text),
  public.md_update_settings(text, text, text, text, text),
  public.md_update_series(text, text, text, text, integer, numeric, integer, boolean)
to authenticated;

-- ============================================================
-- Coin эриний үлдэгдлийг цэвэрлэх (S2 → S2.5 шилжилт)
-- ============================================================
drop view if exists public.md_topups_admin;
drop function if exists public.md_unlock_episode(text, integer);
drop function if exists public.md_unlock_bundle(text, integer[]);
drop function if exists public.md_request_topup(integer);
drop function if exists public.md_confirm_topup(bigint);
drop function if exists public.md_reject_topup(bigint);
drop function if exists public.md_admin_credit(text, integer);
drop table if exists public.md_topups;
drop table if exists public.md_packs;
drop table if exists public.md_unlocks;
alter table public.md_profiles drop column if exists coins;
