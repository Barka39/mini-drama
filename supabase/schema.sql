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

-- Кинонуудыг ЭНД БҮРТГЭХГҮЙ. Тэднийг «Сайт шинэчлэх» товчлуул catalog.json-оос
-- уншиж бүртгэдэг. Энд жагсаавал устгасан кино схем ажиллах бүрд амилдаг.

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

-- ============================================================
-- САРЫН ЭРХ (VIP) — нэг удаагийн худалдаатай ижил механизмаар ажиллана:
-- захиалга -> өвөрмөц дүн -> банкны мэдэгдэл -> автоматаар идэвхжинэ.
-- ============================================================
alter table public.md_profiles add column if not exists vip_until timestamptz;

create table if not exists public.md_plans (
  code text primary key,
  label text not null,
  days integer not null,
  price integer not null,
  sort_order integer not null default 0,
  active boolean not null default true
);

insert into public.md_plans (code, label, days, price, sort_order) values
  ('m1', '1 сарын эрх', 30, 8800, 1),
  ('m3', '3 сарын эрх', 90, 15500, 2)
on conflict (code) do update
  set label = excluded.label, days = excluded.days, price = excluded.price;

alter table public.md_plans enable row level security;
drop policy if exists md_plans_select on public.md_plans;
create policy md_plans_select on public.md_plans for select using (true);

-- Захиалга нь кино эсвэл сарын эрх аль нь ч байж болно
alter table public.md_purchases add column if not exists kind text not null default 'movie';
alter table public.md_purchases add column if not exists plan_code text;
alter table public.md_purchases add column if not exists plan_days integer;
alter table public.md_purchases alter column series_id drop not null;

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

-- ============================================================
-- Борлуулалтын юүлүүрийн хэмжилт
-- «Хэдэн хүн орсон» биш, «хаана унтарч байна» гэдгийг мэдэхийн тулд.
-- Хувийн мэдээлэл хадгалдаггүй — зөвхөн санамсаргүй session дугаар.
-- ============================================================
create table if not exists public.md_events (
  id bigint generated always as identity primary key,
  sid text not null,
  event text not null,
  series_id text,
  ep integer,
  created_at timestamptz not null default now()
);
create index if not exists md_events_time on public.md_events (created_at desc);
alter table public.md_events enable row level security;

drop policy if exists md_events_insert on public.md_events;
create policy md_events_insert on public.md_events
  for insert to anon, authenticated
  with check (
    event in ('open_series', 'watch_start', 'paywall_hit', 'buy_click', 'order_created', 'share', 'install')
    and length(sid) between 8 and 40
    and (series_id is null or length(series_id) <= 40)
  );

drop policy if exists md_events_select on public.md_events;
create policy md_events_select on public.md_events
  for select using (public.md_is_admin());

-- АДМИН: юүлүүрийн хураангуй (сүүлийн N хоног)
create or replace function public.md_funnel(p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.md_is_admin() then
    raise exception 'not_admin';
  end if;
  select jsonb_object_agg(event, c) into v
  from (
    select event, count(distinct sid) as c
      from md_events
     where created_at > now() - (p_days || ' days')::interval
     group by event
  ) t;
  return coalesce(v, '{}'::jsonb);
end;
$$;

grant execute on function public.md_funnel(integer) to authenticated;

-- ============================================================
-- НЭВТРЭХ ЛИНК — бүртгүүлж чаддаггүй хэрэглэгчдэд зориулав.
-- Эзэн линк үүсгэж чатаар илгээнэ; хэрэглэгч дарахад бүртгэлгүйгээр
-- кино нээгдэнэ. Линк нь тодорхой тооны төхөөрөмжид л ажиллана тул
-- олноор тарааж болохгүй.
-- ============================================================
alter table public.md_profiles alter column phone drop not null;

create table if not exists public.md_access_links (
  token text primary key,
  series_id text,               -- нэг кино (эсвэл null бол сарын эрх)
  plan_days integer,            -- сарын эрх олгох бол хоногийн тоо
  max_claims integer not null default 1,
  claims integer not null default 0,
  note text not null default '',
  revoked boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.md_access_links enable row level security;
drop policy if exists md_links_select on public.md_access_links;
create policy md_links_select on public.md_access_links
  for select using (public.md_is_admin());

-- Линкийг ашиглах: нэвтэрсэн (нэргүй ч болно) хэрэглэгчид эрх олгоно
create or replace function public.md_claim_access(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link md_access_links%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  select * into v_link from md_access_links where token = p_token for update;
  if v_link.token is null then raise exception 'bad_link'; end if;
  if v_link.revoked then raise exception 'revoked'; end if;
  if v_link.expires_at is not null and v_link.expires_at < now() then
    raise exception 'expired';
  end if;

  -- Профайл байхгүй бол үүсгэнэ (утасны дугааргүй байж болно)
  insert into md_profiles (id) values (auth.uid()) on conflict (id) do nothing;

  -- Аль хэдийн энэ эрхтэй бол дахин тоолохгүй (нэг хүн дахин нээхэд)
  if v_link.series_id is not null
     and exists (select 1 from md_purchases
                 where user_id = auth.uid() and series_id = v_link.series_id
                   and status = 'confirmed') then
    return jsonb_build_object('ok', true, 'series_id', v_link.series_id, 'repeat', true);
  end if;

  if v_link.claims >= v_link.max_claims then
    raise exception 'used_up';
  end if;

  if v_link.series_id is not null then
    insert into md_purchases (user_id, series_id, price, amount, status, decided_at)
    values (auth.uid(), v_link.series_id, 0, 0, 'confirmed', now())
    on conflict do nothing;
  end if;

  if v_link.plan_days is not null then
    update md_profiles
       set vip_until = greatest(coalesce(vip_until, now()), now())
                       + (v_link.plan_days || ' days')::interval
     where id = auth.uid();
  end if;

  update md_access_links set claims = claims + 1 where token = p_token;

  return jsonb_build_object('ok', true, 'series_id', v_link.series_id,
                            'plan_days', v_link.plan_days);
end;
$$;

grant execute on function public.md_claim_access(text) to authenticated, anon;

-- АДМИН: линк үүсгэх
create or replace function public.md_create_links(
  p_series text,
  p_count integer default 1,
  p_max_claims integer default 1,
  p_note text default ''
)
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  i integer;
  v_token text;
begin
  if not public.md_is_admin() then
    raise exception 'not_admin';
  end if;
  if p_count < 1 or p_count > 50 then
    raise exception 'bad_count';
  end if;
  for i in 1..p_count loop
    -- pgcrypto өөр схемд байдаг тул суурь функцээр богино санамсаргүй токен үүсгэнэ
    v_token := substr(md5(random()::text || clock_timestamp()::text || i::text), 1, 10);
    insert into md_access_links (token, series_id, max_claims, note)
    values (v_token, p_series, greatest(1, p_max_claims), p_note);
    return next v_token;
  end loop;
end;
$$;

grant execute on function public.md_create_links(text, integer, integer, text) to authenticated;

-- АДМИН: линкийг хүчингүй болгох
create or replace function public.md_revoke_link(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.md_is_admin() then
    raise exception 'not_admin';
  end if;
  update md_access_links set revoked = true where token = p_token;
end;
$$;

grant execute on function public.md_revoke_link(text) to authenticated;

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

-- Сарын эрх захиалах (кино захиалахтай ижил өвөрмөц дүнгийн логик)
create or replace function public.md_request_subscription(p_plan text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price integer;
  v_days integer;
  v_id bigint;
  v_max_off integer;
  v_amount integer := null;
  v_off integer;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  select price, days into v_price, v_days
    from md_plans where code = p_plan and active;
  if v_price is null then
    raise exception 'unknown_plan';
  end if;

  if exists (select 1 from md_purchases
             where user_id = auth.uid() and kind = 'sub' and status = 'pending') then
    raise exception 'already_pending';
  end if;

  v_max_off := least(99, greatest(1, floor(v_price * 0.03)::integer));
  for v_off in select g from generate_series(1, v_max_off) g order by random() loop
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

  insert into md_purchases (user_id, series_id, price, amount, kind, plan_code, plan_days)
  values (auth.uid(), null, v_price, v_amount, 'sub', p_plan, v_days)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.md_request_subscription(text) to authenticated;

-- АДМИН: сарын эрхийг гараар нэмж өгөх
create or replace function public.md_admin_grant_vip(p_phone text, p_days integer)
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
  update md_profiles
     set vip_until = greatest(coalesce(vip_until, now()), now()) + (p_days || ' days')::interval
   where id = v_user;
end;
$$;

grant execute on function public.md_admin_grant_vip(text, integer) to authenticated;

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

  -- Сарын эрх бол хугацааг нь сунгана (идэвхтэй байвал үргэлжлүүлж нэмнэ)
  update md_profiles p
     set vip_until = greatest(coalesce(p.vip_until, now()), now())
                     + (b.plan_days || ' days')::interval
    from md_purchases b
   where b.id = v_id and b.kind = 'sub' and b.plan_days is not null and p.id = b.user_id;

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

-- ============================================================
-- Постерын зураг (2026-08-05) — эзэн админ хуудаснаас сольдог
-- ============================================================
-- Постер нь өмнө нь сайттай хамт (public/posters/) гардаг байсан тул солихын
-- тулд компьютер дээрээс дахин «Сайт шинэчлэх» ажиллуулах шаардлагатай байв.
-- Одоо зураг R2 санд ордог ба хаяг нь энд хадгалагдана — утаснаасаа шууд солино.
alter table public.md_series add column if not exists poster_url text;

create or replace function public.md_set_poster(p_id text, p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.md_is_admin() then
    raise exception 'not_admin';
  end if;
  if p_url is not null and p_url !~ '^/p/[A-Za-z0-9._-]+$' then
    raise exception 'bad_url';
  end if;
  update md_series set poster_url = p_url where id = p_id;
  if not found then
    raise exception 'unknown_series';
  end if;
end;
$$;

revoke all on function public.md_set_poster(text, text) from public, anon;
grant execute on function public.md_set_poster(text, text) to authenticated;

-- ============================================================
-- ЗАСВАР 2026-08-09: гараар баталгаажуулахад САРЫН ЭРХ олгогддоггүй байсан
-- ============================================================
-- Эрх олгох код зөвхөн банкны мессежээр автомат баталгаажуулах замд байсан.
-- Эзэн админ хуудаснаас гараар «Баталгаажуулах» дарахад төлбөр нь бүртгэгдэх ч
-- vip_until талбар хоосон хэвээр үлдэж, төлсөн хүн юу ч үзэж чаддаггүй байв
-- (7 захиалга, 67,889₮ ийнхүү хүчингүй болсон).
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

  -- Сарын эрх бол хугацааг нь сунгана (автомат замтай яг ижил логик).
  -- Идэвхтэй эрх байвал үргэлжлүүлж нэмнэ, дууссан бол өнөөдрөөс эхэлнэ.
  update md_profiles p
     set vip_until = greatest(coalesce(p.vip_until, now()), now())
                     + (b.plan_days || ' days')::interval
    from md_purchases b
   where b.id = p_id and b.kind = 'sub' and b.plan_days is not null and p.id = b.user_id;
end;
$$;

-- ============================================================
-- ЗАСВАР 2026-08-09: хүчингүй болгосон линкийг сэргээх / төхөөрөмж нэмэх
-- ============================================================
-- Админ дээр «Хуулах» ба «Хаах» товч яг ижил харагддаг байсан тул эзэн санамсаргүй
-- дарж 9 линкийн 6-г нь үхүүлсэн бөгөөд буцаах арга байгаагүй. Одоо буцаана.
create or replace function public.md_restore_link(p_token text, p_add_claims integer default 0)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.md_is_admin() then
    raise exception 'not_admin';
  end if;
  if p_add_claims < 0 or p_add_claims > 50 then
    raise exception 'bad_claims';
  end if;
  update md_access_links
     set revoked = false,
         max_claims = max_claims + p_add_claims
   where token = p_token;
  if not found then
    raise exception 'bad_link';
  end if;
end;
$$;

revoke all on function public.md_restore_link(text, integer) from public, anon;
grant execute on function public.md_restore_link(text, integer) to authenticated;

-- ============================================================
-- Автомат баталгаажуулалтын эрүүл мэндийн самбар (2026-08-09)
-- ============================================================
-- Банкны мессеж дамжуулагч ажиллаж байгаа эсэхийг ХАРАХ арга байгаагүй тул
-- ер ажиллаагүй хэвээр 8 хоног өнгөрч, захиалга бүр гараар баталгаажиж,
-- худалдан авагчид дунджаар 3.5 цаг хүлээсэн. Одоо админ хуудсанд харагдана.
create or replace function public.md_bank_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.md_is_admin() then
    raise exception 'not_admin';
  end if;
  select jsonb_build_object(
    'secret', (select bank_secret from md_config where id = 1),
    'total', (select count(*) from md_bank_msgs),
    'matched', (select count(*) from md_bank_msgs where matched),
    'last_at', (select max(created_at) from md_bank_msgs),
    'recent', coalesce((
      select jsonb_agg(x) from (
        select amount, matched, purchase_id, created_at
          from md_bank_msgs order by id desc limit 5
      ) x), '[]'::jsonb),
    'avg_minutes', (
      select round(avg(extract(epoch from (decided_at - created_at)) / 60))
        from md_purchases
       where status = 'confirmed' and amount > 0
         and created_at > now() - interval '30 days'),
    'pending', (select count(*) from md_purchases where status = 'pending')
  ) into v;
  return v;
end;
$$;

revoke all on function public.md_bank_status() from public, anon;
grant execute on function public.md_bank_status() to authenticated;

-- ============================================================
-- Линк устгах (2026-09-17) — дууссан линкүүд жагсаалтыг дүүргэдэг байсан
-- ============================================================
-- Зөвхөн линкийн мөрийг устгана. Тэр линкээр аль хэдийн олгогдсон эрх
-- (md_purchases) хөндөгдөхгүй — үзэж байгаа хүн үргэлжлүүлэн үзнэ.
create or replace function public.md_delete_link(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.md_is_admin() then
    raise exception 'not_admin';
  end if;
  delete from md_access_links where token = p_token;
  if not found then
    raise exception 'bad_link';
  end if;
end;
$$;

revoke all on function public.md_delete_link(text) from public, anon;
grant execute on function public.md_delete_link(text) to authenticated;

-- ============================================================
-- Нэг бүтэн кино (HLS) — 2026-09-17
-- ============================================================
-- hls = true бол кино ангиудаар биш, нэг тасралтгүй бичлэгээр (HLS хэсгүүд) дамжина.
-- Тэр үед ep_durations = ХЭСГҮҮДИЙН урт, free_eps = үнэгүй ХЭСГИЙН тоо болно —
-- тооцоолол нь яг ижил (md_free_eps_from) тул админ «үнэгүй минут»-ыг өөрчлөхөд
-- танилцуулгын хил автоматаар шилжинэ.
alter table public.md_series add column if not exists hls boolean not null default false;

-- ============================================================
-- Линкийг НЭХЭМЖЛЭХГҮЙГЭЭР урьдчилан харах (2026-09-22)
-- ============================================================
-- Messenger-ээр линк явуулмагц Facebook-ийн аюулгүй байдлын робот (66.220.x,
-- 31.13.x, 173.252.x — Chrome 74) хуудсыг JS-тэй нь нээдэг. Хуудас нээгдмэгц
-- эрх нэхэмжилдэг байсан тул робот бүр нэг «төхөөрөмж» зарцуулж, 14 хоногт 15
-- нэхэмжлэлийн 10 нь робот байв. Одоо хуудас зөвхөн энэ функцийг дуудаж киног
-- харуулна; эрх нь хүн «Үзэх» товч дарахад л олгогдоно.
create or replace function public.md_link_preview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v md_access_links%rowtype;
begin
  select * into v from md_access_links where token = p_token;
  if v.token is null then return jsonb_build_object('ok', false, 'reason', 'bad_link'); end if;
  if v.revoked then return jsonb_build_object('ok', false, 'reason', 'revoked'); end if;
  if v.expires_at is not null and v.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  return jsonb_build_object(
    'ok', true,
    'series_id', v.series_id,
    'plan_days', v.plan_days,
    'full', v.claims >= v.max_claims
  );
end;
$$;

grant execute on function public.md_link_preview(text) to anon, authenticated;

-- ============================================================
-- ОНЛАЙН ТӨЛБӨР — Byl (QPay) 2026-09-24
-- ============================================================
-- Хэрэглэгч «QPay-ээр төлөх» дарахад /api/pay/byl нь Byl дээр төлбөрийн хуудас
-- (checkout) үүсгээд тэр рүү шилжүүлнэ. Төлбөр ормогц Byl гарын үсэгтэй мэдэгдлийг
-- /api/pay/byl-webhook руу илгээж, md_confirm_by_byl захиалгыг ДУГААРААР нь
-- (өвөрмөц дүнгээр биш) олж баталгаажуулна. Мөнгө Byl-ээр дамжихгүй — QPay шууд
-- эзний данс руу хийнэ.

-- Горим: off = хэнд ч харагдахгүй, admin = зөвхөн админд (туршилт), on = бүгдэд
alter table public.md_settings add column if not exists online_pay text not null default 'off';
do $$ begin
  alter table public.md_settings add constraint md_settings_online_pay_chk
    check (online_pay in ('off', 'admin', 'on'));
exception when duplicate_object then null; end $$;

alter table public.md_purchases add column if not exists pay_checkout_id bigint;
alter table public.md_purchases add column if not exists pay_url text;
-- Юугаар баталгаажсан: bank (SMS), admin (гараар), byl (QPay)
alter table public.md_purchases add column if not exists paid_via text;

-- Byl-ээс ирсэн мэдэгдэл бүр (таарсан ч, таараагүй ч). event_id давхцвал
-- дахин боловсруулахгүй — Byl нэг мэдэгдлийг хэд хэдэн удаа илгээж болдог.
create table if not exists public.md_pay_events (
  id bigint generated always as identity primary key,
  provider text not null default 'byl',
  event_id text not null,
  type text not null,
  purchase_id bigint references public.md_purchases (id) on delete set null,
  amount numeric,
  matched boolean not null default false,
  note text,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);
alter table public.md_pay_events enable row level security;
drop policy if exists md_pay_events_select on public.md_pay_events;
create policy md_pay_events_select on public.md_pay_events
  for select using (public.md_is_admin());

-- Серверийн нууц түлхүүр (md_config.bank_secret) таарч байна уу
create or replace function public.md__secret_ok(p_secret text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select bank_secret = p_secret and length(bank_secret) > 10
                     from md_config where id = 1), false);
$$;
revoke all on function public.md__secret_ok(text) from public, anon, authenticated;

-- ЭРХ ОЛГОХ ГАНЦ ГАЗАР. Банкны SMS, админы товч, QPay — гурвуулаа үүгээр дамжина.
-- 2026-08-09-нд VIP сунгах код зөвхөн нэг замд байсан тул гараар баталгаажуулсан
-- 7 захиалга юу ч олгоогүй. Одоо зам бүр нэг л функц дууддаг.
-- Буцаах утга: granted | already_confirmed | already_owned | not_found
create or replace function public.md__grant_purchase(p_id bigint, p_via text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p md_purchases%rowtype;
begin
  select * into v_p from md_purchases where id = p_id for update;
  if v_p.id is null then return 'not_found'; end if;
  if v_p.status = 'confirmed' then return 'already_confirmed'; end if;

  -- Нэг хүн нэг киног хоёр удаа эзэмшихгүй (md_purchases_one_confirmed индекс).
  -- Өөр замаар (линк, гараар) аль хэдийн нээгдсэн бол энэ мөрийг хөндөхгүй —
  -- дуудагч нь бүртгэж, эзэн мөнгийг буцаана.
  if coalesce(v_p.kind, 'movie') = 'movie' and exists (
       select 1 from md_purchases
        where user_id = v_p.user_id and series_id = v_p.series_id
          and status = 'confirmed' and id <> p_id) then
    return 'already_owned';
  end if;

  update md_purchases
     set status = 'confirmed', decided_at = now(), paid_via = p_via
   where id = p_id;

  -- Сарын эрх: идэвхтэй бол үргэлжлүүлж нэмнэ, дууссан бол өнөөдрөөс эхэлнэ
  if v_p.kind = 'sub' and v_p.plan_days is not null then
    update md_profiles
       set vip_until = greatest(coalesce(vip_until, now()), now())
                       + (v_p.plan_days || ' days')::interval
     where id = v_p.user_id;
  end if;
  return 'granted';
end;
$$;
revoke all on function public.md__grant_purchase(bigint, text) from public, anon, authenticated;

-- АДМИН: гараар баталгаажуулах — одоо ганц эрх олгогчоор дамжина
create or replace function public.md_confirm_purchase(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res text;
begin
  if not public.md_is_admin() then
    raise exception 'not_admin';
  end if;
  if not exists (select 1 from md_purchases where id = p_id and status = 'pending') then
    raise exception 'not_pending';
  end if;
  v_res := public.md__grant_purchase(p_id, 'admin');
  if v_res <> 'granted' then
    raise exception '%', v_res;
  end if;
end;
$$;

-- БАНКНЫ SMS: тааруулах логик хэвээр, эрх олгох нь ганц функцээр
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
  v_id bigint;
  v_series text;
  v_phone text;
  v_how text;
  v_res text;
begin
  if not public.md__secret_ok(p_secret) then
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

  v_res := public.md__grant_purchase(v_id, 'bank');
  if v_res <> 'granted' then
    insert into md_bank_msgs (raw, amount, purchase_id, matched)
    values (p_raw, p_amount, v_id, false);
    return jsonb_build_object('matched', false, 'reason', v_res, 'purchase_id', v_id);
  end if;

  insert into md_bank_msgs (raw, amount, purchase_id, matched)
  values (p_raw, p_amount, v_id, true);

  return jsonb_build_object(
    'matched', true, 'how', v_how,
    'purchase_id', v_id, 'series_id', v_series, 'phone', v_phone
  );
end;
$$;

-- /api/pay/byl үүсгэсэн төлбөрийн хуудсыг захиалгад холбоно. Аль хэдийн хуудастай
-- бол ХУУЧИН хуудас нь үлдэнэ (давхар дарахад хоёр хуудас үүсгэхгүйн тулд).
create or replace function public.md_attach_checkout(
  p_secret text, p_purchase bigint, p_checkout bigint, p_url text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.md__secret_ok(p_secret) then
    raise exception 'bad_secret';
  end if;
  update md_purchases
     set pay_checkout_id = p_checkout, pay_url = p_url
   where id = p_purchase and pay_url is null;
  return (select pay_url from md_purchases where id = p_purchase);
end;
$$;
grant execute on function public.md_attach_checkout(text, bigint, bigint, text) to anon, authenticated;

-- Byl-ийн «төлбөр орлоо» мэдэгдэл. Захиалгыг client_reference_id-аар (md-<id>)
-- олно — тэр нь манай сервер үүсгэсэн, Byl гарын үсэг зурсан тул хуурамчаар
-- өөрчлөх боломжгүй. Татгалзсан (rejected) захиалгыг ч нээнэ: мөнгө нь орсон.
create or replace function public.md_confirm_by_byl(
  p_secret text,
  p_event_id text,
  p_type text,
  p_purchase bigint,
  p_checkout bigint,
  p_amount numeric,
  p_raw jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev bigint;
  v_p md_purchases%rowtype;
  v_res text;
begin
  if not public.md__secret_ok(p_secret) then
    raise exception 'bad_secret';
  end if;

  select * into v_p from md_purchases where id = p_purchase;

  insert into md_pay_events (provider, event_id, type, purchase_id, amount, raw)
  values ('byl', p_event_id, p_type, v_p.id, p_amount, p_raw)
  on conflict (provider, event_id) do nothing
  returning id into v_ev;
  if v_ev is null then
    return jsonb_build_object('duplicate', true);
  end if;

  if v_p.id is null then
    v_res := 'unknown_purchase';
  elsif p_amount is null or p_amount < v_p.amount then
    v_res := 'underpaid';
  else
    v_res := public.md__grant_purchase(v_p.id, 'byl');
  end if;

  update md_pay_events set matched = (v_res = 'granted'), note = v_res where id = v_ev;
  if v_res = 'granted' and p_checkout is not null then
    update md_purchases set pay_checkout_id = coalesce(pay_checkout_id, p_checkout)
     where id = v_p.id;
  end if;

  return jsonb_build_object(
    'matched', v_res = 'granted', 'result', v_res,
    'purchase_id', v_p.id, 'kind', v_p.kind, 'series_id', v_p.series_id
  );
end;
$$;
grant execute on function public.md_confirm_by_byl(text, text, text, bigint, bigint, numeric, jsonb)
  to anon, authenticated;

-- АДМИН: онлайн төлбөрийн горим (off | admin | on)
create or replace function public.md_set_online_pay(p_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.md_is_admin() then
    raise exception 'not_admin';
  end if;
  if p_mode not in ('off', 'admin', 'on') then
    raise exception 'bad_mode';
  end if;
  update md_settings set online_pay = p_mode where id = 1;
end;
$$;
grant execute on function public.md_set_online_pay(text) to authenticated;
