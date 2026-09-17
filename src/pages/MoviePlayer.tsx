import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatPrice } from "../data/catalog";
import { getMovieStream, type MovieStream } from "../lib/playback";
import { useSeriesById } from "../lib/seriesAdmin";
import { buyStatus, hasVip, refreshAccount, setMovieTime, useAppState } from "../lib/store";
import { track } from "../lib/track";
import { openPurchase, openVip } from "../lib/ui";

const SPEEDS = [1, 1.25, 1.5, 2];
const DEFAULT_TITLE = "Кино Мандал — богино драм монголоор";

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

// hls.js-ийн бидэнд хэрэгтэй хэсэг (санг зөвхөн энэ хуудсанд, хэрэгтэй үед л ачаална)
interface HlsLike {
  loadSource(url: string): void;
  attachMedia(el: HTMLMediaElement): void;
  destroy(): void;
  on(event: string, cb: (e: string, data: { fatal?: boolean; details?: string }) => void): void;
}

/**
 * Нэг бүтэн киноны тоглуулагч.
 *
 * Кино нь нэг тасралтгүй бичлэг: нэг цагийн шугам, зогссон цэгээс үргэлжлүүлнэ.
 * Төлөөгүй хүнд үнэгүй хэсэг дуусахад дэлгэцэн дээр төлбөрийн санал гарах ба
 * төлмөгц (эсвэл сарын эрх идэвхжмэгц) ЯГ ТЭР СЕКУНДЭЭС үргэлжилнэ.
 * Хилийг сервер өөрөө сахидаг — клиент зөвхөн саналыг зөв мөчид харуулна.
 */
export function MoviePlayer() {
  const { seriesId } = useParams();
  const series = useSeriesById(seriesId);
  const s = useAppState();

  const [stream, setStream] = useState<MovieStream | null>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showCtl, setShowCtl] = useState(true);
  const [walled, setWalled] = useState(false); // үнэгүй хэсэг дууссан
  const [ended, setEnded] = useState(false);
  const [buffering, setBuffering] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<HlsLike | null>(null);
  const hideTimer = useRef<number | null>(null);
  const resumeAt = useRef(0);
  const wallTracked = useRef(false);
  const startTracked = useRef(false);

  const owned = !!series && (series.price <= 0 || hasVip(s) || s.purchased.includes(series.id));
  const status = series ? buyStatus(s, series.id) : "none";

  useEffect(() => {
    if (series) document.title = `${series.title} — Кино Мандал`;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [series]);

  // Эрх өөрчлөгдөх бүрд (нэвтрэх, төлбөр баталгаажих) хаягийг дахин авна.
  // Серверийн хаягт эрх нь суулгагдсан тул шинэ эрх = шинэ хаяг.
  useEffect(() => {
    if (!series || !s.authReady) return;
    let alive = true;
    const v = videoRef.current;
    // Одоо үзэж байсан цэгээ алдахгүй (төлсний дараа яг тэндээс)
    const saved = s.movieTime[series.id]?.t ?? 0;
    resumeAt.current = v && v.currentTime > 1 ? v.currentTime : saved;
    setFailed(false);
    void getMovieStream(series.id).then((st) => {
      if (!alive) return;
      if (!st) setFailed(true);
      else {
        setStream(st);
        if (st.entitled) setWalled(false);
      }
    });
    return () => {
      alive = false;
    };
    // movieTime-ийг зориуд хамааруулаагүй: секунд тутамд хаяг дахин авах шаардлагагүй
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series?.id, s.authReady, s.signedIn, owned]);

  // Хаягийг видеод холбоно: Safari/iPhone HLS-ийг өөрөө тоглуулдаг, бусад нь hls.js-ээр
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !stream) return;
    let cancelled = false;

    const start = () => {
      const limit = stream.previewSeconds;
      let at = resumeAt.current;
      // Үнэгүй хэсгээс цааш зогссон байсан бол хилийн өмнөхөн тавина
      if (limit !== null && at >= limit - 2) at = Math.max(0, limit - 2);
      // Төгсгөлд нь зогссон бол эхнээс
      if (v.duration && at > v.duration - 15) at = 0;
      if (at > 1) v.currentTime = at;
      v.playbackRate = speed;
      void v.play().catch(() => {
        // Дуутай автоматаар эхлэхийг хөтөч зөвшөөрөөгүй — дуугүй эхлүүлээд товч харуулна
        v.muted = true;
        setMuted(true);
        void v.play().catch(() => undefined);
      });
    };

    const playNative = () => {
      v.src = stream.url;
      v.addEventListener("loadedmetadata", start, { once: true });
    };

    // hls.js-ийг тэргүүнд: бүх Android/компьютер дээр нэг ижил, туршигдсан зан төлөвтэй.
    // iPhone-д MSE байхгүй тул зөвхөн тэнд хөтчийн өөрийн HLS-ийг ашиглана.
    const hasMse =
      typeof window !== "undefined" &&
      ("MediaSource" in window || "ManagedMediaSource" in window);
    if (!hasMse && v.canPlayType("application/vnd.apple.mpegurl")) {
      playNative();
    } else {
      void import("hls.js").then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          if (v.canPlayType("application/vnd.apple.mpegurl")) playNative();
          else setFailed(true);
          return;
        }
        const hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60 }) as unknown as HlsLike;
        hlsRef.current = hls;
        hls.on("hlsManifestParsed", start);
        hls.on("hlsError", (_e, data) => {
          if (!data.fatal) return;
          // Төлөөгүй үед хилээс цаашхи хэсгийг сервер хаадаг (403) — энэ нь алдаа биш,
          // төлбөрийн санал гарах ёстой мөч. Бусад тохиолдолд л алдаа гэж үзнэ.
          if (stream.previewSeconds !== null) setWalled(true);
          else setFailed(true);
        });
        hls.loadSource(stream.url);
        hls.attachMedia(v);
      });
    }

    return () => {
      cancelled = true;
      v.removeEventListener("loadedmetadata", start);
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
    // speed-ийг зориуд хамааруулаагүй: хурд солиход урсгалыг дахин холбохгүй
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream?.url]);

  // Хил дээр хүлээж байхад төлбөр баталгаажсан эсэхийг өөрөө шалгана —
  // хэрэглэгч юу ч дарахгүйгээр кино яг зогссон секундээсээ цааш тоглоно.
  const waitingPayment = walled && s.signedIn && (status === "pending" || s.subPending);
  useEffect(() => {
    if (!waitingPayment) return;
    const t = window.setInterval(() => void refreshAccount(), 8000);
    return () => window.clearInterval(t);
  }, [waitingPayment]);

  const flashControls = useCallback(() => {
    setShowCtl(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShowCtl(false), 3500);
  }, []);

  useEffect(() => {
    flashControls();
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [flashControls]);

  const limit = stream?.previewSeconds ?? null;
  // Төлөөгүй үед сервер зөвхөн үнэгүй хэсгийн жагсаалтыг өгдөг тул видеоны «урт»
  // ~15 минут гэж харагдана. Хүнд харин БҮТЭН киноны уртыг харуулна — юу авахаа мэдэг.
  const shownDur = limit !== null ? Math.max(series?.hls?.duration ?? 0, dur) : dur;

  function hitWall() {
    const v = videoRef.current;
    if (v) v.pause();
    setWalled(true);
    if (series && !wallTracked.current) {
      wallTracked.current = true;
      track("paywall_hit", series.id);
    }
  }

  function seekTo(t: number) {
    const v = videoRef.current;
    if (!v) return;
    let target = Math.max(0, Math.min(shownDur || 0, t));
    if (limit !== null && target >= Math.min(limit, (v.duration || limit) - 0.5)) {
      // Үнэгүй хэсгээс цааш гүйлгэх = төлбөрийн санал
      target = Math.max(0, Math.min(limit, v.duration || limit) - 1);
      v.currentTime = target;
      hitWall();
      return;
    }
    v.currentTime = target;
    setCur(target);
    setEnded(false);
    flashControls();
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v || walled) return;
    if (v.paused) void v.play();
    else v.pause();
    flashControls();
  }

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
    flashControls();
  }

  function unmute() {
    setMuted(false);
    if (videoRef.current) videoRef.current.muted = false;
  }

  async function toggleFullscreen() {
    const wrap = wrapRef.current;
    const v = videoRef.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (wrap?.requestFullscreen) {
        await wrap.requestFullscreen();
        if ((v?.videoWidth ?? 0) > (v?.videoHeight ?? 0)) {
          try {
            await (
              screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
            )?.lock?.("landscape");
          } catch {
            /* iPhone дэмждэггүй — гараар эргүүлнэ */
          }
        }
      } else v?.webkitEnterFullscreen?.();
    } catch {
      /* хэрэглэгч татгалзсан */
    }
    flashControls();
  }

  if (!series) {
    return (
      <div className="page center">
        <p>Кино олдсонгүй.</p>
        <Link className="btn" to="/">
          Нүүр хуудас
        </Link>
      </div>
    );
  }

  const previewPct =
    limit !== null && shownDur > 0 ? Math.min(100, (limit / shownDur) * 100) : null;

  return (
    <div className="movie-page">
      <div
        className="vplayer movie-player"
        ref={wrapRef}
        onMouseMove={flashControls}
        onClick={(e) => {
          // Товч, гүйлгэгч дээр дарсныг давхар тоолохгүй
          if ((e.target as HTMLElement).closest("button, input, a")) return;
          if (showCtl) togglePlay();
          else flashControls();
        }}
      >
        <video
          ref={videoRef}
          poster={series.poster}
          playsInline
          muted={muted}
          controlsList="nodownload"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          onPlay={() => {
            setPlaying(true);
            setEnded(false);
            if (!startTracked.current) {
              startTracked.current = true;
              track("watch_start", series.id);
            }
          }}
          onPause={() => setPlaying(false)}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
          onDurationChange={(e) => setDur(e.currentTarget.duration || 0)}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            setCur(v.currentTime);
            if (v.duration > 0) setMovieTime(series.id, v.currentTime, v.duration);
            if (limit !== null && v.currentTime >= limit && !walled) hitWall();
          }}
          onEnded={() => {
            // Төлөөгүй үед «дууссан» гэдэг нь үнэгүй хэсэг дууссан гэсэн үг
            if (limit !== null) hitWall();
            else {
              setEnded(true);
              setShowCtl(true);
            }
          }}
        />

        {buffering && !walled && !failed && !ended && (
          <span className="pay-spinner movie-spinner" />
        )}

        <div className={`movie-top ${showCtl || walled || ended ? "vctl-on" : ""}`}>
          <Link to={`/series/${series.id}`} className="back">
            ←
          </Link>
          <span className="movie-top-title">{series.title}</span>
        </div>

        {failed && (
          <div className="movie-overlay">
            <div className="lock-panel">
              <p className="muted">
                Бичлэгийг ачаалж чадсангүй. Сүлжээгээ шалгаад дахин оролдоно уу.
              </p>
              <button className="btn btn-primary" onClick={() => window.location.reload()}>
                Дахин оролдох
              </button>
            </div>
          </div>
        )}

        {walled && !failed && (
          <div className="movie-overlay">
            <div className="lock-panel">
              <h3>Үнэгүй хэсэг дууслаа</h3>
              <p className="muted">
                Үргэлжлэлийг яг эндээс нь үзнэ — төлбөр баталгаажмагц кино өөрөө цааш тоглоно.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (status !== "pending") track("buy_click", series.id);
                  openPurchase(series.id);
                }}
              >
                {status === "pending"
                  ? "⏳ Төлбөр хүлээгдэж байна — дансны мэдээлэл"
                  : `Үргэлжлүүлэн үзэх — ${formatPrice(series.price)}`}
              </button>
              <button className="btn btn-outline" onClick={openVip}>
                ⭐ Сарын эрх — бүх кино
              </button>
            </div>
          </div>
        )}

        {ended && !walled && (
          <div className="movie-overlay">
            <div className="lock-panel">
              <h3>Кино дууслаа 🎬</h3>
              <Link className="btn btn-primary" to="/">
                Бусад кино үзэх →
              </Link>
              {!hasVip(s) && (
                <button className="btn btn-outline" onClick={openVip}>
                  ⭐ Сарын эрх — бүх кино
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => seekTo(0)}>
                Дахин үзэх
              </button>
            </div>
          </div>
        )}

        {!walled && !ended && !failed && (
          <div className={`vctl ${showCtl ? "vctl-on" : ""}`}>
            <div className="vctl-row vctl-mid">
              <button
                className="vctl-btn"
                onClick={() => seekTo(cur - 10)}
                aria-label="10 секунд ухраах"
              >
                ⏪ 10
              </button>
              <button className="vctl-btn vctl-play" onClick={togglePlay}>
                {playing ? "⏸" : "▶"}
              </button>
              <button
                className="vctl-btn"
                onClick={() => seekTo(cur + 10)}
                aria-label="10 секунд урагшлах"
              >
                10 ⏩
              </button>
            </div>

            <div className="vctl-bottom">
              <span className="vctl-time">{fmt(cur)}</span>
              <input
                className="vctl-seek"
                type="range"
                min={0}
                max={shownDur || 0}
                step={1}
                value={Math.min(cur, shownDur || 0)}
                style={
                  previewPct !== null
                    ? {
                        // Үнэгүй хэсгийн хилийг цагийн шугам дээр харуулна
                        background: `linear-gradient(to right, rgba(255,255,255,.55) ${previewPct}%, rgba(255,255,255,.15) ${previewPct}%)`,
                      }
                    : undefined
                }
                onChange={(e) => seekTo(Number(e.target.value))}
              />
              <span className="vctl-time">{fmt(shownDur)}</span>
              <button className="vctl-mini" onClick={cycleSpeed}>
                {speed}×
              </button>
              <button className="vctl-mini" onClick={toggleFullscreen} aria-label="Бүтэн дэлгэц">
                ⛶
              </button>
            </div>
          </div>
        )}

        {muted && !walled && !ended && !failed && (
          <button className="movie-unmute" onClick={unmute}>
            🔊 Дуу асаах
          </button>
        )}
      </div>
    </div>
  );
}
