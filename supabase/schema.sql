-- ============================================================
-- МИНИ ДРАМ — S2 схем (Supabase)
-- khiye-ийн project дээр зэрэгцэн ажиллана: бүх хүснэгт md_ угтвартай.
-- Суулгах: Supabase Dashboard → SQL Editor → энэ файлыг бүхэлд нь
-- хуулж буулгаад Run дарна. Дахин ажиллуулахад аюулгүй (idempotent).
-- ============================================================

-- 1) Хэрэглэгчийн профайл (утас + coin данс)
create table if not exists public.md_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text unique not null,
  coins integer not null default 0 check (coins >= 0),
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

drop trigger if exists md_first_admin on public.md_profiles;
drop trigger if exists md_owner_admin on public.md_profiles;
create trigger md_owner_admin
  before insert on public.md_profiles
  for each row execute function public.md_owner_is_admin();

-- 2) Цувралын үнийн мэдээлэл (сервер талын үнэн — client үнэ илгээдэггүй)
create table if not exists public.md_series (
  id text primary key,
  free_count integer not null default 2,
  unlock_cost integer not null default 30,
  bundle_cost integer not null default 80
);

insert into public.md_series (id, free_count, unlock_cost, bundle_cost) values
  ('altan-zagas', 2, 30, 50),
  ('tsuutiin-guu', 2, 30, 80)
on conflict (id) do update
  set free_count = excluded.free_count,
      unlock_cost = excluded.unlock_cost,
      bundle_cost = excluded.bundle_cost;

-- 3) Coin-ий багцууд (цэнэглэлтийн зөвшөөрөгдсөн үнэ)
create table if not exists public.md_packs (
  coins integer primary key,
  price integer not null
);

insert into public.md_packs (coins, price) values
  (100, 3000), (300, 8000), (500, 12000)
on conflict (coins) do update set price = excluded.price;

-- 4) Нээсэн ангиуд
create table if not exists public.md_unlocks (
  user_id uuid not null references public.md_profiles (id) on delete cascade,
  series_id text not null,
  ep_index integer not null,
  created_at timestamptz not null default now(),
  primary key (user_id, series_id, ep_index)
);

-- 5) Цэнэглэлтийн хүсэлтүүд
create table if not exists public.md_topups (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.md_profiles (id) on delete cascade,
  coins integer not null,
  price integer not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- ============================================================
-- RLS — уншихыг хязгаарлана; бичилт зөвхөн доорх функцуудаар
-- ============================================================
alter table public.md_profiles enable row level security;
alter table public.md_series enable row level security;
alter table public.md_packs enable row level security;
alter table public.md_unlocks enable row level security;
alter table public.md_topups enable row level security;

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

drop policy if exists md_packs_select on public.md_packs;
create policy md_packs_select on public.md_packs
  for select using (true);

drop policy if exists md_unlocks_select on public.md_unlocks;
create policy md_unlocks_select on public.md_unlocks
  for select using (user_id = auth.uid() or public.md_is_admin());

drop policy if exists md_topups_select on public.md_topups;
create policy md_topups_select on public.md_topups
  for select using (user_id = auth.uid() or public.md_is_admin());

-- ============================================================
-- Функцууд (бүх мөнгөн гүйлгээ зөвхөн эндээс — атомар, сервер талын үнээр)
-- ============================================================

-- Анги нээх: амжилттай бол шинэ үлдэгдэл буцаана
create or replace function public.md_unlock_episode(p_series text, p_ep integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cost integer;
  v_free integer;
  v_coins integer;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  select coalesce(s.unlock_cost, 30), coalesce(s.free_count, 2)
    into v_cost, v_free
    from (select 1) x
    left join md_series s on s.id = p_series;

  -- Үнэгүй эсвэл аль хэдийн нээсэн бол мөнгө авахгүй
  if p_ep <= v_free
     or exists (select 1 from md_unlocks
                where user_id = auth.uid() and series_id = p_series and ep_index = p_ep) then
    return (select coins from md_profiles where id = auth.uid());
  end if;

  update md_profiles
     set coins = coins - v_cost
   where id = auth.uid() and coins >= v_cost
  returning coins into v_coins;

  if v_coins is null then
    raise exception 'insufficient_coins';
  end if;

  insert into md_unlocks (user_id, series_id, ep_index)
  values (auth.uid(), p_series, p_ep)
  on conflict do nothing;

  return v_coins;
end;
$$;

-- Багцаар нээх: цувралын түгжээтэй бүх ангийг bundle үнээр нээнэ
create or replace function public.md_unlock_bundle(p_series text, p_eps integer[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cost integer;
  v_coins integer;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  if p_eps is null or array_length(p_eps, 1) is null then
    return (select coins from md_profiles where id = auth.uid());
  end if;

  select coalesce((select bundle_cost from md_series where id = p_series),
                  greatest(10, ceil(array_length(p_eps, 1) * 30 * 0.7 / 10)::integer * 10))
    into v_cost;

  update md_profiles
     set coins = coins - v_cost
   where id = auth.uid() and coins >= v_cost
  returning coins into v_coins;

  if v_coins is null then
    raise exception 'insufficient_coins';
  end if;

  insert into md_unlocks (user_id, series_id, ep_index)
  select auth.uid(), p_series, unnest(p_eps)
  on conflict do nothing;

  return v_coins;
end;
$$;

-- Цэнэглэлтийн хүсэлт үүсгэх (зөвхөн зөвшөөрөгдсөн багцаар)
create or replace function public.md_request_topup(p_coins integer)
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

  select price into v_price from md_packs where coins = p_coins;
  if v_price is null then
    raise exception 'unknown_pack';
  end if;

  -- Нэг хэрэглэгч 5-аас олон хүлээгдэж буй хүсэлт үүсгэхгүй (спам хамгаалалт)
  if (select count(*) from md_topups where user_id = auth.uid() and status = 'pending') >= 5 then
    raise exception 'too_many_pending';
  end if;

  insert into md_topups (user_id, coins, price)
  values (auth.uid(), p_coins, v_price)
  returning id into v_id;

  return v_id;
end;
$$;

-- АДМИН: хүсэлтийг баталгаажуулж coin нэмэх
create or replace function public.md_confirm_topup(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_coins integer;
begin
  if not public.md_is_admin() then
    raise exception 'not_admin';
  end if;

  update md_topups
     set status = 'confirmed', decided_at = now()
   where id = p_id and status = 'pending'
  returning user_id, coins into v_user, v_coins;

  if v_user is null then
    raise exception 'not_pending';
  end if;

  update md_profiles set coins = coins + v_coins where id = v_user;
end;
$$;

-- АДМИН: хүсэлтийг татгалзах
create or replace function public.md_reject_topup(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.md_is_admin() then
    raise exception 'not_admin';
  end if;
  update md_topups
     set status = 'rejected', decided_at = now()
   where id = p_id and status = 'pending';
end;
$$;

-- АДМИН: утсаар нь гараар coin нэмэх (дурын дүн, жишээ нь урамшуулал)
create or replace function public.md_admin_credit(p_phone text, p_coins integer)
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
  update md_profiles set coins = coins + p_coins where id = v_user;
end;
$$;

-- Админ хуудасны жагсаалт: хүсэлт + утасны дугаар
create or replace view public.md_topups_admin as
  select t.id, t.coins, t.price, t.status, t.created_at, t.decided_at, p.phone
    from public.md_topups t
    join public.md_profiles p on p.id = t.user_id;

-- view нь дуудагчийн эрхээр ажиллана (RLS хэрэгжинэ)
alter view public.md_topups_admin set (security_invoker = true);

grant execute on function
  public.md_is_admin(),
  public.md_unlock_episode(text, integer),
  public.md_unlock_bundle(text, integer[]),
  public.md_request_topup(integer),
  public.md_confirm_topup(bigint),
  public.md_reject_topup(bigint),
  public.md_admin_credit(text, integer)
to authenticated;
