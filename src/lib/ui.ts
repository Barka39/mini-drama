// Худалдан авах/нэвтрэх цонхыг аль ч хуудаснаас нээх боломжтой жижиг UI store
import { useSyncExternalStore } from "react";

type ModalName = "purchase" | "auth" | "vip" | null;

let openModal: ModalName = null;
let purchaseSeriesId: string | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function useOpenModal(): ModalName {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => openModal,
  );
}

export function usePurchaseSeriesId(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => purchaseSeriesId,
  );
}

export function openPurchase(seriesId: string) {
  purchaseSeriesId = seriesId;
  openModal = "purchase";
  notify();
}

export function openVip() {
  openModal = "vip";
  notify();
}

export function openAuth() {
  openModal = "auth";
  notify();
}

export function closeModals() {
  openModal = null;
  notify();
}
