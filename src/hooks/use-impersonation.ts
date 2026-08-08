import { useSyncExternalStore } from "react";

// Session-scoped "View as Client" toggle. Staff can enable this to see the
// portal exactly as the current workspace's client sees it. This is a UI-only
// preview — server RLS still trusts the caller's actual roles, so no server
// action changes behavior.
const KEY = "waveos.view-as-client";
const TIER_KEY = "waveos.preview-client-tier";

export type PreviewTier = "project_client" | "growth_90" | "retainer_full";

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
  const tier =
    typeof window === "undefined" ? null : (sessionStorage.getItem(TIER_KEY) as PreviewTier | null);
  return {
    on,
    tier,
    enable(previewTier?: PreviewTier) {
      sessionStorage.setItem(KEY, "1");
      if (previewTier) sessionStorage.setItem(TIER_KEY, previewTier);
      else sessionStorage.removeItem(TIER_KEY);
      notify();
    },
    disable() {
      sessionStorage.removeItem(KEY);
      sessionStorage.removeItem(TIER_KEY);
      notify();
    },
    setTier(previewTier: PreviewTier) {
      sessionStorage.setItem(KEY, "1");
      sessionStorage.setItem(TIER_KEY, previewTier);
      notify();
    },
    toggle() {
      if (read()) {
        sessionStorage.removeItem(KEY);
        sessionStorage.removeItem(TIER_KEY);
      } else sessionStorage.setItem(KEY, "1");
      notify();
    },
  };
}
