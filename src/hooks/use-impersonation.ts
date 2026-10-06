import { useSyncExternalStore } from "react";

// Session-scoped "View as Client" toggle. Staff can enable this to see the
// portal exactly as the current workspace's client sees it. This is a UI-only
// preview — server RLS still trusts the caller's actual roles, so no server
// action changes behavior.
const KEY = "waveos.view-as-client";
const TIER_KEY = "waveos.preview-client-tier";
const ROLE_KEY = "waveos.preview-client-role";
const NAME_KEY = "waveos.preview-client-name";
const EMAIL_KEY = "waveos.preview-client-email";

export type PreviewTier =
  "project_client" | "growth_90" | "retainer_full" | "social_management" | "wedding_client";
export type PreviewClientRole = "owner" | "admin" | "editor" | "approver" | "viewer";

export type PreviewClientIdentity = {
  role?: PreviewClientRole;
  name?: string;
  email?: string;
};

type Listener = () => void;
const listeners = new Set<Listener>();

function readSnapshot(): string {
  if (typeof window === "undefined") return JSON.stringify({ on: false });
  return JSON.stringify({
    on: sessionStorage.getItem(KEY) === "1",
    tier: sessionStorage.getItem(TIER_KEY),
    role: sessionStorage.getItem(ROLE_KEY),
    name: sessionStorage.getItem(NAME_KEY),
    email: sessionStorage.getItem(EMAIL_KEY),
  });
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
  const snapshot = useSyncExternalStore(subscribe, readSnapshot, () =>
    JSON.stringify({ on: false }),
  );
  const saved = JSON.parse(snapshot) as {
    on: boolean;
    tier?: string | null;
    role?: string | null;
    name?: string | null;
    email?: string | null;
  };
  const on = saved.on;
  const tier = (saved.tier || null) as PreviewTier | null;
  const role = (saved.role || "admin") as PreviewClientRole;
  return {
    on,
    tier,
    role,
    name: saved.name || null,
    email: saved.email || null,
    enable(previewTier?: PreviewTier, identity: PreviewClientIdentity = {}) {
      sessionStorage.setItem(KEY, "1");
      if (previewTier) sessionStorage.setItem(TIER_KEY, previewTier);
      else sessionStorage.removeItem(TIER_KEY);
      sessionStorage.setItem(ROLE_KEY, identity.role ?? "admin");
      if (identity.name) sessionStorage.setItem(NAME_KEY, identity.name);
      else sessionStorage.removeItem(NAME_KEY);
      if (identity.email) sessionStorage.setItem(EMAIL_KEY, identity.email);
      else sessionStorage.removeItem(EMAIL_KEY);
      notify();
    },
    disable() {
      [KEY, TIER_KEY, ROLE_KEY, NAME_KEY, EMAIL_KEY].forEach((key) =>
        sessionStorage.removeItem(key),
      );
      notify();
    },
    setTier(previewTier: PreviewTier) {
      sessionStorage.setItem(KEY, "1");
      sessionStorage.setItem(TIER_KEY, previewTier);
      notify();
    },
    toggle() {
      if (on) {
        [KEY, TIER_KEY, ROLE_KEY, NAME_KEY, EMAIL_KEY].forEach((key) =>
          sessionStorage.removeItem(key),
        );
      } else {
        sessionStorage.setItem(KEY, "1");
        sessionStorage.setItem(ROLE_KEY, "admin");
      }
      notify();
    },
  };
}
