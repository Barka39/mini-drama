import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supa } from "../lib/supa";
import { useAppState } from "../lib/store";
import { openAuth } from "../lib/ui";
import { CoinBadge } from "../components/CoinBadge";

interface AdminTopup {
  id: number;
  coins: number;
  price: number;
  status: string;
  created_at: string;
  phone: string;
}

export function AdminPage() {
  const s = useAppState();
  const [pending, setPending] = useState<AdminTopup[]>([]);
  const [history, setHistory] = useState<AdminTopup[]>([]);
  const [creditPhone, setCreditPhone] = useState("");
  const [creditCoins, setCreditCoins] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, h] = await Promise.all([
      supa
        .from("md_topups_admin")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
      supa
        .from("md_topups_admin")
        .select("*")
        .neq("status", "pending")
        .order("decided_at", { ascending: false })
        .limit(15),
    ]);
    setPending((p.data ?? []) as AdminTopup[]);
    setHistory((h.data ?? []) as AdminTopup[]);
  }, []);

  useEffect(() => {
    if (!s.isAdmin) return;
    void load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [s.isAdmin, load]);

  if (!s.authReady) {
    return <div className="page center">Ачаалж байна…</div>;
  }

  if (!s.signedIn || !s.isAdmin) {
    return (
      <div className="page center">
        <p className="muted">Энэ хуудас зөвхөн админд зориулагдсан.</p>
        {!s.signedIn && (
          <button className="btn btn-primary" onClick={openAuth}>
            Нэвтрэх
          </button>
        )}
        <Link className="btn btn-ghost" to="/">
          Нүүр хуудас
        </Link>
      </div>
    );
  }

  async function decide(id: number, confirm: boolean) {
    const { error } = await supa.rpc(confirm ? "md_confirm_topup" : "md_reject_topup", {
      p_id: id,
    });
    setMsg(error ? "Алдаа: " + error.message : confirm ? "Баталгаажлаа ✅" : "Татгалзлаа");
    await load();
  }

  async function credit() {
    const { error } = await supa.rpc("md_admin_credit", {
      p_phone: creditPhone.replace(/\D/g, ""),
      p_coins: Number(creditCoins),
    });
    setMsg(
      error
        ? /phone_not_found/.test(error.message)
          ? "Ийм дугаартай хэрэглэгч олдсонгүй"
          : "Алдаа: " + error.message
        : `+${creditCoins} 🪙 → ${creditPhone} амжилттай`,
    );
    if (!error) {
      setCreditPhone("");
      setCreditCoins("");
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="back">
          ←
        </Link>
        <div className="brand">Админ · Цэнэглэлт</div>
        <CoinBadge />
      </header>

      {msg && <p className="msg-ok">{msg}</p>}

      <h3 className="admin-h">Хүлээгдэж буй хүсэлтүүд ({pending.length})</h3>
      {pending.length === 0 && <p className="muted small">Одоогоор хүсэлт алга.</p>}
      {pending.map((t) => (
        <div key={t.id} className="admin-row">
          <div>
            <strong>{t.phone}</strong> · 🪙 {t.coins} ·{" "}
            <span className="pack-price">{t.price.toLocaleString("mn-MN")}₮</span>
            <div className="muted small">{new Date(t.created_at).toLocaleString("mn-MN")}</div>
          </div>
          <div className="admin-actions">
            <button className="btn btn-primary" onClick={() => decide(t.id, true)}>
              Баталгаажуулах
            </button>
            <button className="btn btn-outline" onClick={() => decide(t.id, false)}>
              Татгалзах
            </button>
          </div>
        </div>
      ))}

      <h3 className="admin-h">Гараар coin нэмэх</h3>
      <div className="code-row">
        <input
          className="code-input"
          placeholder="Утасны дугаар"
          value={creditPhone}
          onChange={(e) => setCreditPhone(e.target.value)}
        />
        <input
          className="code-input admin-coins-input"
          placeholder="Coin"
          value={creditCoins}
          onChange={(e) => setCreditCoins(e.target.value)}
        />
        <button
          className="btn btn-primary"
          disabled={!creditPhone || !/^\d+$/.test(creditCoins)}
          onClick={credit}
        >
          Нэмэх
        </button>
      </div>

      <h3 className="admin-h">Сүүлийн шийдвэрүүд</h3>
      {history.map((t) => (
        <div key={t.id} className="admin-row">
          <div>
            {t.phone} · 🪙 {t.coins} · {t.price.toLocaleString("mn-MN")}₮
          </div>
          <span className="muted small">{t.status === "confirmed" ? "✅" : "❌"}</span>
        </div>
      ))}
    </div>
  );
}
