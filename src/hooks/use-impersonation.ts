import { useSyncExternalStore } from "react";

// Session-scoped "View as Client" toggle. Staff can enable this to see the
// portal exactly as the current workspace's client sees it. This is a UI-only
// preview — server RLS still trusts the caller's actual roles, so no server
// action changes behavior.
const KEY = "waveos.view-as-client";
const TIER_KEY = "waveos.preview-client-tier";

export type PreviewTier = "project_client" | "growth_90" | "retainer_full" | "social_management";

type Listener = () => void;
const listeners = new Set<Listener>();

function readSnapshot(): string {
  if (typeof window === "undefined") return "0:";
  return `${sessionStorage.getItem(KEY) === "1" ? "1" : "0"}:${sessionStorage.getItem(TIER_KEY) ?? ""}`;
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
  const snapshot = useSyncExternalStore(subscribe, readSnapshot, () => "0:");
  const [enabled, savedTier] = snapshot.split(":");
  const on = enabled === "1";
  const tier = (savedTier || null) as PreviewTier | null;
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
      if (readSnapshot().startsWith("1:")) {
        sessionStorage.removeItem(KEY);
        sessionStorage.removeItem(TIER_KEY);
      } else sessionStorage.setItem(KEY, "1");
      notify();
    },
  };
}
