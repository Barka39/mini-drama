import { useState } from "react";
import { CONFIG } from "../config";
import { verifyCode } from "../lib/codes";
import { addCoins, redeemCoins, useAppState } from "../lib/store";

export function CoinBadge() {
  const s = useAppState();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onRedeem() {
    const result = await verifyCode(code, s.redeemedCodes);
    if (result.ok && result.coins) {
      redeemCoins(result.coins, code);
      setMsg({ ok: true, text: `+${result.coins} 🪙 амжилттай нэмэгдлээ!` });
      setCode("");
    } else {
      setMsg({ ok: false, text: result.reason ?? "Код буруу байна" });
    }
  }

  function close() {
    setOpen(false);
    setMsg(null);
  }

  return (
    <>
      <button className="coin-badge" onClick={() => setOpen(true)}>
        🪙 {s.coins}
      </button>
      {open && (
        <div className="modal-backdrop" onClick={close}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Coin цэнэглэх</h3>

            <div className="pack-list">
              {CONFIG.packs.map((p) => (
                <div key={p.coins} className="pack-row">
                  <span>🪙 {p.coins}</span>
                  <span className="pack-price">{p.price.toLocaleString("mn-MN")}₮</span>
                </div>
              ))}
            </div>

            <div className="bank-box">
              <p className="bank-title">Дансаар шилжүүлэх:</p>
              <p>
                <strong>{CONFIG.bank.bankName}</strong> · {CONFIG.bank.accountNumber}
              </p>
              <p>Хүлээн авагч: {CONFIG.bank.accountName}</p>
              <p className="muted small">
                Гүйлгээний утга дээр утасны дугаараа бичнэ үү. {CONFIG.contact}. Бид танд
                идэвхжүүлэх код илгээнэ.
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
      )}
    </>
  );
}
