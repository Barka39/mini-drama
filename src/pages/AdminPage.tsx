import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supa } from "../lib/supa";
import { formatPrice } from "../data/catalog";
import { getSettings, saveSettings, type SiteSettings } from "../lib/settings";
import {
  loadSeriesMeta,
  saveSeriesMeta,
  useCatalog,
  type SeriesMeta,
} from "../lib/seriesAdmin";
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

export function AdminPage() {
  const s = useAppState();
  const catalog = useCatalog();
  const [metas, setMetas] = useState<SeriesMeta[]>([]);
  const [editing, setEditing] = useState<SeriesMeta | null>(null);
  const [savingSeries, setSavingSeries] = useState(false);

  const seriesTitle = useCallback(
    (id: string) => metas.find((m) => m.id === id)?.title || catalog.find((c) => c.id === id)?.title || id,
    [metas, catalog],
  );
  const [pending, setPending] = useState<AdminPurchase[]>([]);
  const [history, setHistory] = useState<AdminPurchase[]>([]);
  const [grantPhone, setGrantPhone] = useState("");
  const [grantSeries, setGrantSeries] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

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
    void getSettings().then(setSettings);
    void loadSeriesMeta(true).then((rows) =>
      setMetas([...rows].sort((a, b) => b.sort_order - a.sort_order || a.id.localeCompare(b.id))),
    );
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [s.isAdmin, load]);

  async function persistSeries() {
    if (!editing) return;
    setSavingSeries(true);
    const res = await saveSeriesMeta(editing);
    setSavingSeries(false);
    if (res.ok) {
      setMsg(`«${editing.title}» хадгалагдлаа ✅`);
      setEditing(null);
      const rows = await loadSeriesMeta(true);
      setMetas([...rows].sort((a, b) => b.sort_order - a.sort_order || a.id.localeCompare(b.id)));
    } else {
      setMsg("Алдаа: " + res.reason);
    }
  }

  async function persistSettings() {
    if (!settings) return;
    setSavingSettings(true);
    const res = await saveSettings(settings);
    setSavingSettings(false);
    setMsg(res.ok ? "Данс хадгалагдлаа ✅" : "Алдаа: " + res.reason);
  }

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

  const paidSeries = catalog.filter((c) => c.price > 0);

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

      <h3 className="admin-h">Кинонууд ({metas.length})</h3>
      {metas.length === 0 && <p className="muted small">Ачаалж байна…</p>}
      {metas.map((m) =>
        editing?.id === m.id ? (
          <div key={m.id} className="series-edit">
            <input
              className="code-input"
              placeholder="Киноны нэр"
              value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            />
            <input
              className="code-input"
              placeholder="Товч танилцуулга"
              value={editing.tagline}
              onChange={(e) => setEditing({ ...editing, tagline: e.target.value })}
            />
            <input
              className="code-input"
              placeholder="Ангилал (олныг «·»-оор салгана: Драм · Романс)"
              value={editing.genre}
              onChange={(e) => setEditing({ ...editing, genre: e.target.value })}
            />
            <div className="series-edit-row">
              <label className="series-field">
                <span className="pay-label">Үнэ (₮, 0 = үнэгүй)</span>
                <input
                  className="code-input"
                  inputMode="numeric"
                  value={editing.price}
                  onChange={(e) =>
                    setEditing({ ...editing, price: Number(e.target.value.replace(/\D/g, "")) || 0 })
                  }
                />
              </label>
              <label className="series-field">
                <span className="pay-label">Үнэгүй минут</span>
                <input
                  className="code-input"
                  inputMode="numeric"
                  value={editing.free_minutes}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      free_minutes: Number(e.target.value.replace(/[^\d.]/g, "")) || 0,
                    })
                  }
                />
              </label>
              <label className="series-field">
                <span className="pay-label">Эрэмбэ (их нь дээр)</span>
                <input
                  className="code-input"
                  inputMode="numeric"
                  value={editing.sort_order}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      sort_order: Number(e.target.value.replace(/[^\d-]/g, "")) || 0,
                    })
                  }
                />
              </label>
            </div>
            <label className="series-check">
              <input
                type="checkbox"
                checked={editing.hidden}
                onChange={(e) => setEditing({ ...editing, hidden: e.target.checked })}
              />
              <span>Сайтаас нуух (хэрэглэгчид харагдахгүй)</span>
            </label>
            <div className="admin-actions">
              <button className="btn btn-primary" disabled={savingSeries} onClick={persistSeries}>
                {savingSeries ? "Хадгалж байна…" : "Хадгалах"}
              </button>
              <button className="btn btn-outline" onClick={() => setEditing(null)}>
                Болих
              </button>
            </div>
          </div>
        ) : (
          <div key={m.id} className="admin-row">
            <div>
              <strong>{m.title || m.id}</strong>
              {m.hidden && <span className="muted small"> · 🚫 нуусан</span>}
              <div className="muted small">
                {m.genre || "ангилалгүй"} ·{" "}
                {m.price > 0 ? formatPrice(m.price) : "Үнэгүй"} · эхний {m.free_minutes} мин үнэгүй
                {m.sort_order !== 0 && ` · эрэмбэ ${m.sort_order}`}
              </div>
            </div>
            <div className="admin-actions">
              <button className="btn btn-outline" onClick={() => setEditing({ ...m })}>
                Засах
              </button>
            </div>
          </div>
        ),
      )}
      <p className="muted small">
        Шинэ кино нэмэх бол Desktop дээрх «Мини Драм — Цуврал нэмэх» товчлуулыг ашиглана
        (бичлэг хэрчих ажил компьютер дээр хийгддэг). Энд нэмсэн киноныхоо мэдээллийг
        засварлана.
      </p>

      <h3 className="admin-h">Шилжүүлэг хүлээн авах данс</h3>
      {settings ? (
        <div className="settings-form">
          <input
            className="code-input"
            placeholder="Банкны нэр (ж: Хаан банк)"
            value={settings.bank_name}
            onChange={(e) => setSettings({ ...settings, bank_name: e.target.value })}
          />
          <input
            className="code-input"
            placeholder="Дансны дугаар"
            value={settings.account_number}
            onChange={(e) => setSettings({ ...settings, account_number: e.target.value })}
          />
          <input
            className="code-input"
            placeholder="IBAN (заавал биш)"
            value={settings.iban}
            onChange={(e) => setSettings({ ...settings, iban: e.target.value })}
          />
          <input
            className="code-input"
            placeholder="Данс эзэмшигчийн нэр"
            value={settings.account_name}
            onChange={(e) => setSettings({ ...settings, account_name: e.target.value })}
          />
          <input
            className="code-input"
            placeholder="Холбоо барих заавар (Facebook хуудас г.м)"
            value={settings.contact}
            onChange={(e) => setSettings({ ...settings, contact: e.target.value })}
          />
          <button className="btn btn-primary" disabled={savingSettings} onClick={persistSettings}>
            {savingSettings ? "Хадгалж байна…" : "Данс хадгалах"}
          </button>
          <p className="muted small">
            Энэ данс худалдан авалтын цонхонд хэрэглэгч бүрт харагдана. (QPay холболт дараагийн
            шатанд — мерчант бүртгэлтэй болмогц автоматжина.)
          </p>
        </div>
      ) : (
        <p className="muted small">Ачаалж байна…</p>
      )}

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
