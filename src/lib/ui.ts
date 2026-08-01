// Цэнэглэх цонхыг аль ч хуудаснаас нээх боломжтой жижиг UI store
import { useSyncExternalStore } from "react";

let topupOpen = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function useTopupOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => topupOpen,
  );
}

export function openTopup() {
  topupOpen = true;
  notify();
}

export function closeTopup() {
  topupOpen = false;
  notify();
}
