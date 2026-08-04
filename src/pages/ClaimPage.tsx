import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { claimAccess } from "../lib/store";

// Бүртгүүлж чаддаггүй хэрэглэгчид зориулсан «нэвтрэх линк».
// Линк дээр дарахад л кино нээгдэнэ — утас, нууц үг, бүртгэл шаардахгүй.
export function ClaimPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Кино нээж байна…");
  const [failed, setFailed] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;

    void claimAccess(token).then((res) => {
      if (res.ok) {
        setMsg("Нээгдлээ! Тоглуулж байна…");
        setTimeout(() => {
          if (res.seriesId) navigate(`/watch/${res.seriesId}/1`, { replace: true });
          else navigate("/", { replace: true });
        }, 700);
      } else {
        setFailed(res.reason ?? "Тодорхойгүй алдаа гарлаа.");
      }
    });
  }, [token, navigate]);

  return (
    <div className="page center claim-page">
      {failed ? (
        <>
          <h2>Линк ажиллахгүй байна</h2>
          <p className="muted">{failed}</p>
          <button className="btn btn-primary" onClick={() => navigate("/")}>
            Нүүр хуудас руу очих
          </button>
        </>
      ) : (
        <>
          <span className="pay-spinner claim-spinner" />
          <p className="muted">{msg}</p>
        </>
      )}
    </div>
  );
}
