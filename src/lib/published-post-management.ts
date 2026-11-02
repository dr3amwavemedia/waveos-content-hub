// Rules for managing an already-published platform post. Pure (no app imports)
// so the server function, both publish-results dialogs and tests share them.

/**
 * WaveOS platforms Zernio can delete through POST /posts/{id}/unpublish.
 * Instagram, TikTok and Snapchat do not allow deletion through their APIs.
 */
export const ZERNIO_UNPUBLISH_PLATFORMS = [
  "facebook",
  "threads",
  "x",
  "linkedin",
  "youtube",
  "pinterest",
  "bluesky",
  "gmb",
] as const;

export const UNPUBLISH_CONFIRMATION = "REMOVE";

export function platformSupportsUnpublish(platform: string) {
  return (ZERNIO_UNPUBLISH_PLATFORMS as readonly string[]).includes(platform);
}

export function isUnpublishConfirmation(value: unknown) {
  return value === UNPUBLISH_CONFIRMATION;
}

export function unsupportedUnpublishMessage(platformLabel: string) {
  return `${platformLabel} does not let WaveOS delete published posts. Open the post on ${platformLabel} and remove it there.`;
}

export type ManagedAttempt = {
  platform: string;
  provider: string | null;
  provider_post_id: string | null;
  status: string;
  post_url: string | null;
  unpublished_at: string | null;
};

/** Server-side eligibility; returns a user-readable reason when not allowed. */
export function unpublishBlockReason(attempt: ManagedAttempt, platformLabel: string) {
  if (attempt.unpublished_at) return `This post was already removed from ${platformLabel}.`;
  if (attempt.status !== "success") return "Only successfully published posts can be removed.";
  if (attempt.provider !== "zernio" || !attempt.provider_post_id)
    return "This post has no Zernio post reference, so WaveOS cannot remove it.";
  if (!platformSupportsUnpublish(attempt.platform))
    return unsupportedUnpublishMessage(platformLabel);
  return null;
}

/** Account ids a stored provider request targeted on one provider platform. */
export function snapshotAccountIds(snapshot: unknown, providerPlatform: string) {
  if (!snapshot || typeof snapshot !== "object") return [];
  const platforms = (snapshot as { platforms?: unknown }).platforms;
  if (!Array.isArray(platforms)) return [];
  return platforms
    .filter(
      (entry): entry is { platform: string; accountId: string } =>
        Boolean(entry) &&
        typeof entry === "object" &&
        (entry as { platform?: unknown }).platform === providerPlatform &&
        typeof (entry as { accountId?: unknown }).accountId === "string",
    )
    .map((entry) => entry.accountId);
}

const httpsUrl = (value: string | null) => {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

/** What the publish-results dialog offers for one attempt. */
export function publishedAttemptActions(attempt: ManagedAttempt) {
  const published = attempt.status === "success";
  const removed = published && Boolean(attempt.unpublished_at);
  const live = published && !removed;
  const supported = platformSupportsUnpublish(attempt.platform);
  return {
    removed,
    canOpen: live && httpsUrl(attempt.post_url),
    canRemove:
      live && supported && attempt.provider === "zernio" && Boolean(attempt.provider_post_id),
    removeUnsupported: live && !supported,
  };
}
