-- ============================================================
-- 2026-10-21 (эзэн): НЭГ КИНОНЫ эрх 3 хоног («7 хоног» → «3 хоног болгы»).
-- Худалдан авалт баталгаажих мөчөөс 3 хоног. Үүнээс өмнө авсан кинонууд
-- (expires_at хоосон) хязгааргүй хэвээр — тэд «хязгааргүй» гэж төлсөн.
-- Хугацаа дууссан мөр «expired» болж, тэр киног дахин худалдаж авч болно.
-- ============================================================
alter table public.md_purchases add column if not exists expires_at timestamptz;
alter table public.md_purchases drop constraint if exists md_purchases_status_check;
alter table public.md_purchases add constraint md_purchases_status_check
  check (status in ('pending', 'confirmed', 'rejected', 'expired'));

create or replace function public.md_purchases_movie_expiry()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'confirmed' and coalesce(new.kind, 'movie') = 'movie' and new.expires_at is null
     and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    new.expires_at := coalesce(new.decided_at, now()) + interval '3 days';
  end if;
  return new;
end;
$$;
drop trigger if exists md_purchases_movie_expiry on public.md_purchases;
create trigger md_purchases_movie_expiry before insert or update on public.md_purchases
  for each row execute function public.md_purchases_movie_expiry();

create or replace function public.md__expire_movies(p_user uuid, p_series text)
returns void
language sql
security definer
set search_path = public
as $$
  update md_purchases set status = 'expired'
   where user_id = p_user and series_id = p_series and status = 'confirmed'
     and coalesce(kind, 'movie') = 'movie' and expires_at is not null and expires_at < now();
$$;
revoke all on function public.md__expire_movies(uuid, text) from public, anon, authenticated;

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

  perform public.md__expire_movies(auth.uid(), p_series); -- 3 хоног өнгөрсөн бол дахин авна
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
  -- 3 хоног өнгөрсөн нэг киноны эрх дахин авахад саад болохгүй (2026-10-21)
  if coalesce(v_p.kind, 'movie') = 'movie' then
    perform public.md__expire_movies(v_p.user_id, v_p.series_id);
    if v_target is not null then perform public.md__expire_movies(v_target, v_p.series_id); end if;
  end if;
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

CREATE OR REPLACE FUNCTION public.md_claim_access(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- 3 хоног өнгөрсөн эрх «эзэмшиж байна» гэж тооцогдохгүй (2026-10-21)
  if v_link.series_id is not null then perform public.md__expire_movies(auth.uid(), v_link.series_id); end if;
  -- Аль хэдийн энэ эрхтэй бол дахин тоолохгүй (нэг хүн дахин нээхэд)
  if v_link.series_id is not null
     and exists (select 1 from md_purchases
                 where user_id = auth.uid() and series_id = v_link.series_id
                   and status = 'confirmed') then
    return jsonb_build_object('ok', true, 'series_id', v_link.series_id, 'repeat', true);
  end if;

  if v_link.purchase_id is not null
     and not exists (select 1 from md_purchases
                      where id = v_link.purchase_id and status = 'confirmed') then
    raise exception 'not_paid_yet';
  end if;

  if v_link.claims >= v_link.max_claims then
    raise exception 'used_up';
  end if;

  if v_link.series_id is not null then
    insert into md_purchases (user_id, series_id, price, amount, status, decided_at, paid_via)
    values (auth.uid(), v_link.series_id, 0, 0, 'confirmed', now(),
            case when v_link.purchase_id is not null then 'link:' || v_link.purchase_id
                 -- 7 хоногийн линк (Messenger бот, шинэ админы линк): эрх нь 7 хоног (md__bot_prune)
                 when v_link.expires_at is not null
                   then left('bot7:' || coalesce(nullif(v_link.note, ''), 'admin'), 60)
                 else null end)
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
$function$;

notify pgrst, 'reload schema';
