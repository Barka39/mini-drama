import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { formatDuration, totalSeconds, watchPath } from "../data/catalog";
import { useCatalog } from "../lib/seriesAdmin";
import { claimAccess, useAppState } from "../lib/store";
import { supa } from "../lib/supa";

// Бүртгүүлж чаддаггүй хэрэглэгчид зориулсан «нэвтрэх линк».
// Утас, нууц үг, бүртгэл шаардахгүй — гэхдээ эрхийг хүн ТОВЧ ДАРАХАД л олгоно.
//
// Яагаад товч вэ: Messenger-ээр линк явуулмагц Facebook-ийн аюулгүй байдлын робот
// хуудсыг JavaScript-тэй нь нээдэг. Өмнө нь хуудас нээгдмэгц эрх нэхэмжилдэг байсан
// тул робот бүр нэг «төхөөрөмж» зарцуулж, линк хүнд хүрэхээс өмнө дүүрдэг байв
// (2026-09 сард 15 нэхэмжлэлийн 10 нь робот). Робот хуудас уншдаг, товч дардаггүй.

const REASONS: Record<string, string> = {
  bad_link: "Ийм линк олдсонгүй. Хаягаа бүрэн хуулсан эсэхээ шалгана уу.",
  revoked: "Энэ линк хүчингүй болсон байна. Илгээсэн хүнээсээ шинэ линк хүсээрэй.",
  expired: "Энэ линкийн хугацаа дууссан байна.",
};

interface Preview {
  ok: boolean;
  reason?: string;
  series_id?: string | null;
  plan_days?: number | null;
  full?: boolean;
  // QPay-ийн дараа буцах линк (төлбөрийн захиалгад холбогдсон), төлөгдсөн эсэх
  pay?: boolean;
  paid?: boolean;
}

export function ClaimPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const s = useAppState();
  const catalog = useCatalog();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // Төлбөрийн линк: QPay-ийн мэдэгдэл ирэхийг хүлээж байна
  const [waitingPay, setWaitingPay] = useState(false);
  const autoStarted = useRef(false);
  // Хуудаснаас гарсны дараа хүлээлтийн давталт зогсох ёстой (өөр хуудас руу чирэхгүй)
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    void supa.rpc("md_link_preview", { p_token: token }).then(({ data, error }) => {
      if (error || !data) setFailed("Линкийг шалгаж чадсангүй. Сүлжээгээ шалгаад дахин нээнэ үү.");
      else setPreview(data as Preview);
    });
  }, [token]);

  const series = preview?.series_id ? catalog.find((c) => c.id === preview.series_id) : undefined;

  // Энэ төхөөрөмж аль хэдийн нээсэн бол (дахин орж ирсэн) товч хэрэггүй — шууд үзнэ.
  // Нэхэмжлэх шаардлагагүй тул робот ч, хүн ч тоолуурыг зарцуулахгүй.
  const alreadyOwned = !!series && s.purchased.includes(series.id);
  useEffect(() => {
    if (alreadyOwned && series) navigate(watchPath(series), { replace: true });
  }, [alreadyOwned, series, navigate]);

  async function watch() {
    if (!token) return;
    setBusy(true);
    // Төлбөрийн линк: мэдэгдэл хэдэн секунд хоцорч болно — 3 сек тутам ~3 минут шалгана
    for (let i = 0; ; i++) {
      const res = await claimAccess(token);
      if (!alive.current) return;
      if (res.ok) {
        const target = catalog.find((c) => c.id === res.seriesId);
        navigate(target ? watchPath(target) : "/", { replace: true });
        return;
      }
      if (res.notPaidYet && i < 60) {
        setWaitingPay(true);
        await new Promise((r) => setTimeout(r, 3000));
        if (!alive.current) return;
        continue;
      }
      setBusy(false);
      setWaitingPay(false);
      setFailed(
        res.notPaidYet
          ? "Төлбөр хараахан баталгаажаагүй байна. Төлсөн бол хэдэн минутын дараа энэ хуудсыг дахин нээнэ үү."
          : (res.reason ?? "Тодорхойгүй алдаа гарлаа."),
      );
      return;
    }
  }

  // QPay-ийн дараа буцаж ирсэн хүн: товч дарах шаардлагагүй, шууд нээнэ.
  // (Энэ линкийг Messenger-ээр тараадаггүй тул роботын асуудал байхгүй.)
  useEffect(() => {
    if (!preview?.ok || !preview.pay || alreadyOwned || autoStarted.current || !s.authReady) return;
    autoStarted.current = true;
    void watch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, alreadyOwned, s.authReady]);

  if (waitingPay) {
    return (
      <div className="page center claim-page">
        <span className="pay-spinner claim-spinner" />
        <h2 className="claim-title">Төлбөрийг баталгаажуулж байна…</h2>
        <p className="muted small">Ихэвчлэн хэдхэн секунд. Энэ хуудсыг бүү хаагаарай.</p>
      </div>
    );
  }

  const reason = failed ?? (preview && !preview.ok ? REASONS[preview.reason ?? ""] ?? "Линк ажиллахгүй байна." : null);

  if (reason) {
    return (
      <div className="page center claim-page">
        <h2>Линк ажиллахгүй байна</h2>
        <p className="muted">{reason}</p>
        <button className="btn btn-primary" onClick={() => navigate("/")}>
          Бусад кино үзэх
        </button>
      </div>
    );
  }

  if (!preview || alreadyOwned || (preview.pay && busy)) {
    return (
      <div className="page center claim-page">
        <span className="pay-spinner claim-spinner" />
      </div>
    );
  }

  return (
    <div className="page center claim-page">
      {series ? (
        <>
          <img className="claim-poster" src={series.poster} alt={series.title} />
          <p className="muted small">Танд кино илгээсэн байна</p>
          <h2 className="claim-title">{series.title}</h2>
          <p className="muted small">{formatDuration(totalSeconds(series))} · бүтэн кино</p>
        </>
      ) : (
        <>
          <p className="muted small">Танд илгээсэн байна</p>
          <h2 className="claim-title">
            {preview.plan_days ? `${preview.plan_days} хоногийн эрх` : "Кино"}
          </h2>
        </>
      )}

      <button className="btn btn-primary claim-btn" disabled={busy} onClick={() => void watch()}>
        {busy ? "Нээж байна…" : "▶ Киног үзэх"}
      </button>
      <p className="muted small">Бүртгэл, нууц үг шаардахгүй</p>
    </div>
  );
}
