import { Lock, Zap } from "lucide-react";
import { formatPrice, type Series } from "../data/catalog";
import { track } from "../lib/track";
import { openPurchase, openVip } from "../lib/ui";
import { cheapestPlan, usePlans } from "../lib/plans";

/** Үнэгүй хэсэг дуусахад гарах түгжээ (2026-10-22 эзний загвар): нэг удаа / сарын эрх */
// «Төлбөр хүлээгдэж байна» гэж түгжихгүй (2026-10-22 эзэн: «нэг кино сонгоод төлөхгүй буцангуут
// хүлээгдэж байна гарч байна — бодлоо өөрчлөөд сарын эрх авъя гэвэл яах юм»): хоёр сонголт үргэлж
export function PayWall({ series }: { series: Series }) {
  const plan = cheapestPlan(usePlans(), series.category);
  return (
    <div className="wall">
      <div className="wall-lock">
        <Lock size={26} />
      </div>
      <h3>Эрхээ идэвхжүүлнэ үү</h3>
      <p>
        Сарын эрх худалдаж авах эсвэл зөвхөн энэ киног нэг удаа тусад нь төлж (3 хоног) үзэх
        боломжтой.
      </p>
      <div className="wall-btns">
        <button
          className="wall-one"
          onClick={() => {
            track("buy_click", series.id);
            openPurchase(series.id, true);
          }}
        >
          <Zap size={17} /> Нэг удаа ({formatPrice(series.price)})
        </button>
        <button
          className="wall-sub"
          onClick={() => {
            track("buy_click", series.id);
            openVip(series.category);
          }}
        >
          Сарын эрх{plan ? ` (${formatPrice(plan.price)})` : " авах"}
        </button>
      </div>
    </div>
  );
}
