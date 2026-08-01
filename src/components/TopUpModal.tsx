import { useEffect, useState } from "react";
import { CONFIG } from "../config";
import {
  myTopups,
  refreshWallet,
  requestTopup,
  useAppState,
  type TopupRow,
} from "../lib/store";
import { closeModals, openAuth, useOpenModal } from "../lib/ui";

const STATUS_MN: Record<string, string> = {
  pending: "⏳ Хүлээгдэж байна",
  confirmed: "✅ Баталгаажсан",
  rejected: "❌ Татгалзсан",
};

export function TopUpModal() {
  const open = useOpenModal() === "topup";
  const s = useAppState();
  const [rows, setRows] = useState<TopupRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && s.signedIn) {
      void myTopups().then(setRows);
    }
  }, [open, s.signedIn]);

  if (!open) return null;

  async function order(coins: number) {
    setBusy(true);
    setMsg(null);
    const res = await requestTopup(coins);
    setBusy(false);
    if (res.ok) {
      setMsg("Хүсэлт бүртгэгдлээ! Одоо доорх данс руу шилжүүлээд хүлээнэ үү.");
      setRows(await myTopups());
    } else {
      setMsg(res.reason ?? "Алдаа гарлаа");
    }
  }

  async function refresh() {
    await refreshWallet();
    setRows(await myTopups());
  }

  return (
    <div className="modal-backdrop" onClick={closeModals}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Coin цэнэглэх</h3>

        {!s.signedIn ? (
          <>
            <p className="muted small">
              Цэнэглэхийн тулд эхлээд утасны дугаараараа бүртгүүлнэ — данс тань хаанаас ч
              нэвтрэхэд хадгалагдана.
            </p>
            <button className="btn btn-primary" onClick={openAuth}>
              Нэвтрэх / Бүртгүүлэх
            </button>
          </>
        ) : (
          <>
            <p className="muted small">
              Танд <strong>{s.coins} 🪙</strong> байна. Багцаа сонгоно уу:
            </p>

            <div className="pack-list">
              {CONFIG.packs.map((p) => (
                <button
                  key={p.coins}
                  className="pack-row pack-btn"
                  disabled={busy}
                  onClick={() => order(p.coins)}
                >
                  <span>🪙 {p.coins}</span>
                  <span className="pack-price">{p.price.toLocaleString("mn-MN")}₮</span>
                </button>
              ))}
            </div>

            {msg && <p className="msg-ok">{msg}</p>}

            <div className="bank-box">
              <p className="bank-title">Шилжүүлэх данс:</p>
              <p>
                <strong>{CONFIG.bank.bankName}</strong> · {CONFIG.bank.accountNumber}
              </p>
              <p>Хүлээн авагч: {CONFIG.bank.accountName}</p>
              <p className="muted small">
                Гүйлгээний утга: <strong>{s.phone}</strong> (таны дугаар). Шилжүүлснээс хойш
                удалгүй админ баталгаажуулахад coin автоматаар нэмэгдэнэ.
              </p>
            </div>

            {rows.length > 0 && (
              <div className="topup-history">
                {rows.map((r) => (
                  <div key={r.id} className="topup-hrow">
                    <span>
                      🪙 {r.coins} · {r.price.toLocaleString("mn-MN")}₮
                    </span>
                    <span className="muted small">{STATUS_MN[r.status] ?? r.status}</span>
                  </div>
                ))}
              </div>
            )}

            <button className="btn btn-outline" onClick={refresh}>
              🔄 Шинэчлэх (баталгаажсан эсэхийг шалгах)
            </button>
          </>
        )}

        <button className="btn btn-ghost" onClick={closeModals}>
          Хаах
        </button>
      </div>
    </div>
  );
}
