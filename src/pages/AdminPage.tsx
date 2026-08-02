import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supa } from "../lib/supa";
import { CATALOG, formatPrice, getSeries } from "../data/catalog";
import { useAppState } from "../lib/store";
import { openAuth } from "../lib/ui";
import { AccountBadge } from "../components/AccountBadge";

interface AdminPurchase {
  id: number;
  series_id: string;
  price: number;
  status: string;
  created_at: string;
  phone: string;
}

function seriesTitle(id: string): string {
  return getSeries(id)?.title ?? id;
}

export function AdminPage() {
  const s = useAppState();
  const [pending, setPending] = useState<AdminPurchase[]>([]);
  const [history, setHistory] = useState<AdminPurchase[]>([]);
  const [grantPhone, setGrantPhone] = useState("");
  const [grantSeries, setGrantSeries] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, h] = await Promise.all([
      supa
        .from("md_purchases_admin")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
      supa
        .from("md_purchases_admin")
        .select("*")
        .neq("status", "pending")
        .order("decided_at", { ascending: false })
        .limit(15),
    ]);
    setPending((p.data ?? []) as AdminPurchase[]);
    setHistory((h.data ?? []) as AdminPurchase[]);
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
    const { error } = await supa.rpc(confirm ? "md_confirm_purchase" : "md_reject_purchase", {
      p_id: id,
    });
    setMsg(error ? "Алдаа: " + error.message : confirm ? "Баталгаажлаа ✅" : "Татгалзлаа");
    await load();
  }

  async function grant() {
    const { error } = await supa.rpc("md_admin_grant", {
      p_phone: grantPhone.replace(/\D/g, ""),
      p_series: grantSeries,
    });
    setMsg(
      error
        ? /phone_not_found/.test(error.message)
          ? "Ийм дугаартай хэрэглэгч олдсонгүй"
          : "Алдаа: " + error.message
        : `«${seriesTitle(grantSeries)}» → ${grantPhone} нээгдлээ ✅`,
    );
    if (!error) {
      setGrantPhone("");
      setGrantSeries("");
      await load();
    }
  }

  const paidSeries = CATALOG.filter((c) => c.price > 0);

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="back">
          ←
        </Link>
        <div className="brand">Админ · Худалдан авалт</div>
        <AccountBadge />
      </header>

      {msg && <p className="msg-ok">{msg}</p>}

      <h3 className="admin-h">Хүлээгдэж буй хүсэлтүүд ({pending.length})</h3>
      {pending.length === 0 && <p className="muted small">Одоогоор хүсэлт алга.</p>}
      {pending.map((t) => (
        <div key={t.id} className="admin-row">
          <div>
            <strong>{t.phone}</strong> · {seriesTitle(t.series_id)} ·{" "}
            <span className="pack-price">{formatPrice(t.price)}</span>
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

      <h3 className="admin-h">Гараар кино нээж өгөх</h3>
      <div className="code-row">
        <input
          className="code-input"
          placeholder="Утасны дугаар"
          value={grantPhone}
          onChange={(e) => setGrantPhone(e.target.value)}
        />
        <select
          className="code-input"
          value={grantSeries}
          onChange={(e) => setGrantSeries(e.target.value)}
        >
          <option value="">Кино сонгох…</option>
          {paidSeries.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <button
          className="btn btn-primary"
          disabled={!grantPhone || !grantSeries}
          onClick={grant}
        >
          Нээх
        </button>
      </div>

      <h3 className="admin-h">Сүүлийн шийдвэрүүд</h3>
      {history.map((t) => (
        <div key={t.id} className="admin-row">
          <div>
            {t.phone} · {seriesTitle(t.series_id)} · {formatPrice(t.price)}
          </div>
          <span className="muted small">{t.status === "confirmed" ? "✅" : "❌"}</span>
        </div>
      ))}
    </div>
  );
}
