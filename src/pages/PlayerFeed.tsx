import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getSeries } from "../data/catalog";
import { isUnlocked, setProgress, unlockEpisode, useAppState } from "../lib/store";
import { openAuth, openTopup } from "../lib/ui";
import { CoinBadge } from "../components/CoinBadge";

export function PlayerFeed() {
  const { seriesId, epIndex } = useParams();
  const s = useAppState();
  const series = seriesId ? getSeries(seriesId) : undefined;
  const startIndex = Math.max(1, Number(epIndex) || 1);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const [active, setActive] = useState(startIndex);
  const [muted, setMuted] = useState(true);

  // Эхлэх анги руу гүйлгэх
  useEffect(() => {
    const el = containerRef.current?.querySelector(`[data-ep="${startIndex}"]`);
    el?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
  }, [startIndex]);

  // Слайдууд дэлгэцийн өндөртэй тэнцүү тул scrollTop-оос идэвхтэй ангийг тооцно
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => {
      const ep = Math.round(container.scrollTop / container.clientHeight) + 1;
      setActive(ep);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [seriesId]);

  useEffect(() => {
    if (!series) return;
    setProgress(series.id, Math.min(active, series.episodes.length));
    videoRefs.current.forEach((video, ep) => {
      if (ep === active) {
        video.muted = muted;
        video.play().catch(() => {
          /* autoplay хориглогдвол хэрэглэгчийн товшилтыг хүлээнэ */
        });
      } else {
        video.pause();
        video.currentTime = 0;
      }
    });
  }, [active, muted, series, s.unlocked]);

  if (!series) {
    return (
      <div className="page center">
        <p>Цуврал олдсонгүй.</p>
        <Link className="btn" to="/">
          Нүүр хуудас
        </Link>
      </div>
    );
  }

  return (
    <div className="feed" ref={containerRef}>
      <header className="feed-topbar">
        <Link to={`/series/${series.id}`} className="back">
          ←
        </Link>
        <div className="feed-title">
          {series.title} · {active}-р анги
        </div>
        <CoinBadge />
      </header>

      {series.episodes.map((ep) => {
        const unlocked = isUnlocked(s, series.id, ep.index, series.freeCount);
        return (
          <section key={ep.index} className="slide" data-ep={ep.index}>
            {unlocked ? (
              <>
                <video
                  ref={(el) => {
                    if (el) videoRefs.current.set(ep.index, el);
                    else videoRefs.current.delete(ep.index);
                  }}
                  src={ep.video}
                  playsInline
                  loop
                  muted={muted}
                  preload={Math.abs(ep.index - active) <= 1 ? "auto" : "metadata"}
                  onClick={(e) => {
                    const v = e.currentTarget;
                    if (v.paused) v.play();
                    else v.pause();
                  }}
                />
                <div className="slide-meta">
                  <strong>
                    {ep.index}-р анги · {ep.title}
                  </strong>
                </div>
                {muted && (
                  <button className="unmute" onClick={() => setMuted(false)}>
                    🔊 Дуу асаах
                  </button>
                )}
              </>
            ) : (
              <div className="lock-slide" style={{ backgroundImage: `url(${series.poster})` }}>
                <div className="lock-panel">
                  <div className="lock-icon">🔒</div>
                  <h3>
                    {ep.index}-р анги · {ep.title}
                  </h3>
                  {!s.signedIn ? (
                    <>
                      <p className="muted">
                        Үргэлжлүүлэн үзэхийн тулд утасны дугаараараа бүртгүүлж coin-оор ангиа
                        нээнэ.
                      </p>
                      <button className="btn btn-primary" onClick={openAuth}>
                        Нэвтрэх / Бүртгүүлэх
                      </button>
                    </>
                  ) : s.coins >= series.unlockCost ? (
                    <>
                      <p className="muted">Үргэлжлэлийг үзэхийн тулд ангиа нээнэ үү</p>
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          void unlockEpisode(series.id, ep.index).then((r) => {
                            if (r === "insufficient") openTopup();
                            else if (r === "auth") openAuth();
                          });
                        }}
                      >
                        Нээх — {series.unlockCost} 🪙
                      </button>
                      <p className="muted small">Танд {s.coins} 🪙 байна</p>
                    </>
                  ) : (
                    <>
                      <p className="muted">
                        Танд {s.coins} 🪙 байна — энэ анги нээхэд {series.unlockCost} 🪙 хэрэгтэй.
                        Цэнэглээд үргэлжлүүлэн үзээрэй.
                      </p>
                      <button className="btn btn-primary" onClick={openTopup}>
                        🪙 Цэнэглэх — хэрхэн гэдгийг харах
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
            {ep.index < series.episodes.length && <div className="swipe-hint">↑ Дараагийн анги</div>}
          </section>
        );
      })}

      <section className="slide end-slide" data-ep={series.episodes.length + 1}>
        <div className="lock-panel">
          <h3>Цуврал дууслаа 🎬</h3>
          <p className="muted">Өөр цуврал үзэх үү?</p>
          <Link className="btn btn-primary" to="/">
            Каталог руу буцах
          </Link>
        </div>
      </section>
    </div>
  );
}
