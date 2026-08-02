import { useState } from "react";
import { signIn, signUp } from "../lib/store";
import { closeModals, useOpenModal } from "../lib/ui";

export function AuthModal() {
  const open = useOpenModal() === "auth";
  const [mode, setMode] = useState<"in" | "up">("in");
  const [phone, setPhone] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  async function submit() {
    setBusy(true);
    setErr(null);
    const res = mode === "in" ? await signIn(phone, pass) : await signUp(phone, pass);
    setBusy(false);
    if (res.ok) {
      closeModals();
      setPhone("");
      setPass("");
    } else {
      setErr(res.reason);
    }
  }

  return (
    <div className="modal-backdrop" onClick={closeModals}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{mode === "in" ? "Нэвтрэх" : "Бүртгүүлэх"}</h3>
        <p className="muted small">
          Худалдаж авсан кинонууд тань утасны дугаартаа холбогдоно — өөр төхөөрөмжөөс ч нэвтэрч
          үзэж болно.
        </p>

        <input
          className="code-input"
          type="tel"
          placeholder="Утасны дугаар (8 орон)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoFocus
        />
        <input
          className="code-input"
          type="password"
          placeholder="Нууц үг (6+ тэмдэгт)"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && submit()}
        />

        {err && <p className="msg-err">{err}</p>}

        <button className="btn btn-primary" onClick={submit} disabled={busy || !phone || !pass}>
          {busy ? "Түр хүлээнэ үү…" : mode === "in" ? "Нэвтрэх" : "Бүртгүүлэх"}
        </button>

        <button
          className="btn btn-ghost"
          onClick={() => {
            setMode(mode === "in" ? "up" : "in");
            setErr(null);
          }}
        >
          {mode === "in" ? "Шинэ хэрэглэгч үү? Бүртгүүлэх" : "Бүртгэлтэй юу? Нэвтрэх"}
        </button>
      </div>
    </div>
  );
}
