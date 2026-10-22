-- 2026-10-22 (эзэн): сайтын сарын эрхийг ДАНСААР шилжүүлээд баримтаа чатаар илгээсэн хүн
-- (сайт дээр захиалгагүй байж болно) — бот утасны дугаарыг нь асууж, энэ функцээр эрхийг нээнэ.
-- Нууц үгээр (md__secret_ok) хамгаалагдсан; нэг баримтад (p_note) нэг л удаа.
--   1) тэр дугаарын хүлээгдэж буй сарын эрхийн захиалга (дүн нь таарах) байвал — түүнийг батална
--   2) эс бөгөөс дүнгээр багцыг олно; AI/эротик хоёулаа таарвал киноных нь ангилал, мэдэхгүй бол эротик
-- Хариу: {"ok":true,"plan":"er1","until":"..."} эсвэл {"ok":false,"error":"phone_not_found"|"no_plan"|...}
create or replace function public.md_bot_grant_vip(
  p_secret text, p_phone text, p_amount integer, p_series text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 8);
  v_user uuid;
  v_id bigint;
  v_plan md_plans%rowtype;
  v_scope text;
  v_until timestamptz;
  v_via text := 'bottransfer:' || coalesce(p_note, '');
begin
  if not public.md__secret_ok(p_secret) then
    raise exception 'bad_secret';
  end if;
  if length(v_phone) <> 8 or p_amount is null or p_amount <= 0 or length(coalesce(p_note, '')) < 4 then
    return jsonb_build_object('ok', false, 'error', 'bad_input');
  end if;
  select id into v_user from md_profiles where phone = v_phone;
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'phone_not_found');
  end if;
  -- энэ баримтаар аль хэдийн нээсэн бол дахин нээхгүй
  select id, plan_code into v_id, v_plan.code from md_purchases where paid_via = v_via limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', false, 'error', 'already', 'plan', v_plan.code);
  end if;

  -- 1) тэр хүний хүлээгдэж буй сарын эрхийн захиалга, дүн нь таарвал
  select id into v_id from md_purchases
   where user_id = v_user and kind = 'sub' and status = 'pending'
     and abs(price - p_amount) <= price * 0.03
   order by created_at desc limit 1;

  if v_id is null then
    -- 2) дүнгээр багц
    select category into v_scope from md_series where id = p_series;
    select * into v_plan from md_plans
     where active and abs(price - p_amount) <= price * 0.03
     order by (scope = case when v_scope = 'ai' then 'ai' else 'erotic' end) desc, (scope = 'all') desc
     limit 1;
    if v_plan.code is null then
      return jsonb_build_object('ok', false, 'error', 'no_plan');
    end if;
    insert into md_purchases (user_id, series_id, price, amount, kind, plan_code, plan_days)
    values (v_user, null, v_plan.price, p_amount, 'sub', v_plan.code, v_plan.days)
    returning id into v_id;
  end if;

  perform public.md__grant_purchase(v_id, v_via);
  select p.plan_code, pl.scope into v_plan.code, v_scope
    from md_purchases p left join md_plans pl on pl.code = p.plan_code where p.id = v_id;
  select case when v_scope = 'ai' then vip_ai_until when v_scope = 'erotic' then vip_erotic_until else vip_until end
    into v_until from md_profiles where id = v_user;
  return jsonb_build_object('ok', true, 'plan', v_plan.code, 'scope', coalesce(v_scope, 'all'), 'until', v_until);
end;
$$;

revoke all on function public.md_bot_grant_vip(text, text, integer, text, text) from public;
grant execute on function public.md_bot_grant_vip(text, text, integer, text, text) to anon, authenticated;
