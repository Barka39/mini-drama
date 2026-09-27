import { Crown } from "lucide-react";
import { ChromePayButton } from "./ChromePayButton";
import { needsChromeHandoff } from "../lib/inapp";
import { useEffect, useRef, useState } from "react";
import { formatDuration, formatPrice, getSeries, totalSeconds } from "../data/catalog";
import { getSettings, onlinePayFor, type SiteSettings } from "../lib/settings";
import {
  buyStatus,
  canWatchNow,
  ensureSession,
  hasVip,
  loadPlans,
  refreshAccount,
  requestPurchase,
  startOnlinePay,
  useAppState,
  type Plan,
} from "../lib/store";
import { useCatalog } from "../lib/seriesAdmin";
import { track } from "../lib/track";
import { closeModals, openAuth, openVip, useOpenModal, usePurchaseSeriesId } from "../lib/ui";

// Хуулж болох мөр: шошго + утга + «Хуулах» товч
function CopyRow({
  label,
  value,
  big,
  onCopy,
}: {
  label: string;
  value: string;
  big?: boolean;
  onCopy: (v: string, label: string) => void;
}) {
  if (!value) return null;
  return (
    <div className="pay-row">
      <div className="pay-row-text">
        <span className="pay-label">{label}</span>
        <span className={big ? "pay-value pay-value-big" : "pay-value"}>{value}</span>
      </div>
      <button className="copy-btn" onClick={() => onCopy(value, label)}>
        Хуулах
      </button>
    </div>
  );
}

export function PurchaseModal() {
  const open = useOpenModal() === "purchase";
  const seriesId = usePurchaseSeriesId();
  const s = useAppState();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bank, setBank] = useState<SiteSettings | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  // iPhone-ийн Messenger/Facebook: цонх нээгдмэгц захиалга + төлбөрийн хуудсыг урьдчилан
  // бэлдэнэ — «Төлбөр төлөх» нь тэгвэл шууд Chrome-ын холбоос болж НЭГ дарахад нээгдэнэ
  // (Facebook зөвхөн хүн өөрөө дарсан холбоосоор Chrome-г нээдэг; хүлээлгээд нээвэл хаадаг).
  const [prep, setPrep] = useState<string | null>(null);
  const [prepFailed, setPrepFailed] = useState(false);
  const [tapped, setTapped] = useState(false);
  const preparing = useRef(false);
  const catalog = useCatalog();
  // Хамгийн хямд (ихэвчлэн 1 сарын) багц — оролт болгож харуулна
  const vipPlan = plans.length ? plans.reduce((a, b) => (a.price <= b.price ? a : b)) : null;
  const catalogCount = catalog.length;

  const series = seriesId ? getSeries(seriesId) : undefined;
  // Сарын эрхтэй бол бүх кино нээлттэй — «авсан» гэж үзнэ (дахин төлүүлэхгүй)
  const status = series ? (hasVip(s) ? "owned" : buyStatus(s, series.id)) : "none";
  // Захиалгын дүн = зарласан үнэ (хуучин захиалгад өвөрмөц дүн үлдсэн байж болно)
  const payAmount = (series && s.payAmounts[series.id]) || series?.price || 0;
  // QPay (Byl): эзэн админ хуудаснаас асаана. Асаалттай үед нэг киног бүртгэлгүй авна.
  const qpay = onlinePayFor(bank, s.isAdmin);
  // Утасны дугаартай бүртгэл (зочин биш)
  const hasAccount = s.signedIn && !s.guest;

  useEffect(() => {
    if (!open) {
      setPrep(null);
      setPrepFailed(false);
      setTapped(false);
      return;
    }
    setMsg(null);
    void getSettings().then(setBank);
    void loadPlans().then(setPlans);
  }, [open]);

  // Хүлээгдэж байгаа үед баталгаажилтыг өөрөө шалгана — хэрэглэгч юу ч дарах шаардлагагүй
  useEffect(() => {
    if (!open || status !== "pending") return;
    const t = setInterval(() => void refreshAccount(), 10000);
    return () => clearInterval(t);
  }, [open, status]);

  // Захиалга + Byl-ийн төлбөрийн хуудсыг үүсгэнэ. Хаяг, эсвэл null (алдааг msg-д бичнэ).
  // Сессгүй бол зочны сесс нээнэ. Төлсний дараа кино автоматаар нээгдэнэ (Byl-ийн мэдэгдэл
  // ихэвчлэн түрүүлж ирдэг; үгүй бол 10 сек тутам шалгана).
  async function prepareQpay(): Promise<string | null> {
    if (!series) return null;
    const sess = await ensureSession();
    if (!sess.ok) {
      setMsg(sess.reason);
      return null;
    }
    if (status !== "pending") {
      const res = await requestPurchase(series.id);
      if (res.ok) track("order_created", series.id);
      if (res.ok || res.code === "pending") {
        // Захиалгын дараах шинэчлэлт зочны киног данс руу шилжүүлж, кино аль хэдийн
        // нээгдсэн байж болно — тэгвэл төлбөрийн хуудас хэрэггүй.
        if (canWatchNow(series.id)) return null;
      } else if (res.code === "owned") {
        // Аль хэдийн нээлттэй (дансаа шинэчилсэн тул цонх «нээгдсэн» болж харагдана)
        return null;
      } else {
        setMsg(res.reason);
        return null;
      }
    }
    const pay = await startOnlinePay("movie", series.id);
    if (pay.ok) return pay.url;
    setMsg(pay.reason);
    return null;
  }

  const wantPrep =
    open && needsChromeHandoff && !!qpay && !!series && status !== "owned" && !prep && !prepFailed;
  useEffect(() => {
    if (!wantPrep || preparing.current) return;
    preparing.current = true;
    void prepareQpay().then((url) => {
      preparing.current = false;
      if (url) setPrep(url);
      else setPrepFailed(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantPrep]);

  // Бэлдсэн хаяг 15 минутын дараа шинэчлэгдэнэ (хуучирсан төлбөрийн хуудас руу явуулахгүй)
  useEffect(() => {
    if (!prep) return;
    const t = setTimeout(() => setPrep(null), 15 * 60 * 1000);
    return () => clearTimeout(t);
  }, [prep]);

  if (!open || !series) return null;

  function copy(text: string, label: string) {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  // Дансаар шилжүүлэх (QPay унтраалттай үеийн нөөц зам — бүртгэлтэй хэрэглэгчид)
  async function order() {
    if (!series) return;
    setBusy(true);
    setMsg(null);
    const res = await requestPurchase(series.id);
    setBusy(false);
    if (res.ok) track("order_created", series.id);
    else if (res.code !== "pending") setMsg(res.reason);
  }

  // QPay (энгийн хөтөч): захиалга үүсгээд Byl-ийн төлбөрийн хуудас руу шилжинэ
  async function payQpay() {
    setBusy(true);
    setMsg(null);
    const url = await prepareQpay();
    if (url) {
      window.location.href = url;
      return;
    }
    setBusy(false);
  }

  // iPhone-ийн Messenger: Chrome-оос буцаж ирэхэд «хүлээж байна» төлөв харуулж, төлбөрийг шалгана
  function markReturned() {
    setTapped(true);
    void refreshAccount();
  }

  // iPhone-ийн Messenger: урьдчилан бэлдэх алдаатай болсон бол дахин оролдоно
  function retryPrep() {
    setMsg(null);
    setPrepFailed(false);
  }

  const vipOffer = vipPlan && catalogCount > 2 && (
    // Сарын эрхийн санал. Түгжээ бол хүн худалдан авах бодолтой байгаа ганц мөч —
    // нэг кино авахаас сарын эрх авах нь хамаагүй ашигтайг ЭНД хэлэх ёстой.
    <div className="pay-vip">
      <div className="pay-divider" />
      <p className="pay-vip-line">
        Эсвэл <strong>{formatPrice(vipPlan.price)}</strong>-өөр{" "}
        <strong>бүх {catalogCount} киног</strong> {vipPlan.days} хоног хязгааргүй
      </p>
      <button className="btn btn-outline" onClick={openVip}>
        <Crown size={17} /> Сарын эрх авах
      </button>
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={closeModals}>
      <div className="modal pay-modal" onClick={(e) => e.stopPropagation()}>
        {/* Захиалгын хураангуй */}
        <div className="pay-head">
          <img className="pay-poster" src={series.poster} alt={series.title} />
          <div>
            <h3 className="pay-title">{series.title}</h3>
            <p className="muted small">
              {formatDuration(totalSeconds(series))} · бүтэн кино нээгдэнэ
            </p>
            <p className="pay-price">{formatPrice(series.price)}</p>
          </div>
        </div>

        {status === "owned" ? (
          <>
            <p className="msg-ok">
              {hasVip(s) && !s.purchased.includes(series.id)
                ? "Таны сарын эрх идэвхтэй — энэ кино танд нээлттэй!"
                : "Төлбөр баталгаажлаа — кино бүрэн нээгдсэн!"}
            </p>
            <button className="btn btn-primary" onClick={closeModals}>
              Үзэж эхлэх
            </button>
            {s.guest && (
              <>
                <p className="muted small">
                  Кино энэ утсан дээр нээлттэй. Өөр утаснаас үзэх эсвэл хөтчөө цэвэрлэсэн ч
                  алдахгүй байхыг хүсвэл утасны дугаараараа бүртгүүлээрэй — үнэгүй.
                </p>
                <button className="btn btn-outline" onClick={() => openAuth("up")}>
                  Бүртгүүлэх
                </button>
              </>
            )}
          </>
        ) : !bank ? (
          <p className="muted small">Ачаалж байна…</p>
        ) : qpay ? (
          // iPhone-ийн Messenger-т захиалга цонх нээгдмэгц үүсдэг тул «хүлээж байна»-г зөвхөн
          // «Төлбөр төлөх» дарсны дараа харуулна
          status === "pending" && (!needsChromeHandoff || tapped) ? (
            <>
              <div className="pay-status">
                <span className="pay-spinner" />
                <span>Төлбөрийг хүлээж байна…</span>
              </div>
              {needsChromeHandoff && !prepFailed ? (
                <ChromePayButton
                  url={prep}
                  kind="movie"
                  label={`Төлбөр төлөх — ${formatPrice(payAmount)}`}
                  onReturn={markReturned}
                />
              ) : (
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={needsChromeHandoff ? retryPrep : payQpay}
                >
                  {busy ? "Түр хүлээнэ үү…" : `Төлбөр төлөх — ${formatPrice(payAmount)}`}
                </button>
              )}
              {msg && <p className="msg-err">{msg}</p>}
              <p className="muted small">
                Төлсний дараа кино хэдхэн секундын дотор <strong>автоматаар</strong> нээгдэж, энэ
                цонх өөрөө шинэчлэгдэнэ.
              </p>
              {bank.contact && <p className="muted small">{bank.contact}</p>}
            </>
          ) : (
            <>
              <ol className="pay-steps">
                <li>«Төлбөр төлөх» дарна</li>
                <li>Банкны аппаа сонгож эсвэл QR уншуулж төлнө</li>
                <li>Кино шууд нээгдэнэ</li>
              </ol>
              {msg && <p className="msg-err">{msg}</p>}
              {needsChromeHandoff && !prepFailed ? (
                <ChromePayButton
                  url={prep}
                  kind="movie"
                  label={`Төлбөр төлөх — ${formatPrice(series.price)}`}
                  onReturn={markReturned}
                />
              ) : (
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={needsChromeHandoff ? retryPrep : payQpay}
                >
                  {busy ? "Түр хүлээнэ үү…" : `Төлбөр төлөх — ${formatPrice(series.price)}`}
                </button>
              )}
              {!hasAccount && (
                <p className="muted small">Бүртгэл шаардлагагүй — кино энэ утсан дээр шууд нээгдэнэ.</p>
              )}
              {!s.signedIn && (
                // Бүртгэлтэй (эсвэл сарын эрхтэй) хүн шинэ утсан дээр дахин төлөхөөс сэргийлнэ
                <button className="btn btn-ghost" onClick={() => openAuth("in", "purchase")}>
                  Өмнө нь бүртгүүлсэн бол нэвтрэх
                </button>
              )}
              {vipOffer}
            </>
          )
        ) : !hasAccount ? (
          // QPay унтраалттай (нөөц зам): дансаар шилжүүлгийг утасны дугаараар таньдаг
          <>
            <p className="muted small">
              Худалдаж авахын тулд эхлээд утасны дугаараараа бүртгүүлнэ — кино тань хаанаас ч
              нэвтрэхэд нээлттэй байна.
            </p>
            <button className="btn btn-primary" onClick={() => openAuth("in", "purchase")}>
              Нэвтрэх / Бүртгүүлэх
            </button>
          </>
        ) : status === "none" ? (
          <>
            <ol className="pay-steps">
              <li>«Захиалах» дарна</li>
              <li>Банкны аппаараа шилжүүлэг хийнэ</li>
              <li>Төлбөр баталгаажмагц кино нээгдэнэ</li>
            </ol>
            {msg && <p className="msg-err">{msg}</p>}
            <button className="btn btn-primary" disabled={busy} onClick={order}>
              {busy ? "Түр хүлээнэ үү…" : `Захиалах — ${formatPrice(series.price)}`}
            </button>
            <p className="muted small">Захиалсны дараа шилжүүлэх дансны мэдээлэл гарч ирнэ.</p>
            {vipOffer}
          </>
        ) : (
          <>
            <div className="pay-status">
              <span className="pay-spinner" />
              <span>Шилжүүлгийг хүлээж байна…</span>
            </div>

            <div className="pay-box">
              <CopyRow label="Төлөх дүн" value={formatPrice(payAmount)} big onCopy={copy} />
              <CopyRow
                label="Гүйлгээний утга — утасны дугаараа заавал бичнэ"
                value={s.phone ?? ""}
                onCopy={copy}
              />
              <div className="pay-divider" />
              <div className="pay-row">
                <div className="pay-row-text">
                  <span className="pay-label">Банк</span>
                  <span className="pay-value">{bank.bank_name}</span>
                </div>
              </div>
              <CopyRow label="Дансны дугаар" value={bank.account_number} onCopy={copy} />
              <CopyRow label="IBAN" value={bank.iban} onCopy={copy} />
              <div className="pay-row">
                <div className="pay-row-text">
                  <span className="pay-label">Хүлээн авагч</span>
                  <span className="pay-value">{bank.account_name}</span>
                </div>
              </div>
            </div>

            {copied && <p className="msg-ok">{copied} хуулагдлаа</p>}

            <p className="muted small">
              Гүйлгээний утганд утасны дугаараа бичвэл таны захиалгыг таньж кино нээгдэнэ, энэ
              цонх өөрөө шинэчлэгдэнэ.
            </p>
            {bank.contact && <p className="muted small">{bank.contact}</p>}
          </>
        )}

        <button className="btn btn-ghost" onClick={closeModals}>
          Хаах
        </button>
      </div>
    </div>
  );
}
