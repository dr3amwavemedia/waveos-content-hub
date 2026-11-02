// Account-wide published-post library rules. Pure (no app imports) so server
// functions, the Social Media library UI and tests share one definition.

/** Zernio platform names accepted by POST /v1/posts/{postId}/unpublish. */
export const ZERNIO_UNPUBLISH_PROVIDER_PLATFORMS = [
  "facebook",
  "threads",
  "twitter",
  "linkedin",
  "youtube",
  "pinterest",
  "reddit",
  "bluesky",
  "googlebusiness",
  "telegram",
] as const;

export const LIVE_POST_REMOVE_CONFIRMATION = "REMOVE";
/** GET /v1/analytics accepts at most 366 days; stay one day inside it. */
export const LIVE_POSTS_RANGE_DAYS = 365;
export const LIVE_POSTS_PAGE_SIZE = 100;

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  twitter: "X",
  x: "X",
  pinterest: "Pinterest",
  threads: "Threads",
  bluesky: "Bluesky",
  googlebusiness: "Google Business",
  gmb: "Google Business",
  snapchat: "Snapchat",
  reddit: "Reddit",
  telegram: "Telegram",
};

/** WaveOS platform names (x, gmb) to Zernio names (twitter, googlebusiness). */
export function toProviderPlatform(platform: string) {
  const value = platform.trim().toLowerCase();
  if (value === "x") return "twitter";
  if (value === "gmb" || value === "google_business" || value === "googlemybusiness")
    return "googlebusiness";
  return value;
}

export function livePlatformLabel(platform: string) {
  return PLATFORM_LABELS[toProviderPlatform(platform)] ?? platform;
}

export function providerPlatformSupportsUnpublish(platform: string) {
  return (ZERNIO_UNPUBLISH_PROVIDER_PLATFORMS as readonly string[]).includes(
    toProviderPlatform(platform),
  );
}

export function isLivePostRemoveConfirmation(value: unknown) {
  return value === LIVE_POST_REMOVE_CONFIRMATION;
}

export type LivePostAccount = {
  accountId: string;
  platform: string;
  name: string;
};

export type LivePost = {
  key: string;
  /** Zernio platform name (twitter, googlebusiness, …). */
  platform: string;
  accountId: string;
  accountName: string;
  platformPostId: string;
  /** Zernio post id; the only id unpublish accepts. Null for external-only posts. */
  latePostId: string | null;
  url: string | null;
  caption: string;
  thumbnailUrl: string | null;
  mediaType: string | null;
  publishedAt: string | null;
  source: "zernio" | "external";
  removedAt: string | null;
  /** Every id/URL form this platform post is known by, for safe matching. */
  aliases: string[];
};

export function livePostKey(platform: string, accountId: string, platformPostId: string) {
  return `${toProviderPlatform(platform)}:${accountId}:${platformPostId}`;
}

/**
 * Identifiers for one platform post. Facebook reports the same video as a
 * page-post id ("pageId_postId"), a video id, and reel/watch URLs, so the
 * numeric ids in its URLs are included. Matching is always also scoped to the
 * same platform and account.
 */
export function postAliases(platform: string, platformPostId: string | null, url: string | null) {
  const aliases = new Set<string>();
  if (platformPostId) {
    aliases.add(`id:${platformPostId}`);
    const underscore = platformPostId.lastIndexOf("_");
    if (toProviderPlatform(platform) === "facebook" && underscore > 0)
      aliases.add(`id:${platformPostId.slice(underscore + 1)}`);
  }
  if (url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^(www|m|web)\./, "");
      const path = parsed.pathname.replace(/\/+$/, "");
      aliases.add(`url:${host}${path}${parsed.searchParams.get("v") ? `?v=${parsed.searchParams.get("v")}` : ""}`);
      if (toProviderPlatform(platform) === "facebook") {
        const v = parsed.searchParams.get("v");
        if (v && /^\d+$/.test(v)) aliases.add(`id:${v}`);
        const match = path.match(/\/(?:reel|reels|videos|posts|watch)\/(\d+)$/);
        if (match) aliases.add(`id:${match[1]}`);
      }
    } catch {
      // Not a URL; ignore.
    }
  }
  return [...aliases];
}

const sameCopy = (
  a: { platform: string; accountId: string; aliases: string[] },
  b: { platform: string; accountId: string; aliases: string[] },
) =>
  toProviderPlatform(a.platform) === toProviderPlatform(b.platform) &&
  a.accountId === b.accountId &&
  a.aliases.some((alias) => b.aliases.includes(alias));

const str = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const httpsUrl = (value: unknown) => {
  const text = str(value);
  if (!text) return null;
  try {
    return new URL(text).protocol === "https:" ? text : null;
  } catch {
    return null;
  }
};
const isoDate = (value: unknown) => {
  const text = str(value);
  return text && !Number.isNaN(Date.parse(text)) ? text : null;
};
/** Zernio returns accountId either as a string or a populated account object. */
export function zernioAccountId(value: unknown) {
  return str(value) ?? str(record(value)?._id) ?? str(record(value)?.id);
}

function thumbnailOf(row: Record<string, unknown>) {
  const direct = httpsUrl(row.thumbnailUrl);
  if (direct) return direct;
  const items = Array.isArray(row.mediaItems) ? row.mediaItems : [];
  for (const item of items) {
    const media = record(item);
    if (!media) continue;
    const thumb = httpsUrl(media.thumbnail) ?? (media.type === "image" ? httpsUrl(media.url) : null);
    if (thumb) return thumb;
  }
  return null;
}

/** Posts returned by POST /posts/sync-external (no locator) for one account. */
export function normalizeSyncedPosts(payload: unknown, account: LivePostAccount): LivePost[] {
  const rows = record(payload)?.posts;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((value) => {
    const row = record(value);
    if (!row) return [];
    const platformPostId = str(row.platformPostId);
    if (!platformPostId) return [];
    const platform = toProviderPlatform(str(row.platform) ?? account.platform);
    if (platform !== toProviderPlatform(account.platform)) return [];
    const url = httpsUrl(row.platformPostUrl);
    return [
      {
        key: livePostKey(platform, account.accountId, platformPostId),
        platform,
        accountId: account.accountId,
        accountName: account.name,
        platformPostId,
        latePostId: null,
        url,
        caption: str(row.content) ?? "",
        thumbnailUrl: thumbnailOf(row),
        mediaType: str(row.mediaType),
        publishedAt: isoDate(row.publishedAt),
        source: "external" as const,
        removedAt: null,
        aliases: postAliases(platform, platformPostId, url),
      },
    ];
  });
}

/**
 * Posts from GET /analytics scoped to one account. A cross-posted Zernio post
 * carries one platformAnalytics entry per account; only the entry for this
 * exact account and platform becomes a card, so copies are never conflated.
 */
export function normalizeAnalyticsPosts(payload: unknown, account: LivePostAccount): LivePost[] {
  const rows = record(payload)?.posts;
  if (!Array.isArray(rows)) return [];
  const accountPlatform = toProviderPlatform(account.platform);
  return rows.flatMap((value) => {
    const row = record(value);
    if (!row) return [];
    const latePostId = str(row.latePostId);
    const perAccount = Array.isArray(row.platforms)
      ? row.platforms
      : Array.isArray(row.platformAnalytics)
        ? row.platformAnalytics
        : [];
    const entries = perAccount
      .map(record)
      .filter((entry): entry is Record<string, unknown> => Boolean(entry));
    const matches = entries.filter(
      (entry) =>
        zernioAccountId(entry.accountId) === account.accountId &&
        toProviderPlatform(str(entry.platform) ?? "") === accountPlatform &&
        (str(entry.status) ?? "published") === "published",
    );
    const candidates = matches.length
      ? matches.map((entry) => ({
          platformPostId: str(entry.platformPostId),
          url: httpsUrl(entry.platformPostUrl) ?? (matches.length === 1 ? httpsUrl(row.platformPostUrl) : null),
        }))
      : entries.length === 0 && toProviderPlatform(str(row.platform) ?? "") === accountPlatform
        ? // Single-platform rows without per-account entries; the request was
          // already scoped to this account.
          [{ platformPostId: str(row.platformPostId), url: httpsUrl(row.platformPostUrl) }]
        : [];
    return candidates.flatMap((candidate) => {
      if (!candidate.platformPostId) return [];
      return [
        {
          key: livePostKey(accountPlatform, account.accountId, candidate.platformPostId),
          platform: accountPlatform,
          accountId: account.accountId,
          accountName: account.name,
          platformPostId: candidate.platformPostId,
          latePostId,
          url: candidate.url,
          caption: str(row.content) ?? "",
          thumbnailUrl: thumbnailOf(row),
          mediaType: str(row.mediaType),
          publishedAt: isoDate(row.publishedAt),
          source: latePostId || row.isExternal === false ? ("zernio" as const) : ("external" as const),
          removedAt: null,
          aliases: postAliases(accountPlatform, candidate.platformPostId, candidate.url),
        },
      ];
    });
  });
}

/**
 * Zernio's own post records (GET /posts?accountId=…). These carry the Zernio
 * post id that unpublish needs, one card per published copy on this account.
 */
export function normalizeZernioPosts(payload: unknown, account: LivePostAccount): LivePost[] {
  const rows = record(payload)?.posts;
  if (!Array.isArray(rows)) return [];
  const accountPlatform = toProviderPlatform(account.platform);
  return rows.flatMap((value) => {
    const row = record(value);
    const latePostId = str(row?._id);
    if (!row || !latePostId) return [];
    const entries = (Array.isArray(row.platforms) ? row.platforms : [])
      .map(record)
      .filter((entry): entry is Record<string, unknown> => Boolean(entry));
    return entries.flatMap((entry) => {
      if (zernioAccountId(entry.accountId) !== account.accountId) return [];
      if (toProviderPlatform(str(entry.platform) ?? "") !== accountPlatform) return [];
      if (str(entry.status) !== "published") return [];
      const platformPostId = str(entry.platformPostId);
      if (!platformPostId) return [];
      const url = httpsUrl(entry.platformPostUrl);
      return [
        {
          key: livePostKey(accountPlatform, account.accountId, platformPostId),
          platform: accountPlatform,
          accountId: account.accountId,
          accountName: account.name,
          platformPostId,
          latePostId,
          url,
          caption: str(row.content) ?? "",
          thumbnailUrl: thumbnailOf(row),
          mediaType: str(row.mediaType),
          publishedAt: isoDate(entry.publishedAt) ?? isoDate(row.publishedAt),
          source: "zernio" as const,
          removedAt: null,
          aliases: postAliases(accountPlatform, platformPostId, url),
        },
      ];
    });
  });
}

/**
 * Merge lists into one card per platform post on one account. Cards match on
 * platform + account + any shared id/URL alias; the first card's key is kept.
 */
export function mergeLivePosts(...lists: LivePost[][]): LivePost[] {
  const merged: LivePost[] = [];
  for (const post of lists.flat()) {
    const index = merged.findIndex((existing) => existing.key === post.key || sameCopy(existing, post));
    if (index < 0) {
      merged.push({ ...post, aliases: [...post.aliases] });
      continue;
    }
    const existing = merged[index]!;
    // Two different Zernio post records are two different copies; never fold them.
    if (existing.latePostId && post.latePostId && existing.latePostId !== post.latePostId) {
      merged.push({ ...post, aliases: [...post.aliases] });
      continue;
    }
    merged[index] = {
      ...existing,
      latePostId: existing.latePostId ?? post.latePostId,
      url: existing.url ?? post.url,
      caption: existing.caption || post.caption,
      thumbnailUrl: existing.thumbnailUrl ?? post.thumbnailUrl,
      mediaType: existing.mediaType ?? post.mediaType,
      publishedAt: existing.publishedAt ?? post.publishedAt,
      source: existing.source === "zernio" || post.source === "zernio" ? "zernio" : "external",
      removedAt: existing.removedAt ?? post.removedAt,
      aliases: [...new Set([...existing.aliases, ...post.aliases])],
    };
  }
  return merged.sort(
    (a, b) => (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0),
  );
}

export type WaveosAttemptLink = {
  platform: string;
  provider_post_id: string | null;
  post_url: string | null;
  unpublished_at: string | null;
  request_snapshot: unknown;
};

/** Account ids one stored WaveOS provider request targeted on a platform. */
export function requestAccountIds(snapshot: unknown, providerPlatform: string) {
  const platforms = record(snapshot)?.platforms;
  if (!Array.isArray(platforms)) return [];
  return platforms.flatMap((value) => {
    const entry = record(value);
    if (!entry || toProviderPlatform(str(entry.platform) ?? "") !== providerPlatform) return [];
    const id = zernioAccountId(entry.accountId);
    return id ? [id] : [];
  });
}

/**
 * Adds the Zernio post id and removal state from WaveOS publish history. Only
 * links when the stored attempt has the same platform URL and targeted exactly
 * this one account, so a different copy is never matched.
 */
export function applyWaveosHistory(posts: LivePost[], attempts: WaveosAttemptLink[]) {
  return posts.map((post) => {
    const match = attempts.find((attempt) => {
      if (toProviderPlatform(attempt.platform) !== post.platform) return false;
      if (!attempt.provider_post_id) return false;
      const accounts = requestAccountIds(attempt.request_snapshot, post.platform);
      if (accounts.length !== 1 || accounts[0] !== post.accountId) return false;
      if (post.latePostId) return attempt.provider_post_id === post.latePostId;
      const attemptAliases = postAliases(post.platform, null, attempt.post_url);
      return attemptAliases.some((alias) => post.aliases.includes(alias));
    });
    if (!match) return post;
    return {
      ...post,
      latePostId: post.latePostId ?? match.provider_post_id,
      source: "zernio" as const,
      removedAt: post.removedAt ?? match.unpublished_at,
    };
  });
}

/** Marks cards removed by an earlier library removal (from activity_logs). */
export function applyRemovalLog(
  posts: LivePost[],
  removals: Array<{
    key: string;
    accountId: string;
    latePostId: string | null;
    removedAt: string;
  }>,
) {
  return posts.map((post) => {
    const match = removals.find(
      (removal) =>
        removal.key === post.key ||
        (removal.latePostId !== null &&
          removal.latePostId === post.latePostId &&
          removal.accountId === post.accountId),
    );
    return match ? { ...post, removedAt: post.removedAt ?? match.removedAt } : post;
  });
}

export type LivePostRemoval =
  | { kind: "removed"; message: string }
  | { kind: "remove" }
  | { kind: "manual"; message: string }
  | { kind: "not_allowed"; message: string };

/** What the post dialog offers for one exact card. */
export function livePostRemoval(post: LivePost, canManage: boolean): LivePostRemoval {
  const label = livePlatformLabel(post.platform);
  if (post.removedAt) return { kind: "removed", message: `Removed from ${label}` };
  if (!providerPlatformSupportsUnpublish(post.platform))
    return {
      kind: "manual",
      message: `${label} doesn't allow removing posts from WaveOS. Open the post on ${label} and delete it there.`,
    };
  if (!post.latePostId)
    return {
      kind: "manual",
      message: `This post was published outside WaveOS, so there is no safe way to remove it from here. Open it on ${label} and delete it there.`,
    };
  if (!canManage)
    return {
      kind: "not_allowed",
      message: "Only workspace owners, admins and Dream Wave staff can remove published posts.",
    };
  return { kind: "remove" };
}

/**
 * Server-side check that a Zernio post record contains this exact account's
 * copy of this exact platform post before anything is deleted.
 */
export function zernioPostContainsCopy(
  zernioPost: unknown,
  target: { platform: string; accountId: string; platformPostId: string; url: string | null },
) {
  const platforms = record(zernioPost)?.platforms;
  if (!Array.isArray(platforms)) return false;
  const providerPlatform = toProviderPlatform(target.platform);
  const targetAliases = postAliases(providerPlatform, target.platformPostId, target.url);
  const copies = platforms.filter((value) => {
    const entry = record(value);
    if (!entry) return false;
    if (toProviderPlatform(str(entry.platform) ?? "") !== providerPlatform) return false;
    if (zernioAccountId(entry.accountId) !== target.accountId) return false;
    if (str(entry.status) !== "published") return false;
    const entryAliases = postAliases(
      providerPlatform,
      str(entry.platformPostId),
      httpsUrl(entry.platformPostUrl),
    );
    return entryAliases.some((alias) => targetAliases.includes(alias));
  });
  // Exactly one published copy on this account must match.
  return copies.length === 1;
}

export type AccountFetchError = {
  accountId: string;
  platform: string;
  name: string;
  message: string;
  reconnect: boolean;
};

/** Safe, user-readable per-account failure; never includes provider payloads. */
export function classifyAccountError(
  reason: unknown,
  account: LivePostAccount,
): AccountFetchError {
  const error = reason as { status?: number; code?: string; name?: string } | null;
  const label = livePlatformLabel(account.platform);
  const reconnect =
    error?.status === 401 ||
    error?.status === 403 ||
    error?.code === "ads_connection_required" ||
    (error?.status === 409 && error?.code !== "rate_limited");
  const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
  return {
    accountId: account.accountId,
    platform: account.platform,
    name: account.name,
    reconnect,
    message: reconnect
      ? `${label} needs to be reconnected before its posts can load. Open Accounts to reconnect it.`
      : timedOut
        ? `${label} took too long to answer. Try Refresh in a minute.`
        : error?.status === 429
          ? `${label} is rate-limited right now. Try Refresh in a few minutes.`
          : `Couldn't load ${label} posts right now. Try Refresh.`,
  };
}
