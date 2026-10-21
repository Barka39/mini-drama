-- Нэг кино захиалах: зочинд ч нээлттэй, дүн = зарласан үнэ (2026-10-22: 10-21-ний 3 хоногийн засвар
-- хуучин хувилбар дээр суурилж «өвөрмөц дүн» (3,752₮) болон зочны профайлыг алдсаныг засав)
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

  -- Зочинд профайл байхгүй (md_purchases.user_id → md_profiles). Утасгүй үүсгэнэ.
  insert into md_profiles (id) values (auth.uid()) on conflict (id) do nothing;

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

  insert into md_purchases (user_id, series_id, price, amount)
  values (auth.uid(), p_series, v_price, v_price)
  returning id into v_id;

  return v_id;
end;
$$;
