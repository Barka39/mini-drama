import { useEffect, useState } from "react";
import { formatPrice, getSeries } from "../data/catalog";
import { getSettings, type SiteSettings } from "../lib/settings";
import { buyStatus, refreshAccount, requestPurchase, useAppState } from "../lib/store";
import { closeModals, openAuth, useOpenModal, usePurchaseSeriesId } from "../lib/ui";

export function PurchaseModal() {
  const open = useOpenModal() === "purchase";
  const seriesId = usePurchaseSeriesId();
  const s = useAppState();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bank, setBank] = useState<SiteSettings | null>(null);

  useEffect(() => {
    if (open) void getSettings().then(setBank);
  }, [open]);

  const series = seriesId ? getSeries(seriesId) : undefined;
  if (!open || !series) return null;

  const status = buyStatus(s, series.id);

  async function order() {
    if (!series) return;
    setBusy(true);
    setMsg(null);
    const res = await requestPurchase(series.id);
    setBusy(false);
    if (!res.ok && res.code !== "pending") {
      setMsg(res.reason);
    }
  }

  async function refresh() {
    setBusy(true);
    await refreshAccount();
    setBusy(false);
  }

  return (
    <div className="modal-backdrop" onClick={closeModals}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{series.title}</h3>

        {!s.signedIn ? (
          <>
            <p className="muted small">
              Худалдаж авахын тулд эхлээд утасны дугаараараа бүртгүүлнэ — кино тань хаанаас ч
              нэвтрэхэд нээлттэй байна.
            </p>
            <button className="btn btn-primary" onClick={openAuth}>
              Нэвтрэх / Бүртгүүлэх
            </button>
          </>
        ) : status === "owned" ? (
          <p className="msg-ok">✅ Энэ кино танд нээлттэй — сайхан үзээрэй!</p>
        ) : (
          <>
            <p className="muted small">
              Киног бүтнээр нь нээх үнэ: <strong>{formatPrice(series.price)}</strong>. Нэг удаа
              төлөөд дуустал нь үзнэ.
            </p>

            {status === "none" && (
              <button className="btn btn-primary" disabled={busy} onClick={order}>
                Худалдаж авах — {formatPrice(series.price)}
              </button>
            )}

            {status === "pending" && (
              <p className="msg-ok">
                ⏳ Хүсэлт бүртгэгдсэн. Доорх данс руу шилжүүлснээс хойш удалгүй кино нээгдэнэ.
              </p>
            )}

            {msg && <p className="msg-err">{msg}</p>}

            <div className="bank-box">
              <p className="bank-title">Шилжүүлэх данс:</p>
              {bank ? (
                <>
                  <p>
                    <strong>{bank.bank_name}</strong> · {bank.account_number}
                  </p>
                  <p>Хүлээн авагч: {bank.account_name}</p>
                </>
              ) : (
                <p className="muted small">Ачаалж байна…</p>
              )}
              <p className="muted small">
                Дүн: <strong>{formatPrice(series.price)}</strong> · Гүйлгээний утга:{" "}
                <strong>{s.phone}</strong> (таны дугаар). Шилжүүлгийг админ баталгаажуулмагц кино
                автоматаар нээгдэнэ.
              </p>
            </div>

            {status === "pending" && (
              <button className="btn btn-outline" disabled={busy} onClick={refresh}>
                🔄 Шинэчлэх (нээгдсэн эсэхийг шалгах)
              </button>
            )}
          </>
        )}

        <button className="btn btn-ghost" onClick={closeModals}>
          Хаах
        </button>
      </div>
    </div>
  );
}
