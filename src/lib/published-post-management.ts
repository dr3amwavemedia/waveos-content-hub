// Rules for managing one already-published platform post. Pure (no app imports)
// so the server function, the publish-result dialogs and tests share them.
//
// Removal is stored without extra columns: a reserved `_waveos` object is merged
// into publish_attempts.response_snapshot, next to the provider's own fields.

/**
 * Platforms Zernio can delete through POST /v1/posts/{postId}/unpublish, in
 * both WaveOS and Zernio spellings. Instagram, TikTok and Snapchat are not
 * supported by Zernio unpublish.
 */
export const ZERNIO_UNPUBLISH_PLATFORMS = [
  "facebook",
  "threads",
  "x",
  "twitter",
  "linkedin",
  "youtube",
  "pinterest",
  "reddit",
  "bluesky",
  "gmb",
  "googlebusiness",
  "telegram",
] as const;

export const UNPUBLISH_CONFIRMATION = "REMOVE";

export function platformSupportsUnpublish(platform: string | null | undefined) {
  return (
    typeof platform === "string" &&
    (ZERNIO_UNPUBLISH_PLATFORMS as readonly string[]).includes(platform)
  );
}

export function isUnpublishConfirmation(value: unknown) {
  return value === UNPUBLISH_CONFIRMATION;
}

export function unsupportedUnpublishMessage(platformLabel: string) {
  return `WaveOS can't remove posts from ${platformLabel}. Open the post and remove it on ${platformLabel}.`;
}

export type UnpublishedMarker = {
  unpublishedAt: string;
  unpublishedBy: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Reads the `_waveos` removal marker from a stored response snapshot. */
export function readUnpublishedMarker(snapshot: unknown): UnpublishedMarker | null {
  if (!isRecord(snapshot)) return null;
  const marker = snapshot._waveos;
  if (!isRecord(marker)) return null;
  const at = marker.unpublishedAt;
  if (typeof at !== "string" || Number.isNaN(Date.parse(at))) return null;
  return {
    unpublishedAt: at,
    unpublishedBy: typeof marker.unpublishedBy === "string" ? marker.unpublishedBy : null,
  };
}

/**
 * Returns the snapshot with the removal marker merged in. Existing provider
 * fields are kept; a non-object snapshot is kept under `providerResponse`.
 */
export function withUnpublishedMarker(
  snapshot: unknown,
  marker: { unpublishedAt: string; unpublishedBy: string; unpublishResponse: unknown },
) {
  const base = isRecord(snapshot)
    ? { ...snapshot }
    : snapshot === null || snapshot === undefined
      ? {}
      : { providerResponse: snapshot };
  const existing = isRecord(base._waveos) ? base._waveos : {};
  return { ...base, _waveos: { ...existing, ...marker } };
}

export type ManagedAttempt = {
  platform: string;
  provider: string | null;
  provider_post_id: string | null;
  status: string;
  post_url: string | null;
  response_snapshot: unknown;
};

/** Server-side eligibility; returns a user-readable reason when not allowed. */
export function unpublishBlockReason(attempt: ManagedAttempt, platformLabel: string) {
  if (readUnpublishedMarker(attempt.response_snapshot))
    return `This post was already removed from ${platformLabel}.`;
  if (attempt.status !== "success") return "Only successfully published posts can be removed.";
  if (!platformSupportsUnpublish(attempt.platform))
    return unsupportedUnpublishMessage(platformLabel);
  if (attempt.provider !== "zernio" || !attempt.provider_post_id)
    return "This post has no Zernio post reference, so WaveOS can't remove it.";
  return null;
}

const httpsUrl = (value: string | null) => {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

/** What the publish-result dialog offers for one attempt. */
export function publishedAttemptActions(attempt: ManagedAttempt) {
  const removedMarker = readUnpublishedMarker(attempt.response_snapshot);
  const published = attempt.status === "success";
  const live = published && !removedMarker;
  const supported = platformSupportsUnpublish(attempt.platform);
  return {
    removed: published && Boolean(removedMarker),
    removedAt: removedMarker?.unpublishedAt ?? null,
    canOpen: live && httpsUrl(attempt.post_url),
    canRemove:
      live && supported && attempt.provider === "zernio" && Boolean(attempt.provider_post_id),
    removeUnsupported: live && !supported,
  };
}
