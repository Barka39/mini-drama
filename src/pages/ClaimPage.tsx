import { useEffect, useState } from "react";
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
}

export function ClaimPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const s = useAppState();
  const catalog = useCatalog();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

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
    const res = await claimAccess(token);
    if (res.ok) {
      const target = catalog.find((c) => c.id === res.seriesId);
      navigate(target ? watchPath(target) : "/", { replace: true });
    } else {
      setBusy(false);
      setFailed(res.reason ?? "Тодорхойгүй алдаа гарлаа.");
    }
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

  if (!preview || alreadyOwned) {
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
