import { useEffect, useState } from "react";
import { formatPrice } from "../data/catalog";
import { getSettings, type SiteSettings } from "../lib/settings";
import {
  hasVip,
  loadPlans,
  refreshAccount,
  requestSubscription,
  useAppState,
  type Plan,
} from "../lib/store";
import { track } from "../lib/track";
import { closeModals, openAuth, useOpenModal } from "../lib/ui";

export function VipModal() {
  const open = useOpenModal() === "vip";
  const s = useAppState();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [bank, setBank] = useState<SiteSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void loadPlans().then(setPlans);
    void getSettings().then(setBank);
  }, [open]);

  // Хүлээгдэж байх үед баталгаажилтыг өөрөө шалгана
  useEffect(() => {
    if (!open || !s.subPending) return;
    const t = setInterval(() => void refreshAccount(), 10000);
    return () => clearInterval(t);
  }, [open, s.subPending]);

  if (!open) return null;

  const vip = hasVip(s);
  const payAmount = s.payAmounts["__vip__"] ?? 0;

  function copy(text: string, label: string) {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  async function order(code: string) {
    setBusy(true);
    setMsg(null);
    const res = await requestSubscription(code);
    setBusy(false);
    if (res.ok) track("order_created");
    else if (res.code !== "pending") setMsg(res.reason);
  }

  return (
    <div className="modal-backdrop" onClick={closeModals}>
      <div className="modal pay-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="pay-title">⭐ Сарын эрх</h3>
        <p className="muted small">
          Сайт дээрх <strong>бүх киног хязгааргүй</strong> үзнэ. Шинэ кино нэмэгдэх бүрд
          нэмэлт төлбөргүйгээр нээлттэй.
        </p>

        {vip ? (
          <p className="msg-ok">
            ✅ Таны сарын эрх идэвхтэй —{" "}
            {new Date(s.vipUntil as string).toLocaleDateString("mn-MN")} хүртэл
          </p>
        ) : !s.signedIn ? (
          <button className="btn btn-primary" onClick={openAuth}>
            Нэвтрэх / Бүртгүүлэх
          </button>
        ) : s.subPending ? (
          <>
            <div className="pay-status">
              <span className="pay-spinner" />
              <span>Шилжүүлгийг хүлээж байна…</span>
            </div>
            <div className="pay-box">
              <div className="pay-row">
                <div className="pay-row-text">
                  <span className="pay-label">Төлөх дүн — яг энэ дүнгээр</span>
                  <span className="pay-value pay-value-big">{formatPrice(payAmount)}</span>
                </div>
                <button className="copy-btn" onClick={() => copy(String(payAmount), "дүн")}>
                  Хуулах
                </button>
              </div>
              <div className="pay-divider" />
              {bank && (
                <>
                  <div className="pay-row">
                    <div className="pay-row-text">
                      <span className="pay-label">Банк</span>
                      <span className="pay-value">{bank.bank_name}</span>
                    </div>
                  </div>
                  <div className="pay-row">
                    <div className="pay-row-text">
                      <span className="pay-label">Дансны дугаар</span>
                      <span className="pay-value">{bank.account_number}</span>
                    </div>
                    <button
                      className="copy-btn"
                      onClick={() => copy(bank.account_number, "данс")}
                    >
                      Хуулах
                    </button>
                  </div>
                  <div className="pay-row">
                    <div className="pay-row-text">
                      <span className="pay-label">Хүлээн авагч</span>
                      <span className="pay-value">{bank.account_name}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
            {copied && <p className="msg-ok">{copied} хуулагдлаа ✅</p>}
            <p className="muted small">
              Төлбөр орсноос хойш хэдэн минутын дотор эрх тань автоматаар идэвхжинэ.
            </p>
          </>
        ) : (
          <>
            <div className="plan-list">
              {plans.map((p) => {
                const perMonth = Math.round(p.price / (p.days / 30));
                const best = p.days > 30;
                return (
                  <button
                    key={p.code}
                    className={`plan-card ${best ? "plan-best" : ""}`}
                    disabled={busy}
                    onClick={() => order(p.code)}
                  >
                    {best && <span className="plan-badge">Хэмнэлттэй</span>}
                    <span className="plan-label">{p.label}</span>
                    <span className="plan-price">{formatPrice(p.price)}</span>
                    {best && (
                      <span className="plan-per">сард {formatPrice(perMonth)}</span>
                    )}
                  </button>
                );
              })}
            </div>
            {msg && <p className="msg-err">{msg}</p>}
            <p className="muted small">
              Багц сонгоход шилжүүлэх дансны мэдээлэл гарч ирнэ. Автоматаар сунгагддаггүй —
              хугацаа дуусахад та өөрөө сонгоно.
            </p>
          </>
        )}

        <button className="btn btn-ghost" onClick={closeModals}>
          Хаах
        </button>
      </div>
    </div>
  );
}
