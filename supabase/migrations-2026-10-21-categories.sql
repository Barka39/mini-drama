-- ============================================================
-- 2026-10-21 (эзэн): сайтыг 2 ангилалд хуваана — «AI кино», «Эротик кино».
-- Сарын эрх ангилал тус бүрд (11,900₮/сар) эсвэл бүх кинонд (15,900₮/сар),
-- 3 ба 6 сарын хямдралтай багцтай. Хуучин m1/m3 эрхтэй хүмүүс (vip_until)
-- «бүх кино» эрхтэйгээ хэвээр үлдэнэ.
-- ============================================================

-- 1) Кино бүр нэг ангилалтай. Шинэ кино: ангилал нь «18+» бол эротик, бусад нь AI
--    (add-series/deploy ангилал илгээдэггүй тул trigger тавина; админ сольж болно).
alter table public.md_series add column if not exists category text not null default 'ai';
alter table public.md_series drop constraint if exists md_series_category_chk;
alter table public.md_series add constraint md_series_category_chk check (category in ('ai', 'erotic'));
update public.md_series set category = 'erotic' where genre ilike '%18+%' and category <> 'erotic';

create or replace function public.md_series_default_category()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and new.genre ilike '%18+%' then
    new.category := 'erotic';
  end if;
  return new;
end;
$$;
drop trigger if exists md_series_default_category on public.md_series;
create trigger md_series_default_category before insert on public.md_series
  for each row execute function public.md_series_default_category();

-- 2) Ангиллын сарын эрх (vip_until = бүх кино, хуучнаараа)
alter table public.md_profiles add column if not exists vip_ai_until timestamptz;
alter table public.md_profiles add column if not exists vip_erotic_until timestamptz;

-- Шинэ профайл хэзээ ч эрхтэй «төрдөггүй» (клиент эдгээр баганыг бичих эрхгүй ч давхар хамгаалалт)
create or replace function public.md_owner_is_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.is_admin := coalesce(new.phone = '91300737', false);
  new.vip_until := null;
  new.vip_ai_until := null;
  new.vip_erotic_until := null;
  return new;
end;
$$;

-- 3) Багцууд: scope = ai | erotic | all
alter table public.md_plans add column if not exists scope text not null default 'all';
insert into public.md_plans (code, label, days, price, sort_order, scope, active) values
  ('ai1',  'AI кино · 1 сар',      30, 11900, 11, 'ai',     true),
  ('ai3',  'AI кино · 3 сар',      90, 29900, 12, 'ai',     true),
  ('ai6',  'AI кино · 6 сар',     180, 49900, 13, 'ai',     true),
  ('er1',  'Эротик кино · 1 сар',  30, 11900, 21, 'erotic', true),
  ('er3',  'Эротик кино · 3 сар',  90, 29900, 22, 'erotic', true),
  ('er6',  'Эротик кино · 6 сар', 180, 49900, 23, 'erotic', true),
  ('all1', 'Бүх кино · 1 сар',     30, 15900, 31, 'all',    true),
  ('all3', 'Бүх кино · 3 сар',     90, 39900, 32, 'all',    true),
  ('all6', 'Бүх кино · 6 сар',    180, 66900, 33, 'all',    true)
on conflict (code) do update
  set label = excluded.label, days = excluded.days, price = excluded.price,
      sort_order = excluded.sort_order, scope = excluded.scope, active = true;
-- Хуучин багцууд шинээр зарагдахгүй (өмнө нь авсан эрх vip_until-ээр хүчинтэй хэвээр)
update public.md_plans set active = false where code in ('m1', 'm3');

-- 4) Нэг газар: багцын scope-оор зөв баганыг сунгана (идэвхтэй бол үргэлжлүүлнэ)
create or replace function public.md__extend_vip(p_user uuid, p_plan text, p_days integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text;
  v_add interval := (p_days || ' days')::interval;
begin
  select scope into v_scope from md_plans where code = p_plan;
  v_scope := coalesce(v_scope, 'all');
  if v_scope = 'ai' then
    update md_profiles set vip_ai_until = greatest(coalesce(vip_ai_until, now()), now()) + v_add where id = p_user;
  elsif v_scope = 'erotic' then
    update md_profiles set vip_erotic_until = greatest(coalesce(vip_erotic_until, now()), now()) + v_add where id = p_user;
  else
    update md_profiles set vip_until = greatest(coalesce(vip_until, now()), now()) + v_add where id = p_user;
  end if;
end;
$$;
revoke all on function public.md__extend_vip(uuid, text, integer) from public, anon, authenticated;

-- 5) Бүх төлбөрийн зам (QPay, банк, админ) эндээр дамждаг — сарын эрхийг scope-оор олгоно
create or replace function public.md__grant_purchase(p_id bigint, p_via text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_p md_purchases%rowtype;
  v_target uuid;
begin
  select user_id into v_user from md_purchases where id = p_id;
  if v_user is null then return 'not_found'; end if;
  perform 1 from md_profiles where id = v_user for update;

  select * into v_p from md_purchases where id = p_id for update;
  if v_p.id is null then return 'not_found'; end if;
  if v_p.status = 'confirmed' then return 'already_confirmed'; end if;

  select merged_into into v_target from md_profiles where id = v_p.user_id;
  if v_target is not null and coalesce(v_p.kind, 'movie') = 'movie' then
    if exists (select 1 from md_purchases
                where user_id = v_target and series_id = v_p.series_id
                  and status = 'confirmed') then
      return 'already_owned';
    end if;
    update md_purchases set status = 'rejected', decided_at = now()
     where user_id = v_target and series_id = v_p.series_id and status = 'pending'
       and id <> p_id;
    update md_purchases set user_id = v_target where id = p_id;
    v_p.user_id := v_target;
  end if;

  if coalesce(v_p.kind, 'movie') = 'movie' and exists (
       select 1 from md_purchases
        where user_id = v_p.user_id and series_id = v_p.series_id
          and status = 'confirmed' and id <> p_id) then
    return 'already_owned';
  end if;

  update md_purchases
     set status = 'confirmed', decided_at = now(), paid_via = p_via
   where id = p_id;

  if v_p.kind = 'sub' and v_p.plan_days is not null then
    perform public.md__extend_vip(v_p.user_id, v_p.plan_code, v_p.plan_days);
  end if;
  return 'granted';
end;
$$;
revoke all on function public.md__grant_purchase(bigint, text) from public, anon, authenticated;

-- 6) Админ: киноны ангиллыг солих
create or replace function public.md_set_category(p_id text, p_category text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.md_is_admin() then raise exception 'not_admin'; end if;
  if p_category not in ('ai', 'erotic') then raise exception 'bad_category'; end if;
  update md_series set category = p_category where id = p_id;
end;
$$;
grant execute on function public.md_set_category(text, text) to authenticated;

-- 7) Өөр багц сонгоход хуучин ТӨЛӨГДӨӨГҮЙ сарын эрхийн захиалгыг цуцалж шинийг үүсгэнэ.
--    Өмнө нь «already_pending» гээд QPay хуучин захиалгыг (жишээ нь AI 3 сар) төлүүлдэг байсан —
--    одоо 9 багц тул «Эротик 1 сар» дарсан хүн буруу багц төлөх эрсдэлтэй байв.
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
  v_old record;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  if public.md__is_guest() then
    raise exception 'register_required';
  end if;

  select price, days into v_price, v_days
    from md_plans where code = p_plan and active;
  if v_price is null then
    raise exception 'unknown_plan';
  end if;

  select id, plan_code into v_old from md_purchases
   where user_id = auth.uid() and kind = 'sub' and status = 'pending'
   order by created_at desc limit 1;
  if v_old.id is not null then
    if v_old.plan_code = p_plan then
      return v_old.id; -- ижил багц: хуучин захиалга (QPay хуудас нь хэвээр)
    end if;
    update md_purchases set status = 'rejected', decided_at = now()
     where user_id = auth.uid() and kind = 'sub' and status = 'pending';
  end if;

  insert into md_purchases (user_id, series_id, price, amount, kind, plan_code, plan_days)
  values (auth.uid(), null, v_price, v_price, 'sub', p_plan, v_days)
  returning id into v_id;

  return v_id;
end;
$$;
grant execute on function public.md_request_subscription(text) to authenticated;

notify pgrst, 'reload schema';
