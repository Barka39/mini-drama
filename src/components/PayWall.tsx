import { Clock, Lock, Zap } from "lucide-react";
import { formatPrice, type Series } from "../data/catalog";
import { track } from "../lib/track";
import { openPurchase, openVip } from "../lib/ui";

/** Үнэгүй хэсэг дуусахад гарах түгжээ (2026-10-22 эзний загвар): нэг удаа / сарын эрх */
export function PayWall({ series, pending }: { series: Series; pending: boolean }) {
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
      {pending ? (
        <div className="wall-btns">
          <button className="wall-one" onClick={() => openPurchase(series.id)}>
            <Clock size={17} /> Төлбөр хүлээгдэж байна
          </button>
        </div>
      ) : (
        <div className="wall-btns">
          <button
            className="wall-one"
            onClick={() => {
              track("buy_click", series.id);
              openPurchase(series.id);
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
            Сарын эрх авах
          </button>
        </div>
      )}
    </div>
  );
}
