import { useState } from "react";
import { CONFIG } from "../config";
import { verifyCode } from "../lib/codes";
import { addCoins, redeemCoins, useAppState } from "../lib/store";
import { closeTopup, useTopupOpen } from "../lib/ui";

export function TopUpModal() {
  const open = useTopupOpen();
  const s = useAppState();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!open) return null;

  async function onRedeem() {
    const result = await verifyCode(code, s.redeemedCodes);
    if (result.ok && result.coins) {
      redeemCoins(result.coins, code);
      setMsg({ ok: true, text: `+${result.coins} 🪙 амжилттай нэмэгдлээ! Одоо үзэж болно.` });
      setCode("");
    } else {
      setMsg({ ok: false, text: result.reason ?? "Код буруу байна" });
    }
  }

  function close() {
    closeTopup();
    setMsg(null);
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Coin цэнэглэх</h3>
        <p className="muted small">
          Танд одоо <strong>{s.coins} 🪙</strong> байна. Нэг анги нээхэд ихэвчлэн 30 🪙 хэрэгтэй.
        </p>

        <div className="steps">
          <p>
            <strong>1.</strong> Багцаа сонгоод доорх данс руу шилжүүлнэ:
          </p>
          <div className="pack-list">
            {CONFIG.packs.map((p) => (
              <div key={p.coins} className="pack-row">
                <span>🪙 {p.coins}</span>
                <span className="pack-price">{p.price.toLocaleString("mn-MN")}₮</span>
              </div>
            ))}
          </div>
          <div className="bank-box">
            <p>
              <strong>{CONFIG.bank.bankName}</strong> · {CONFIG.bank.accountNumber}
            </p>
            <p>Хүлээн авагч: {CONFIG.bank.accountName}</p>
            <p className="muted small">Гүйлгээний утга дээр утасны дугаараа бичнэ үү.</p>
          </div>
          <p>
            <strong>2.</strong> {CONFIG.contact}
          </p>
          <p>
            <strong>3.</strong> Бидний илгээсэн кодыг энд оруулна:
          </p>
        </div>

        <div className="code-row">
          <input
            className="code-input"
            placeholder="Идэвхжүүлэх код (MD…)"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setMsg(null);
            }}
          />
          <button className="btn btn-primary" onClick={onRedeem} disabled={!code.trim()}>
            Идэвхжүүлэх
          </button>
        </div>
        {msg && <p className={msg.ok ? "msg-ok" : "msg-err"}>{msg.text}</p>}

        {CONFIG.demoMode && (
          <div className="topup-row">
            {[100, 300].map((n) => (
              <button
                key={n}
                className="btn btn-outline"
                onClick={() => {
                  addCoins(n);
                  close();
                }}
              >
                +{n} 🪙 (демо)
              </button>
            ))}
          </div>
        )}

        <button className="btn btn-ghost" onClick={close}>
          Хаах
        </button>
      </div>
    </div>
  );
}
