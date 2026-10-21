import { Check, CircleCheck, Crown, X } from "lucide-react";
import { InAppGuide } from "./InAppGuide";
import { markModalInUrl, needsBrowserGuide } from "../lib/inapp";
import { useEffect, useState } from "react";
import { CATEGORY_LABEL, formatPrice } from "../data/catalog";
import { getSettings, onlinePayFor, type SiteSettings } from "../lib/settings";
import {
  activeVips,
  loadPlans,
  refreshAccount,
  requestSubscription,
  startOnlinePay,
  useAppState,
  type Plan,
} from "../lib/store";
import { track } from "../lib/track";
import { closeModals, openAuth, useOpenModal, useVipCategory } from "../lib/ui";

const SCOPE_LABEL: Record<Plan["scope"], string> = { ...CATEGORY_LABEL, all: "Бүх кино" };
const CARD_NAME: Record<Plan["scope"], string> = { ai: "AI кино багц", erotic: "Эротик багц", all: "Бүх кино багц" };

function daysLeft(until: string): number {
  return Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 86400000));
}

export function VipModal() {
  const open = useOpenModal() === "vip";
  const s = useAppState();
  const asked = useVipCategory();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [bank, setBank] = useState<SiteSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [period, setPeriod] = useState(1);

  useEffect(() => {
    if (!open) {
      if (needsBrowserGuide) markModalInUrl("vip", null);
      return;
    }
    // Safari-д нээгдэхэд сарын эрхийн цонх өөрөө нээгдэнэ (App.tsx)
    if (needsBrowserGuide) markModalInUrl("vip", "1");
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

  // 3 багц үргэлж (2026-10-22 эзэн: «AI кино багц яагаад харагдахгүй байна»); ангиллаас
  // нээгдсэн бол тэр ангилал эхэнд
  const scopes: Plan["scope"][] = asked === "erotic" ? ["erotic", "ai", "all"] : ["ai", "erotic", "all"];
  const mine = activeVips(s);
  // энэ багц аль хэдийн идэвхтэй юу (тэгвэл товч нь «сунгах» болно)
  const covered = (scope: Plan["scope"]) => mine.some((v) => v.scope === scope);
  const payAmount = s.payAmounts["__vip__"] ?? 0;
  const qpay = onlinePayFor(bank, s.isAdmin);
  // Сарын эрх утасны дугаарт холбогддог тул бүртгэл заавал (зочин ч бүртгүүлнэ)
  const needAccount = !s.signedIn || s.guest;

  function copy(text: string, label: string) {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  async function order(code: string) {
    if (needAccount) {
      // Бүртгүүлсний дараа энэ цонх руу буцаж ирээд багцаа дахин сонгоно
      openAuth("up", "vip");
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await requestSubscription(code);
    if (res.ok) track("order_created");
    else if (res.code !== "pending") {
      setBusy(false);
      setMsg(res.reason);
      return;
    }
    // QPay асаалттай бол шууд төлбөрийн хуудас руу; эс бөгөөс дансны мэдээлэл гарна
    if (qpay) await payQpay();
    else setBusy(false);
  }

  async function payQpay() {
    setBusy(true);
    setMsg(null);
    const pay = await startOnlinePay("sub");
    if (pay.ok) {
      window.location.href = pay.url;
      return;
    }
    setBusy(false);
    setMsg(pay.reason);
  }

  // Багц сонгох үе — өргөн «Тохирох эрхийг сонгоно уу» хуудас (2026-10-22 эзний загвар)
  const picking = !(qpay && needsBrowserGuide) && !(!needAccount && s.subPending);
  const months = [...new Set(plans.map((p) => Math.round(p.days / 30)))].sort((a, b) => a - b);
  const span = months.includes(period) ? period : months[0] ?? 1;

  return (
    <div className="modal-backdrop" onClick={closeModals}>
      <div className={`modal pay-modal ${picking ? "vip-sheet" : ""}`} onClick={(e) => e.stopPropagation()}>
        {picking ? (
          <>
            <button className="vip-x" onClick={closeModals} aria-label="Хаах">
              <X size={20} />
            </button>
            <h2 className="vip-h">Тохирох эрхийг сонгоно уу</h2>
            <p className="vip-sub">Нэг дор бүх киног хязгааргүй үзэх боломж</p>
          </>
        ) : (
          <>
            <h3 className="pay-title pay-title-icon">
              <Crown size={20} /> Сарын эрх
            </h3>
            <p className="muted small">
              Ангиллынхаа <strong>бүх киног хязгааргүй</strong> үзнэ. Шинэ кино нэмэгдэх бүрд
              нэмэлт төлбөргүйгээр нээлттэй.
            </p>
          </>
        )}

        {mine.length > 0 && (
          <div className="vip-active">
            <span className="vip-active-ic">
              <CircleCheck size={20} />
            </span>
            <div className="vip-active-text">
              {mine.map((v) => (
                <div key={v.scope}>
                  <strong>Идэвхтэй эрх: {SCOPE_LABEL[v.scope]}</strong>
                  <span>
                    Дуусах: {v.until.slice(0, 10)} ({daysLeft(v.until)} хоног үлдсэн)
                  </span>
                </div>
              ))}
            </div>
            <button className="vip-active-go" onClick={closeModals}>
              Үзэхийг нээх →
            </button>
          </div>
        )}

        {qpay && needsBrowserGuide ? (
          // iPhone-ийн Facebook/Messenger: энд төлбөр ажиллахгүй — Safari/Chrome-д нээх заавар
          <InAppGuide kind="sub" chromePath={`${window.location.pathname}?vip=1`} />
        ) : !needAccount && s.subPending ? (
          <>
            <div className="pay-status">
              <span className="pay-spinner" />
              <span>{qpay ? "Төлбөрийг хүлээж байна…" : "Шилжүүлгийг хүлээж байна…"}</span>
            </div>
            {qpay ? (
              <>
                <button className="btn btn-primary" disabled={busy} onClick={payQpay}>
                  {busy ? "Түр хүлээнэ үү…" : `Төлбөр төлөх — ${formatPrice(payAmount)}`}
                </button>
                {msg && <p className="msg-err">{msg}</p>}
              </>
            ) : (
            <>
            <div className="pay-box">
              <div className="pay-row">
                <div className="pay-row-text">
                  <span className="pay-label">Төлөх дүн</span>
                  <span className="pay-value pay-value-big">{formatPrice(payAmount)}</span>
                </div>
                <button className="copy-btn" onClick={() => copy(String(payAmount), "дүн")}>
                  Хуулах
                </button>
              </div>
              {s.phone && (
                <div className="pay-row">
                  <div className="pay-row-text">
                    <span className="pay-label">Гүйлгээний утга — утасны дугаараа заавал бичнэ</span>
                    <span className="pay-value">{s.phone}</span>
                  </div>
                  <button className="copy-btn" onClick={() => copy(s.phone as string, "утга")}>
                    Хуулах
                  </button>
                </div>
              )}
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
            {copied && <p className="msg-ok">{copied} хуулагдлаа</p>}
            </>
            )}
            <p className="muted small">
              Төлбөр орсны дараа эрх тань <strong>автоматаар</strong> идэвхжиж, энэ цонх өөрөө
              шинэчлэгдэнэ.
            </p>
          </>
        ) : (
          <>
            {months.length > 1 && (
              <div className="vip-period" role="tablist">
                {months.map((m) => (
                  <button
                    key={m}
                    role="tab"
                    aria-selected={m === span}
                    className={m === span ? "on" : ""}
                    onClick={() => setPeriod(m)}
                  >
                    {m} сар
                  </button>
                ))}
              </div>
            )}
            <div className="vip-grid">
              {scopes.map((scope) => {
                const group = plans.filter((p) => p.scope === scope);
                const p = group.find((x) => Math.round(x.days / 30) === span);
                if (!p) return null;
                const one = group.find((x) => Math.round(x.days / 30) === 1);
                const perMonth = Math.round(p.price / span);
                const save = one && span > 1 ? Math.round((1 - perMonth / one.price) * 100) : 0;
                const on = covered(scope);
                return (
                  <div key={scope} className={`vip-card ${scope === "all" ? "vip-card-best" : ""}`}>
                    {scope === "all" && <span className="vip-ribbon">Хамгийн ашигтай</span>}
                    <h4>{CARD_NAME[scope]}</h4>
                    <div className="vip-price">
                      {formatPrice(p.price)}
                      <span>/ {span} сар</span>
                    </div>
                    {save > 0 && (
                      <div className="vip-save">
                        сард {formatPrice(perMonth)} · −{save}%
                      </div>
                    )}
                    <ul className="vip-feats">
                      {(scope === "all" ? (["ai", "erotic"] as const) : [scope]).map((c) => (
                        <li key={c}>
                          <Check size={16} /> {CATEGORY_LABEL[c]}
                        </li>
                      ))}
                      <li>
                        <Check size={16} /> Шинэ кино нэмэгдэхэд үнэгүй
                      </li>
                      <li className="vip-feat-dim">– Автоматаар сунгагдахгүй</li>
                    </ul>
                    <button
                      className={on ? "vip-buy vip-buy-on" : "vip-buy"}
                      disabled={busy}
                      onClick={() => order(p.code)}
                    >
                      {on ? "✓ Идэвхтэй · сунгах" : "Эрх авах"}
                    </button>
                  </div>
                );
              })}
            </div>
            {msg && <p className="msg-err">{msg}</p>}
            {needAccount && (
              <p className="hint-box">
                Сарын эрх утасны дугаарт тань холбогдоно — өөр утаснаас ч нэвтэрч үзнэ. Багц
                сонгоход бүртгүүлэх цонх гарна
                {s.guest && s.purchased.length > 0
                  ? "; энэ утсан дээр авсан кинонууд тань бүртгэлд тань шилжинэ."
                  : "."}
              </p>
            )}
            <p className="muted small">
              {qpay
                ? "Багц сонгоход QPay-ийн төлбөрийн хуудас нээгдэнэ."
                : "Багц сонгоход шилжүүлэх дансны мэдээлэл гарч ирнэ."}{" "}
              Автоматаар сунгагддаггүй — хугацаа дуусахад та өөрөө сонгоно.
            </p>
          </>
        )}

        {!picking && (
          <button className="btn btn-ghost" onClick={closeModals}>
            Хаах
          </button>
        )}
      </div>
    </div>
  );
}
