import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supa } from "../lib/supa";
import { formatPrice } from "../data/catalog";
import {
  createLinks,
  linkUrl,
  listLinks,
  revokeLink,
  type AccessLink,
} from "../lib/accessLinks";
import { getSettings, saveSettings, type SiteSettings } from "../lib/settings";
import {
  loadSeriesMeta,
  saveSeriesMeta,
  uploadPoster,
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

const FUNNEL_STEPS = [
  { key: "open_series", label: "Киноны хуудас нээсэн" },
  { key: "watch_start", label: "Үзэж эхэлсэн" },
  { key: "paywall_hit", label: "Түгжээтэй ангид хүрсэн" },
  { key: "buy_click", label: "«Худалдаж авах» дарсан" },
  { key: "order_created", label: "Захиалга үүсгэсэн" },
];

export function AdminPage() {
  const s = useAppState();
  const [funnel, setFunnel] = useState<Record<string, number>>({});
  const [bySrc, setBySrc] = useState<Record<string, Record<string, number>>>({});
  const catalog = useCatalog();
  const [metas, setMetas] = useState<SeriesMeta[]>([]);
  const [editing, setEditing] = useState<SeriesMeta | null>(null);
  const [savingSeries, setSavingSeries] = useState(false);
  const [posterBusy, setPosterBusy] = useState<string | null>(null);

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
  const [bankMsgs, setBankMsgs] = useState<
    { id: number; raw: string; amount: string | null; matched: boolean; created_at: string }[]
  >([]);
  const [links, setLinks] = useState<AccessLink[]>([]);
  const [linkSeries, setLinkSeries] = useState("");
  const [linkCount, setLinkCount] = useState("5");
  const [linkDevices, setLinkDevices] = useState("1");
  const [linkNote, setLinkNote] = useState("");
  const [makingLinks, setMakingLinks] = useState(false);

  async function makeLinks() {
    setMakingLinks(true);
    const res = await createLinks(
      linkSeries,
      Math.min(50, Math.max(1, Number(linkCount) || 1)),
      Math.max(1, Number(linkDevices) || 1),
      linkNote,
    );
    setMakingLinks(false);
    if (res.ok) {
      setMsg(`${res.tokens?.length ?? 0} линк үүслээ ✅`);
      setLinkNote("");
      setLinks(await listLinks());
    } else {
      setMsg("Алдаа: " + res.reason);
    }
  }

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

    setLinks(await listLinks());

    const fn = await supa.rpc("md_funnel", { p_days: 7 });
    if (fn.data) setFunnel(fn.data as Record<string, number>);

    const fs = await supa.rpc("md_funnel_src", { p_days: 7 });
    if (fs.data) setBySrc(fs.data as Record<string, Record<string, number>>);

    const bm = await supa
      .from("md_bank_msgs")
      .select("id, raw, amount, matched, created_at")
      .order("created_at", { ascending: false })
      .limit(12);
    setBankMsgs((bm.data ?? []) as typeof bankMsgs);
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

  async function changePoster(m: SeriesMeta, file: File | undefined) {
    if (!file) return;
    setPosterBusy(m.id);
    const res = await uploadPoster(m.id, file);
    setPosterBusy(null);
    if (res.ok) {
      setMsg(`«${m.title || m.id}» постер солигдлоо ✅`);
      if (editing?.id === m.id) setEditing({ ...editing, poster_url: res.url ?? null });
      const rows = await loadSeriesMeta(true);
      setMetas([...rows].sort((a, b) => b.sort_order - a.sort_order || a.id.localeCompare(b.id)));
    } else {
      setMsg("Постер солигдсонгүй: " + res.reason);
    }
  }

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

      <h3 className="admin-h">Борлуулалтын юүлүүр (7 хоног)</h3>
      <div className="funnel">
        {FUNNEL_STEPS.map((f) => {
          const n = Number(funnel[f.key] ?? 0);
          const top = Number(funnel[FUNNEL_STEPS[0].key] ?? 0);
          const pct = top > 0 ? Math.round((n / top) * 100) : 0;
          return (
            <div key={f.key} className="funnel-row">
              <div className="funnel-label">
                <span>{f.label}</span>
                <strong>
                  {n} {top > 0 && f.key !== FUNNEL_STEPS[0].key && `· ${pct}%`}
                </strong>
              </div>
              <div className="funnel-bar">
                <div className="funnel-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
        <p className="muted small">
          Хүн тус бүрээр тоолсон. Хаана хамгийн их унтарч байгааг харвал юуг засахаа мэднэ.
        </p>
      </div>

      {Object.keys(bySrc).length > 0 && (
        <>
          <h4 className="admin-sub">Суваг тус бүрээр</h4>
          <div className="src-table">
            {Object.entries(bySrc).map(([src, ev]) => (
              <div key={src} className="src-row">
                <strong>{src}</strong>
                <span className="muted small">
                  {Number(ev.open_series ?? 0)} орсон · {Number(ev.buy_click ?? 0)} авах дарсан ·{" "}
                  {Number(ev.order_created ?? 0)} захиалсан
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 className="admin-h">Кинонууд ({metas.length})</h3>
      {metas.length === 0 && <p className="muted small">Ачаалж байна…</p>}
      {metas.map((m) =>
        editing?.id === m.id ? (
          <div key={m.id} className="series-edit">
            <div className="poster-edit">
              <img
                className="poster-edit-img"
                src={editing.poster_url || catalog.find((c) => c.id === m.id)?.poster}
                alt=""
              />
              <div className="poster-edit-side">
                <span className="pay-label">Постер (нүүрэнд харагдах зураг)</span>
                <label className="btn btn-outline poster-pick">
                  {posterBusy === m.id ? "Оруулж байна…" : "Зураг сонгох"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    disabled={posterBusy === m.id}
                    onChange={(e) => {
                      changePoster(m, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <span className="muted small">
                  Босоо зураг тохирно. Сонгомогц шууд солигдоно — сайт шинэчлэх хэрэггүй.
                </span>
              </div>
            </div>
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
            <img
              className="admin-poster-mini"
              src={m.poster_url || catalog.find((c) => c.id === m.id)?.poster}
              alt=""
            />
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

      <h3 className="admin-h">Нэвтрэх линк (бүртгэлгүй хүнд)</h3>
      <p className="muted small">
        Бүртгүүлж чаддаггүй хүнд зориулав. Линк дээр дарахад л <strong>тухайн кино</strong>{" "}
        нээгдэнэ — утас, нууц үг шаардахгүй. Линк бүр зөвхөн сонгосон кинонд хүчинтэй.
      </p>
      <div className="link-form">
        <select
          className="code-input"
          value={linkSeries}
          onChange={(e) => setLinkSeries(e.target.value)}
        >
          <option value="">Кино сонгох…</option>
          {catalog.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <div className="series-edit-row">
          <label className="series-field">
            <span className="pay-label">Хэдэн линк</span>
            <input
              className="code-input"
              inputMode="numeric"
              value={linkCount}
              onChange={(e) => setLinkCount(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <label className="series-field">
            <span className="pay-label">Хэдэн төхөөрөмж</span>
            <input
              className="code-input"
              inputMode="numeric"
              value={linkDevices}
              onChange={(e) => setLinkDevices(e.target.value.replace(/\D/g, ""))}
            />
          </label>
        </div>
        <input
          className="code-input"
          placeholder="Тэмдэглэл (жишээ: FB группын гишүүд)"
          value={linkNote}
          onChange={(e) => setLinkNote(e.target.value)}
        />
        <button
          className="btn btn-primary"
          disabled={!linkSeries || makingLinks}
          onClick={makeLinks}
        >
          {makingLinks ? "Үүсгэж байна…" : "Линк үүсгэх"}
        </button>
      </div>

      {links.length > 0 && (
        <div className="link-list">
          {links.map((l) => (
            <div key={l.token} className={`link-row ${l.revoked ? "link-dead" : ""}`}>
              <div className="link-main">
                <code className="link-url">{linkUrl(l.token)}</code>
                <span className="muted small">
                  {seriesTitle(l.series_id ?? "")} · {l.claims}/{l.max_claims} ашигласан
                  {l.note && ` · ${l.note}`}
                  {l.revoked && " · 🚫 хүчингүй"}
                </span>
              </div>
              <div className="admin-actions">
                <button
                  className="copy-btn"
                  onClick={() => {
                    void navigator.clipboard?.writeText(linkUrl(l.token));
                    setMsg("Линк хуулагдлаа ✅");
                  }}
                >
                  Хуулах
                </button>
                {!l.revoked && (
                  <button
                    className="copy-btn"
                    onClick={async () => {
                      if (await revokeLink(l.token)) {
                        setLinks(await listLinks());
                        setMsg("Линк хүчингүй боллоо");
                      }
                    }}
                  >
                    Хаах
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

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

      <h3 className="admin-h">Банкнаас ирсэн мэдэгдэл</h3>
      {bankMsgs.length === 0 && (
        <p className="muted small">Одоогоор мэдэгдэл алга (утасны холболт хийгдээгүй байж болно).</p>
      )}
      {bankMsgs.map((b) => (
        <div key={b.id} className="admin-row">
          <div>
            <strong>
              {b.matched ? "✅ таньсан" : "⚠️ таниагүй"} ·{" "}
              {b.amount ? formatPrice(Number(b.amount)) : "—"}
            </strong>
            <div className="muted small bank-raw">{b.raw}</div>
            <div className="muted small">{new Date(b.created_at).toLocaleString("mn-MN")}</div>
          </div>
        </div>
      ))}

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
