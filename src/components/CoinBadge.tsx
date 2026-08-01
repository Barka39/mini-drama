import { useAppState } from "../lib/store";
import { openAuth, openTopup } from "../lib/ui";

export function CoinBadge() {
  const s = useAppState();

  if (!s.signedIn) {
    return (
      <button className="coin-badge" onClick={openAuth}>
        Нэвтрэх
      </button>
    );
  }

  return (
    <button className="coin-badge" onClick={openTopup}>
      🪙 {s.coins}
    </button>
  );
}
