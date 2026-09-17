import { useEffect, useState } from "react";
import { useAppState } from "../lib/store";
import { track } from "../lib/track";

// Chrome/Android «суулгах боломжтой» гэж мэдэгдэхдээ өгдөг үйл явдал
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "md-install-dismissed";
const DISMISS_DAYS = 14;

let deferred: InstallEvent | null = null;
const waiters = new Set<() => void>();

// Үйл явдал хуудас ачаалмагц ганц удаа ирдэг тул бүрэлдэхүүн хэсэг зурагдахаас ӨМНӨ барина
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    waiters.forEach((w) => w());
  });
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - at < DISMISS_DAYS * 86400000;
  } catch {
    return false;
  }
}

/**
 * «Дэлгэцэндээ нэмэх» урилга.
 *
 * Дэлгэц дээрээ дүрстэй хэрэглэгч эргэж ирэх магадлал хамаагүй өндөр — апп дэлгүүргүйгээр
 * авч болох хамгийн хямд «апп». Гэхдээ дөнгөж орж ирсэн хүнд шахвал зүгээр л хаадаг тул
 * ЗӨВХӨН ямар нэг кино үзэж эхэлсэн (сонирхсон) хүнд, 14 хоногт нэг удаа л харуулна.
 */
export function InstallPrompt() {
  const s = useAppState();
  const [ready, setReady] = useState(!!deferred);
  const [hidden, setHidden] = useState(true);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    const onReady = () => setReady(true);
    waiters.add(onReady);
    return () => {
      waiters.delete(onReady);
    };
  }, []);

  const engaged =
    Object.keys(s.movieTime).length > 0 || Object.values(s.progress).some((ep) => ep > 1);

  useEffect(() => {
    if (!engaged || isStandalone() || recentlyDismissed()) return;
    if (ready || isIos()) setHidden(false);
  }, [engaged, ready]);

  if (hidden) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* хувийн горим */
    }
    setHidden(true);
  }

  async function install() {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      deferred = null;
      if (choice.outcome === "accepted") {
        track("install");
        setHidden(true);
      }
      else dismiss();
    } else {
      // iPhone: Apple суулгах цонх гаргахыг зөвшөөрдөггүй — зааврыг харуулна
      setIosHelp(true);
    }
  }

  return (
    <div className="install-bar" role="dialog" aria-label="Дэлгэцэндээ нэмэх">
      <div className="install-text">
        <strong>📲 Кино Мандалыг дэлгэцэндээ нэм</strong>
        {iosHelp ? (
          <span className="muted small">
            Доод талын <b>Хуваалцах</b> (□↑) товчийг дараад <b>«Add to Home Screen»</b>-ийг сонгоно.
          </span>
        ) : (
          <span className="muted small">Апп шиг нэг товшилтоор нээгдэнэ — татах зүйлгүй</span>
        )}
      </div>
      {!iosHelp && (
        <button className="btn btn-primary install-btn" onClick={() => void install()}>
          Нэмэх
        </button>
      )}
      <button className="install-close" onClick={dismiss} aria-label="Хаах">
        ✕
      </button>
    </div>
  );
}
