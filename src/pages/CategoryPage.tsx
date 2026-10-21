// Нэг ангиллын бүх кино (эзэн 2026-10-21): нүүрэнд ангилал бүр 10 кинотой хэвтээ эгнээ,
// «Бүгдийг үзэх» дарахад энд — шинэ нь эхэнд, тухайн ангиллын сарын эрхийн товчтой.
import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Crown } from "lucide-react";
import { CATEGORY_LABEL, formatPrice, type Category } from "../data/catalog";
import { useCatalog } from "../lib/seriesAdmin";
import { hasVip, useAppState } from "../lib/store";
import { openVip } from "../lib/ui";
import { cheapestPlan, usePlans } from "../lib/plans";
import { PosterCard } from "./Home";

export function CategoryPage() {
  const { category } = useParams();
  const s = useAppState();
  const catalog = useCatalog();
  const plans = usePlans();
  const cat = category === "ai" || category === "erotic" ? (category as Category) : null;
  const items = useMemo(
    () => (cat ? catalog.filter((x) => x.category === cat).sort((a, b) => b.id.localeCompare(a.id)) : []),
    [catalog, cat],
  );
  if (!cat) return <Navigate to="/" replace />;
  const plan = cheapestPlan(plans, cat);
  const open = hasVip(s, cat);

  return (
    <div className="page hm-catpage">
      <header className="topbar">
        <Link to="/" className="back" aria-label="Буцах">
          <ArrowLeft size={20} />
        </Link>
        <div className="brand">
          {CATEGORY_LABEL[cat]}
        </div>
      </header>

      {open ? (
        <p className="hm-meta hm-meta-open hm-catpage-note">
          <Check size={12} strokeWidth={3} /> Сарын эрх тань идэвхтэй — бүгд нээлттэй
        </p>
      ) : (
        <button className="km-vip" onClick={() => openVip(cat)}>
          <Crown size={22} className="km-vip-icon" />
          <span className="km-vip-text">
            <strong>{CATEGORY_LABEL[cat]} — бүх кино нэг эрхээр</strong>
            <span>{plan ? `Сард ${formatPrice(plan.price)} · 3, 6 сарын багц хямд` : "Сарын эрх"}</span>
          </span>
          <span className="km-vip-cta">Эрх авах</span>
        </button>
      )}

      <div className="hm-grid hm-catpage-grid">
        {items.map((x) => (
          <PosterCard key={x.id} series={x} s={s} />
        ))}
      </div>
    </div>
  );
}
