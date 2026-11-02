// Duplicate-content fail-safe helpers. Pure (no app imports) so unit tests can
// load them directly. Signed media URLs are never fingerprinted because they
// change on every publish; stable media asset ids are used instead.

export type PublishFingerprintInput = {
  workspaceId: string;
  platform: string;
  accountIds: string[];
  caption: string;
  mediaAssetIds: string[];
  contentType: string | null;
};

export const DUPLICATE_GUARD_WINDOW_MS = 24 * 60 * 60 * 1000;
export const DUPLICATE_GUARD_ERROR_CODE = "duplicate_guard";

/** Canonical, key-ordered serialization of the stable publish fields. */
export function publishFingerprintSource(input: PublishFingerprintInput) {
  return JSON.stringify([
    "waveos-publish-v1",
    input.workspaceId,
    input.platform,
    [...new Set(input.accountIds)].sort(),
    input.caption,
    [...input.mediaAssetIds],
    input.contentType ?? null,
  ]);
}

/** Deterministic SHA-256 hex fingerprint of one prepared platform request. */
export async function publishFingerprint(input: PublishFingerprintInput) {
  const bytes = new TextEncoder().encode(publishFingerprintSource(input));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type PriorPublishAttempt = {
  id: string;
  content_item_id: string;
  platform: string;
  status: string;
  attempted_at: string;
  post_url: string | null;
  unpublished_at: string | null;
  fingerprint: string | null;
};

export type DuplicateGuardMatch = {
  platform: string;
  existingAttemptId: string;
  attemptedAt: string;
  postUrl: string | null;
};

/**
 * Which prepared requests would repeat a live post from a different content
 * item in the last 24 hours. Same-item retries, removed posts, changed
 * caption/media/accounts and older posts are never blocked.
 */
export function findDuplicatePublishes(input: {
  contentItemId: string;
  prepared: Array<{ platform: string; fingerprint: string }>;
  prior: PriorPublishAttempt[];
  now?: number;
  allowDuplicate?: boolean;
}): DuplicateGuardMatch[] {
  if (input.allowDuplicate) return [];
  const since = (input.now ?? Date.now()) - DUPLICATE_GUARD_WINDOW_MS;
  const matches: DuplicateGuardMatch[] = [];
  for (const request of input.prepared) {
    const existing = input.prior
      .filter(
        (row) =>
          row.platform === request.platform &&
          row.fingerprint === request.fingerprint &&
          row.status === "success" &&
          !row.unpublished_at &&
          row.content_item_id !== input.contentItemId &&
          Date.parse(row.attempted_at) >= since,
      )
      .sort((a, b) => Date.parse(b.attempted_at) - Date.parse(a.attempted_at))[0];
    if (existing)
      matches.push({
        platform: request.platform,
        existingAttemptId: existing.id,
        attemptedAt: existing.attempted_at,
        postUrl: existing.post_url,
      });
  }
  return matches;
}
