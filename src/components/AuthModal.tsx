import { useEffect, useState } from "react";
import { signIn, signUp, useAppState } from "../lib/store";
import { authOptions, closeModals, finishAuth, useOpenModal } from "../lib/ui";

export function AuthModal() {
  const open = useOpenModal() === "auth";
  const s = useAppState();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [err, setErr] = useState<string | null>(null);

  // Цонх нээгдэх бүрд дуудсан газрын хүссэн хуудаснаас эхэлнэ (анхдагч «Нэвтрэх»)
  useEffect(() => {
    if (open) {
      setMode(authOptions().mode);
      setErr(null);
    }
  }, [open]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function submit() {
    setBusy(true);
    setErr(null);
    const res = mode === "in" ? await signIn(phone, pass) : await signUp(phone, pass, name);
    setBusy(false);
    if (res.ok) {
      finishAuth();
      setPhone("");
      setPass("");
      setName("");
    } else {
      setErr(res.reason);
    }
  }

  function switchTo(next: "in" | "up") {
    setMode(next);
    setErr(null);
  }

  const canSubmit = phone && pass && (mode === "in" || name.trim());

  return (
    <div className="modal-backdrop" onClick={closeModals}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === "in" ? "auth-tab-on" : ""}`}
            onClick={() => switchTo("in")}
          >
            Нэвтрэх
          </button>
          <button
            className={`auth-tab ${mode === "up" ? "auth-tab-on" : ""}`}
            onClick={() => switchTo("up")}
          >
            Бүртгүүлэх
          </button>
        </div>

        <p className="muted small">
          {mode === "in"
            ? "Бүртгэлтэй дугаараараа нэвтэрнэ үү."
            : "Худалдаж авсан кинонууд тань утасны дугаартаа холбогдоно — өөр төхөөрөмжөөс ч нэвтэрч үзэж болно."}
        </p>

        {s.guest && (
          <p className="hint-box">
            🎬 Энэ утсан дээр авсан кинонууд тань бүртгэлд тань автоматаар шилжинэ.
          </p>
        )}

        {mode === "up" && (
          <input
            className="code-input"
            placeholder="Таны нэр"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        )}
        <input
          className="code-input"
          type="tel"
          placeholder="Утасны дугаар (8 орон)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoFocus={mode === "in"}
        />
        <input
          className="code-input"
          type="password"
          placeholder={mode === "up" ? "Нууц үг зохионо уу (6+ орон)" : "Нууц үг"}
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && canSubmit && submit()}
        />

        {mode === "up" && (
          <p className="hint-box">
            💡 Нууц үгээ <strong>өөрөө зохионо</strong> — сануулгын мессеж илгээхгүй. Дараа
            нэвтрэхэд энэ нууц үг хэрэгтэй тул санаж аваарай.
          </p>
        )}

        {err && <p className="msg-err">{err}</p>}

        <button className="btn btn-primary" onClick={submit} disabled={busy || !canSubmit}>
          {busy ? "Түр хүлээнэ үү…" : mode === "in" ? "Нэвтрэх" : "Бүртгүүлэх"}
        </button>

        <button className="btn btn-ghost" onClick={closeModals}>
          Хаах
        </button>
      </div>
    </div>
  );
}
