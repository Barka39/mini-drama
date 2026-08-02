import { useAppState } from "../lib/store";
import { openAuth } from "../lib/ui";

export function AccountBadge() {
  const s = useAppState();

  if (!s.signedIn) {
    return (
      <button className="coin-badge" onClick={openAuth}>
        Нэвтрэх
      </button>
    );
  }

  return <span className="coin-badge">👤 {s.phone}</span>;
}
