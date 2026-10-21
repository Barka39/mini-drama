import { Crown } from "lucide-react";
import { InAppGuide } from "./InAppGuide";
import { markModalInUrl, needsBrowserGuide } from "../lib/inapp";
import { useEffect, useState } from "react";
import { CATEGORY_LABEL, formatPrice } from "../data/catalog";
import { useCatalog } from "../lib/seriesAdmin";
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

export function VipModal() {
  const open = useOpenModal() === "vip";
  const s = useAppState();
  const asked = useVipCategory();
  const catalog = useCatalog();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [bank, setBank] = useState<SiteSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

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

  // Ангиллаас нээгдсэн бол тэр ангилал эхэнд, дараа нь «Бүх кино»; нүүрнээс бол бүгд
  const scopes: Plan["scope"][] = asked ? [asked, "all"] : ["ai", "erotic", "all"];
  const counts: Record<Plan["scope"], number> = {
    ai: catalog.filter((x) => x.category === "ai").length,
    erotic: catalog.filter((x) => x.category === "erotic").length,
    all: catalog.length,
  };
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

  return (
    <div className="modal-backdrop" onClick={closeModals}>
      <div className="modal pay-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="pay-title pay-title-icon">
          <Crown size={20} /> Сарын эрх
        </h3>
        <p className="muted small">
          Ангиллынхаа <strong>бүх киног хязгааргүй</strong> үзнэ. Шинэ кино нэмэгдэх бүрд
          нэмэлт төлбөргүйгээр нээлттэй.
        </p>

        {mine.length > 0 && (
          <div className="msg-ok">
            {mine.map((v) => (
              <div key={v.scope}>
                ✅ {SCOPE_LABEL[v.scope]} — {new Date(v.until).toLocaleDateString("mn-MN")} хүртэл
              </div>
            ))}
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
            {scopes.map((scope) => {
              const group = plans.filter((p) => p.scope === scope).sort((a, b) => a.days - b.days);
              if (!group.length) return null;
              const monthly = group[0].price / (group[0].days / 30);
              return (
                <div key={scope} className="plan-group">
                  <div className="plan-group-head">
                    <strong>{SCOPE_LABEL[scope]}</strong>
                    <span className="muted small">
                      {scope === "all" ? `AI + эротик · ${counts.all} кино` : `${counts[scope]} кино`}
                      {covered(scope) ? " · идэвхтэй — сунгах" : ""}
                    </span>
                  </div>
                  <div className="plan-list">
                    {group.map((p) => {
                      const perMonth = Math.round(p.price / (p.days / 30));
                      const save = Math.round((1 - perMonth / monthly) * 100);
                      return (
                        <button
                          key={p.code}
                          className={`plan-card ${p.days > 30 ? "plan-best" : ""}`}
                          disabled={busy}
                          onClick={() => order(p.code)}
                        >
                          {p.days > 30 && (
                            <span className="plan-badge">{`−${save}%`}</span>
                          )}
                          <span className="plan-label">{Math.round(p.days / 30)} сар</span>
                          <span className="plan-price">{formatPrice(p.price)}</span>
                          {p.days > 30 && <span className="plan-per">сард {formatPrice(perMonth)}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
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

        <button className="btn btn-ghost" onClick={closeModals}>
          Хаах
        </button>
      </div>
    </div>
  );
}
