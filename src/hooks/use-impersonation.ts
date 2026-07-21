import { useSyncExternalStore } from "react";

// Session-scoped "View as Client" toggle. Staff can enable this to see the
// portal exactly as the current workspace's client sees it. This is a UI-only
// preview — server RLS still trusts the caller's actual roles, so no server
// action changes behavior.
const KEY = "waveos.view-as-client";

type Listener = () => void;
const listeners = new Set<Listener>();

function read(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(KEY) === "1";
}
function subscribe(l: Listener) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) l();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}
function notify() {
  listeners.forEach((l) => l());
}

export function useImpersonateClient() {
  const on = useSyncExternalStore(subscribe, read, () => false);
  return {
    on,
    enable() {
      sessionStorage.setItem(KEY, "1");
      notify();
    },
    disable() {
      sessionStorage.removeItem(KEY);
      notify();
    },
    toggle() {
      if (read()) sessionStorage.removeItem(KEY);
      else sessionStorage.setItem(KEY, "1");
      notify();
    },
  };
}
