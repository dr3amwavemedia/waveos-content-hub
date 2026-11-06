export const GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export type GoogleRefreshOutcome =
  | { kind: "ok"; accessToken: string; scopes: string | null }
  | { kind: "insufficient_scope"; scopes: string }
  | { kind: "reconnect" }
  | { kind: "temporary" };

/**
 * Classifies a Google refresh-token response. Google may omit `scope` on
 * refresh; an absent or blank scope keeps the stored scopes unchanged. Only an
 * explicit scope list without drive.file, or a revoked/invalid grant, requires
 * reconnecting. Server errors, rate limits and malformed bodies are temporary
 * and never change the stored connection.
 */
export function classifyGoogleRefresh(status: number, body: unknown): GoogleRefreshOutcome {
  const json = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (status >= 200 && status < 300) {
    if (typeof json.access_token !== "string" || !json.access_token) return { kind: "temporary" };
    const raw = typeof json.scope === "string" ? json.scope.trim() : "";
    if (!raw) return { kind: "ok", accessToken: json.access_token, scopes: null };
    if (!raw.split(/\s+/).includes(GOOGLE_DRIVE_FILE_SCOPE)) {
      return { kind: "insufficient_scope", scopes: raw };
    }
    return { kind: "ok", accessToken: json.access_token, scopes: raw };
  }
  if (status === 400 || status === 401) {
    const error = typeof json.error === "string" ? json.error : "";
    if (error === "invalid_grant" || error === "unauthorized_client" || status === 401) {
      return { kind: "reconnect" };
    }
  }
  return { kind: "temporary" };
}
