import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Crown, Infinity as InfinityIcon, Play, Plus, Search, ShieldCheck, Zap } from "lucide-react";
import {
  allCategories,
  formatDuration,
  isAdult,
  formatPrice,
  seriesCategories,
  totalSeconds,
  watchPath,
  type Series,
} from "../data/catalog";
import {
  buyStatus,
  hasVip,
  signOut,
  toggleMyList,
  useAppState,
  type AppState,
} from "../lib/store";
import { openVip } from "../lib/ui";
import { useCatalog } from "../lib/seriesAdmin";
import { cheapestPlan, usePlans, vipPhase } from "../lib/plans";
import { AccountBadge } from "../components/AccountBadge";
import { Brand } from "../components/Brand";

/** Киноны id нь огноотой (series-YYMMDD-HHMM) — сүүлийн 14 хоногт нэмэгдсэн бол «шинэ» */
function isNew(id: string): boolean {
  const m = /^series-(\d{2})(\d{2})(\d{2})-/.exec(id);
  if (!m) return false;
  const added = new Date(2000 + Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Date.now() - added < 14 * 86400000;
}

/** Хаана хүрсэн бэ: 0..1 (эхлээгүй/дууссан бол null) */
function progressOf(s: AppState, series: Series): { pct: number; label: string } | null {
  if (series.hls) {
    const mt = s.movieTime[series.id];
    if (!mt || mt.t < 30 || mt.t > mt.d - 60) return null;
    return { pct: mt.t / mt.d, label: `${formatDuration(mt.d - mt.t)} үлдсэн` };
  }
  const at = s.progress[series.id];
  if (!at || at <= 1 || at >= series.episodes.length) return null;
  return { pct: at / series.episodes.length, label: `${at}/${series.episodes.length} анги` };
}

function isOpen(s: AppState, series: Series): boolean {
  return series.price <= 0 || hasVip(s) || buyStatus(s, series.id) === "owned";
}

/** Картын доорх жижиг мөр: үнэ эсвэл «Нээлттэй» */
function Meta({ s, series }: { s: AppState; series: Series }) {
  if (series.price <= 0) return <span className="hm-meta hm-meta-open">Үнэгүй</span>;
  if (isOpen(s, series))
    return (
      <span className="hm-meta hm-meta-open">
        <Check size={12} strokeWidth={3} /> Нээлттэй
      </span>
    );
  return <span className="hm-meta">{formatPrice(series.price)}</span>;
}

/** Хэвтээ гүйдэг эгнээ — Netflix маягийн үндсэн нэгж */
function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="hm-row">
      <h2 className="hm-row-title">{title}</h2>
      <div className="hm-row-scroll">{children}</div>
    </section>
  );
}

function PosterCard({ series, s, to }: { series: Series; s: AppState; to?: string }) {
  const prog = progressOf(s, series);
  return (
    <Link to={to ?? `/series/${series.id}`} className="hm-card">
      <span className="hm-card-img">
        <img src={series.poster} alt={series.title} loading="lazy" />
        {isAdult(series) && <span className="km-18">18+</span>}
        {prog && (
          <span className="hm-card-bar">
            <span style={{ width: `${prog.pct * 100}%` }} />
          </span>
        )}
      </span>
      <span className="hm-card-title">{series.title}</span>
      {prog ? <span className="hm-meta">{prog.label}</span> : <Meta s={s} series={series} />}
    </Link>
  );
}

/** Дээд цэс: эхэндээ тунгалаг, доош гүйлгэхэд бараан шил болно */
function useScrolled(px = 40): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const f = () => setOn(window.scrollY > px);
    f();
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, [px]);
  return on;
}

export function Home() {
  const s = useAppState();
  const catalog = useCatalog();
  const navigate = useNavigate();
  const plan = cheapestPlan(usePlans());
  const scrolled = useScrolled();

  const featured = catalog[0];
  const categories = useMemo(() => allCategories(catalog), [catalog]);

  // Эхэлсэн мөртлөө дуусгаагүй кинонууд — буцаж ирэх гол шалтгаан
  const continueList = useMemo(
    () => catalog.filter((x) => progressOf(s, x) !== null).slice(0, 10),
    [catalog, s],
  );
  const myList = useMemo(
    () => s.myList.map((id) => catalog.find((c) => c.id === id)).filter(Boolean) as Series[],
    [catalog, s.myList],
  );
  const owned = useMemo(
    () => catalog.filter((x) => x.price > 0 && s.purchased.includes(x.id)),
    [catalog, s.purchased],
  );
  const fresh = useMemo(() => catalog.filter((x) => isNew(x.id)).slice(0, 12), [catalog]);

  if (!featured) {
    return <div className="page center">Ачаалж байна…</div>;
  }

  const phase = vipPhase(s);
  const featuredProg = progressOf(s, featured);
  const inList = s.myList.includes(featured.id);
  const vip = hasVip(s);
  const featuredCats = seriesCategories(featured).filter((c) => c !== "18+");

  return (
    <div className="hm">
      <header className={`hm-header ${scrolled ? "hm-header-on" : ""}`}>
        <Brand />
        <div className="hm-header-right">
          <Link to="/search" className="icon-btn" aria-label="Хайх">
            <Search size={20} />
          </Link>
          <AccountBadge />
        </div>
      </header>

      {/* Онцлох кино — нүүрний хамгийн том зай хамгийн шинэ кинонд */}
      <section className="hm-hero">
        <div className="hm-hero-ambient" style={{ backgroundImage: `url(${featured.poster})` }} />
        <div className="hm-hero-inner">
          <Link to={`/series/${featured.id}`} className="hm-hero-art" aria-label={featured.title}>
            <img src={featured.poster} alt={featured.title} />
            {isAdult(featured) && <span className="km-18 km-18-lg">18+</span>}
          </Link>
          <div className="hm-hero-info">
            {isNew(featured.id) && <span className="km-kicker">Шинэ кино</span>}
            <h1 className="hm-hero-title">{featured.title}</h1>
            <p className="hm-hero-meta">
              {featuredCats.map((c) => (
                <span key={c}>{c}</span>
              ))}
              <span>{formatDuration(totalSeconds(featured))}</span>
            </p>
            {featured.tagline && <p className="hm-hero-tagline">{featured.tagline}</p>}
            <div className="hm-hero-actions">
              <button
                className="btn btn-play"
                onClick={() => navigate(watchPath(featured, s.progress[featured.id] ?? 1))}
              >
                <Play size={18} fill="currentColor" /> {featuredProg ? "Үргэлжлүүлэх" : "Үзэх"}
              </button>
              <button className="btn btn-glass" onClick={() => toggleMyList(featured.id)}>
                {inList ? <Check size={18} /> : <Plus size={18} />} Жагсаалт
              </button>
            </div>
            {!isOpen(s, featured) && (
              <p className="hm-hero-free">
                Эхний {featured.freeMinutes} минут үнэгүй · Бүтэн кино {formatPrice(featured.price)}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="hm-body">
        {continueList.length > 0 && (
          <Row title="Үргэлжлүүлэн үзэх">
            {continueList.map((x) => (
              <PosterCard key={x.id} series={x} s={s} to={watchPath(x, s.progress[x.id] ?? 1)} />
            ))}
          </Row>
        )}

        {/* Сарын эрх: үе шат бүрд өөр мессеж — орлогын ихэнх нь эндээс ордог */}
        {phase.kind === "active" ? (
          <button className="km-vip km-vip-on" onClick={openVip}>
            <Crown size={22} className="km-vip-icon" />
            <span className="km-vip-text">
              <strong>Сарын эрх идэвхтэй</strong>
              <span>
                {new Date(s.vipUntil as string).toLocaleDateString("mn-MN")} хүртэл бүх кино нээлттэй
              </span>
            </span>
            <span className="km-vip-cta km-vip-cta-ghost">Сунгах</span>
          </button>
        ) : (
          <button className="km-vip" onClick={openVip}>
            <Crown size={22} className="km-vip-icon" />
            <span className="km-vip-text">
              {phase.kind === "ending" ? (
                <>
                  <strong>Сарын эрх {phase.daysLeft} хоногийн дараа дуусна</strong>
                  <span>Одоо сунгавал үлдсэн хоног дээр чинь нэмэгдэнэ</span>
                </>
              ) : phase.kind === "lapsed" ? (
                <>
                  <strong>Сарын эрх тань дууссан</strong>
                  <span>Сэргээвэл бүх {catalog.length} кино дахин нээгдэнэ</span>
                </>
              ) : (
                <>
                  <strong>Бүх {catalog.length} кино нэг эрхээр</strong>
                  <span>
                    {plan ? `Сард ${formatPrice(plan.price)}` : "Хязгааргүй"} · шинэ кино нэмэгдэх бүрд
                  </span>
                </>
              )}
            </span>
            <span className="km-vip-cta">
              {phase.kind === "ending" ? "Сунгах" : phase.kind === "lapsed" ? "Сэргээх" : "Эрх авах"}
            </span>
          </button>
        )}

        {myList.length > 0 && (
          <Row title="Миний жагсаалт">
            {myList.map((x) => (
              <PosterCard key={x.id} series={x} s={s} />
            ))}
          </Row>
        )}

        <Row title={fresh.length >= 4 ? "Шинээр нэмэгдсэн" : "Сүүлд нэмэгдсэн"}>
          {(fresh.length >= 4 ? fresh : catalog.slice(0, 10)).map((x) => (
            <PosterCard key={x.id} series={x} s={s} />
          ))}
        </Row>

        {owned.length > 0 && !vip && (
          <Row title="Миний авсан кинонууд">
            {owned.map((x) => (
              <PosterCard key={x.id} series={x} s={s} />
            ))}
          </Row>
        )}

        {/* Ангилал бүр нэг эгнээ (ганц кинотой ангиллыг эгнээ болгохгүй) */}
        {categories
          .map((c) => ({ c, items: catalog.filter((x) => seriesCategories(x).includes(c)) }))
          .filter((g) => g.items.length >= 2 && g.items.length < catalog.length)
          .map((g) => (
            <Row key={g.c} title={g.c === "18+" ? "Насанд хүрэгчдэд · 18+" : g.c}>
              {g.items.map((x) => (
                <PosterCard key={x.id} series={x} s={s} />
              ))}
            </Row>
          ))}

        <section className="hm-all">
          <h2 className="hm-row-title">Бүх кино · {catalog.length}</h2>
          <div className="hm-grid">
            {catalog.map((x) => (
              <PosterCard key={x.id} series={x} s={s} />
            ))}
          </div>
        </section>

        <section className="hm-perks">
          <div className="hm-perk">
            <Play size={20} />
            <span>
              <strong>Эхлээд үнэгүй үз</strong>
              Кино бүрийн эхний хэсэг бүртгэлгүй, үнэгүй
            </span>
          </div>
          <div className="hm-perk">
            <InfinityIcon size={20} />
            <span>
              <strong>Нэг төлөөд хязгааргүй</strong>
              Авсан кино тань хэзээ ч, хэдэн ч удаа
            </span>
          </div>
          <div className="hm-perk">
            <Zap size={20} />
            <span>
              <strong>QPay-ээр шууд</strong>
              Төлмөгц хэдхэн секундэд нээгдэнэ
            </span>
          </div>
          <div className="hm-perk">
            <ShieldCheck size={20} />
            <span>
              <strong>Хаанаас ч үз</strong>
              Утас, таблет, компьютер — апп суулгах шаардлагагүй
            </span>
          </div>
        </section>

        <footer className="hm-foot">
          <Brand compact />
          <p>
            {s.signedIn && !s.guest ? (
              <>
                {s.phone} гэж нэвтэрсэн ·{" "}
                <button className="link-btn" onClick={() => void signOut()}>
                  Гарах
                </button>
                {" · "}
              </>
            ) : null}
            <Link className="link-btn" to="/help">
              Тусламж
            </Link>
          </p>
          <p className="hm-foot-copy">© {new Date().getFullYear()} Кино Мандал · kinomandal.com</p>
        </footer>
      </div>
    </div>
  );
}
