import { useMemo, useSyncExternalStore } from "react";

const KEY = "waveos.acting-staff";

type StaffType = "sales" | "media_manager" | null;

export interface ActingStaffIdentity {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  staffType: StaffType;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function readRaw(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(KEY) ?? "";
}

function parse(raw: string): ActingStaffIdentity | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ActingStaffIdentity;
    return parsed?.userId ? parsed : null;
  } catch {
    return null;
  }
}

export function getActingStaff(): ActingStaffIdentity | null {
  return parse(readRaw());
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function useActingStaff() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  const identity = useMemo(() => parse(raw), [raw]);
  return {
    on: Boolean(identity),
    identity,
    enable(next: ActingStaffIdentity) {
      sessionStorage.setItem(KEY, JSON.stringify(next));
      notify();
    },
    disable() {
      sessionStorage.removeItem(KEY);
      notify();
    },
  };
}
