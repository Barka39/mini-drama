import { useEffect, useState } from "react";
import { formatPrice, getSeries } from "../data/catalog";
import { getSettings, type SiteSettings } from "../lib/settings";
import { buyStatus, refreshAccount, requestPurchase, useAppState } from "../lib/store";
import { closeModals, openAuth, useOpenModal, usePurchaseSeriesId } from "../lib/ui";

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

  const series = seriesId ? getSeries(seriesId) : undefined;
  const status = series ? buyStatus(s, series.id) : "none";
  // Сервер захиалга бүрд өвөрмөц дүн оноодог — түүгээр банкнаас автоматаар таньдаг
  const payAmount = (series && s.payAmounts[series.id]) || series?.price || 0;

  useEffect(() => {
    if (open) void getSettings().then(setBank);
  }, [open]);

  // Хүлээгдэж байгаа үед баталгаажилтыг өөрөө шалгана — хэрэглэгч юу ч дарах шаардлагагүй
  useEffect(() => {
    if (!open || status !== "pending") return;
    const t = setInterval(() => void refreshAccount(), 10000);
    return () => clearInterval(t);
  }, [open, status]);

  if (!open || !series) return null;

  function copy(text: string, label: string) {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  async function order() {
    if (!series) return;
    setBusy(true);
    setMsg(null);
    const res = await requestPurchase(series.id);
    setBusy(false);
    if (!res.ok && res.code !== "pending") setMsg(res.reason);
  }

  return (
    <div className="modal-backdrop" onClick={closeModals}>
      <div className="modal pay-modal" onClick={(e) => e.stopPropagation()}>
        {/* Захиалгын хураангуй */}
        <div className="pay-head">
          <img className="pay-poster" src={series.poster} alt={series.title} />
          <div>
            <h3 className="pay-title">{series.title}</h3>
            <p className="muted small">{series.episodes.length} анги · бүх анги нээгдэнэ</p>
            <p className="pay-price">{formatPrice(series.price)}</p>
          </div>
        </div>

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
          <>
            <p className="msg-ok">✅ Төлбөр баталгаажлаа — кино бүрэн нээгдсэн!</p>
            <button className="btn btn-primary" onClick={closeModals}>
              Үзэж эхлэх
            </button>
          </>
        ) : status === "none" ? (
          <>
            <ol className="pay-steps">
              <li>«Захиалах» дарна</li>
              <li>Банкны аппаараа шилжүүлэг хийнэ</li>
              <li>Кино автоматаар нээгдэнэ</li>
            </ol>
            {msg && <p className="msg-err">{msg}</p>}
            <button className="btn btn-primary" disabled={busy} onClick={order}>
              {busy ? "Түр хүлээнэ үү…" : `Захиалах — ${formatPrice(series.price)}`}
            </button>
            <p className="muted small">Захиалсны дараа шилжүүлэх дансны мэдээлэл гарч ирнэ.</p>
          </>
        ) : (
          <>
            <div className="pay-status">
              <span className="pay-spinner" />
              <span>Шилжүүлгийг хүлээж байна…</span>
            </div>

            <div className="pay-box">
              {bank ? (
                <>
                  <CopyRow
                    label="Төлөх дүн — яг энэ дүнгээр"
                    value={formatPrice(payAmount)}
                    big
                    onCopy={copy}
                  />
                  <CopyRow label="Гүйлгээний утга" value={s.phone ?? ""} onCopy={copy} />
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
                </>
              ) : (
                <p className="muted small">Ачаалж байна…</p>
              )}
            </div>

            {copied && <p className="msg-ok">{copied} хуулагдлаа ✅</p>}

            <p className="muted small">
              Зарласан үнэ {formatPrice(series.price)} боловч захиалгыг тань таних{" "}
              <strong>тусгай дүн</strong> оноогдсон тул {formatPrice(payAmount)} шилжүүлнэ — арай
              бага. Гүйлгээний утганд утасны дугаараа бичвэл бүр найдвартай. Төлбөр орсноос хойш
              хэдэн минутын дотор кино <strong>автоматаар</strong> нээгдэж, энэ цонх өөрөө
              шинэчлэгдэнэ.
            </p>
            {bank?.contact && <p className="muted small">{bank.contact}</p>}
          </>
        )}

        <button className="btn btn-ghost" onClick={closeModals}>
          Хаах
        </button>
      </div>
    </div>
  );
}
