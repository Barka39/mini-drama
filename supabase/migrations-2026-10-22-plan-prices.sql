-- 2026-10-22 эзэн: 3/6 сарын үнэ — ангилал 25,500 / 45,500; бүх кино 30,900 / 56,900 (сарынх хэвээр 11,900 / 15,900)
update public.md_plans set price = 25500 where code in ('ai3', 'er3');
update public.md_plans set price = 45500 where code in ('ai6', 'er6');
update public.md_plans set price = 30900 where code = 'all3';
update public.md_plans set price = 56900 where code = 'all6';
select code, price from public.md_plans where active order by sort_order;
