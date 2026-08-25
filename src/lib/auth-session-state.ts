const AUTH_USER_KEY = "waveos.auth-user-id";
const ACTIVE_WORKSPACE_KEY = "waveos.active-workspace";
const SESSION_IDENTITY_KEYS = [
  "waveos.acting-staff",
  "waveos.view-as-client",
  "waveos.preview-client-tier",
] as const;

function clearIdentityOverrides() {
  for (const key of SESSION_IDENTITY_KEYS) sessionStorage.removeItem(key);
  localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
}

/**
 * Bind browser-only workspace/preview state to the authenticated Supabase user.
 * A different user in the same tab must never inherit staff acting mode, client
 * preview mode, or the prior account's active workspace.
 */
export function bindAuthenticatedBrowserState(userId: string) {
  const previousUserId = sessionStorage.getItem(AUTH_USER_KEY);
  if (previousUserId !== userId) clearIdentityOverrides();
  sessionStorage.setItem(AUTH_USER_KEY, userId);
}

/** Clear all identity-sensitive browser state before or after sign-out. */
export function clearAuthenticatedBrowserState() {
  clearIdentityOverrides();
  sessionStorage.removeItem(AUTH_USER_KEY);
}
