import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { SocialPlatform } from "@/hooks/use-content";

const ZERNIO_BASE_URL = "https://zernio.com/api/v1";

export type ZernioAccount = {
  id: string;
  profileId: string | null;
  platform: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  connected: boolean;
  status: string;
  raw: Record<string, unknown>;
};

export function zernioConfigured() {
  return Boolean(process.env.ZERNIO_API_KEY);
}

export async function zernioRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const apiKey = process.env.ZERNIO_API_KEY;
  if (!apiKey) throw new Error("Zernio is not configured. Add ZERNIO_API_KEY first.");
  const response = await fetch(`${ZERNIO_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { message: text };
  }
  if (!response.ok) {
    const message = String(
      body.message ?? body.error ?? body.code ?? `Zernio returned HTTP ${response.status}.`,
    );
    const error = new Error(message) as Error & {
      status?: number;
      code?: string;
      details?: unknown;
    };
    error.status = response.status;
    error.code = typeof body.code === "string" ? body.code : undefined;
    error.details = body;
    throw error;
  }
  return body as T;
}

export async function verifyZernioApiKey() {
  try {
    await zernioRequest<Record<string, unknown>>("/users");
    return { configured: true, reachable: true, error: null };
  } catch (reason) {
    return {
      configured: zernioConfigured(),
      reachable: false,
      error: reason instanceof Error ? reason.message : "Zernio verification failed.",
    };
  }
}

export function toZernioPlatform(platform: SocialPlatform) {
  if (platform === "x") return "twitter";
  if (platform === "gmb") return "googlebusiness";
  return platform;
}

export function fromZernioPlatform(platform: string): SocialPlatform | null {
  const mapped = platform === "twitter" ? "x" : platform === "googlebusiness" ? "gmb" : platform;
  const supported: SocialPlatform[] = [
    "instagram",
    "facebook",
    "tiktok",
    "youtube",
    "linkedin",
    "x",
    "pinterest",
    "threads",
    "bluesky",
    "gmb",
    "snapchat",
  ];
  return supported.includes(mapped as SocialPlatform) ? (mapped as SocialPlatform) : null;
}

export function normalizeZernioAccounts(payload: Record<string, unknown>): ZernioAccount[] {
  const entries = Array.isArray(payload.accounts)
    ? payload.accounts
    : Array.isArray(payload.data)
      ? payload.data
      : [];
  return entries
    .map((entry): ZernioAccount | null => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const id = String(row._id ?? row.id ?? row.accountId ?? "");
      const platform = String(row.platform ?? "").toLowerCase();
      if (!id || !platform) return null;
      const status = String(row.status ?? row.platformStatus ?? "connected").toLowerCase();
      const connected =
        row.enabled !== false && !["disconnected", "expired", "error"].includes(status);
      return {
        id,
        profileId: typeof row.profileId === "string" ? row.profileId : null,
        platform,
        username: stringOrNull(row.username ?? row.userName),
        displayName: stringOrNull(row.displayName ?? row.name),
        avatarUrl: stringOrNull(row.avatarUrl ?? row.profilePicture ?? row.userImage),
        connected,
        status,
        raw: row,
      };
    })
    .filter((account): account is ZernioAccount => Boolean(account));
}

export async function requireSocialWorkspaceAccess(
  supabase: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
) {
  const [{ data: member }, { data: roles }, { data: entitled }] = await Promise.all([
    supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.rpc("has_feature", { _workspace_id: workspaceId, _feature: "can_connect_socials" }),
  ]);
  const isStaff = (roles ?? []).some(
    (role) => role.role === "dream_wave_owner" || role.role === "dream_wave_team",
  );
  if ((!member && !isStaff) || !entitled) throw new Error("forbidden");
  return { isStaff };
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
