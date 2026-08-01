// Цэнэглэх/нэвтрэх цонхыг аль ч хуудаснаас нээх боломжтой жижиг UI store
import { useSyncExternalStore } from "react";

type ModalName = "topup" | "auth" | null;

let openModal: ModalName = null;
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

export function openTopup() {
  openModal = "topup";
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

// Хуучин нэрээр дуудсан газруудад зориулсан alias
export const closeTopup = closeModals;
