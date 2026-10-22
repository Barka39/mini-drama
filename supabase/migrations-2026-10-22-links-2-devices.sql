-- 2026-10-22 эзэн: «бүгд ижил — 2 төхөөрөмж, 7 хоногийн дотор нээх, нээснээс хойш 3 хоног»

-- (live pg_get_functiondef-ээс эхэлсэн; өөрчлөлт нь зөвхөн тоо)

CREATE OR REPLACE FUNCTION public.md_bot_movie_link(p_secret text, p_series text, p_note text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_token text;
  v_series text := p_series;
  v_next text;
begin
  if not public.md__secret_ok(p_secret) then
    raise exception 'bad_secret';
  end if;
  -- хугацаа нь дууссан 7 хоногийн линк, эрхийг цэвэрлэнэ (md__bot_prune)
  perform public.md__bot_prune();
  for hop in 1..5 loop
    select replaced_by into v_next from md_series where id = v_series and deleted_at is not null;
    exit when v_next is null;
    v_series := v_next;
  end loop;
  if p_note is null or length(p_note) < 4
     or not exists (select 1 from md_series where id = v_series and deleted_at is null and not hidden) then
    return null;
  end if;
  select token into v_token from md_access_links where note = p_note and not revoked limit 1;
  if v_token is not null then
    return v_token;
  end if;
  v_token := replace(gen_random_uuid()::text, '-', '');
  insert into md_access_links (token, series_id, max_claims, note, expires_at)
  values (v_token, v_series, 2, p_note, now() + interval '7 days');
  return v_token;
end;
$function$;


CREATE OR REPLACE FUNCTION public.md_create_pay_link(p_secret text, p_purchase bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_p md_purchases%rowtype;
  v_token text;
begin
  if not public.md__secret_ok(p_secret) then
    raise exception 'bad_secret';
  end if;
  select * into v_p from md_purchases where id = p_purchase;
  if v_p.id is null or coalesce(v_p.kind, 'movie') <> 'movie' then
    return null;
  end if;
  -- Байгаа линкийг дахин ашиглахдаа хугацааг нь сунгана (хуучин захиалгаа
  -- удаан хугацааны дараа төлсөн ч буцах хуудас «хугацаа дууссан» болохгүй)
  update md_access_links set expires_at = now() + interval '7 days'
   where purchase_id = p_purchase and not revoked
  returning token into v_token;
  if v_token is not null then return v_token; end if;
  v_token := replace(gen_random_uuid()::text, '-', '');
  insert into md_access_links (token, series_id, max_claims, note, expires_at, purchase_id)
  values (v_token, v_p.series_id, 2, 'QPay', now() + interval '7 days', p_purchase);
  return v_token;
end;
$function$;


CREATE OR REPLACE FUNCTION public.md_create_links(p_series text, p_count integer DEFAULT 1, p_max_claims integer DEFAULT 2, p_note text DEFAULT ''::text)
 RETURNS SETOF text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    insert into md_access_links (token, series_id, max_claims, note, expires_at)
    values (v_token, p_series, greatest(1, p_max_claims), p_note, now() + interval '7 days');
    return next v_token;
  end loop;
end;
$function$;


update md_access_links set max_claims = 2
 where max_claims = 1 and not revoked and (expires_at is null or expires_at > now())
   and (note like 'bot:%' or note like 'transfer:%' or note like 'receipt:%');

update md_access_links set expires_at = created_at + interval '7 days'
 where note = 'QPay' and expires_at > created_at + interval '7 days';
