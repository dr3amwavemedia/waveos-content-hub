// Strict single-destination rules for WaveOS publishing. Pure (no app imports)
// so the Zernio publisher, the post editor and tests share one definition.

/** WaveOS platform name to the Zernio name sent in platforms[].platform. */
export function providerPlatformFor(platform: string) {
  if (platform === "x") return "twitter";
  if (platform === "gmb") return "googlebusiness";
  return platform;
}

export const TARGET_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X",
  twitter: "X",
  pinterest: "Pinterest",
  threads: "Threads",
  bluesky: "Bluesky",
  gmb: "Google Business",
  googlebusiness: "Google Business",
  snapchat: "Snapchat",
};

const targetLabel = (platform: string) => TARGET_LABELS[platform] ?? platform;

export class PublishTargetError extends Error {
  code = "target_guard";
}

export type TargetConnection = { platform: string; provider_account_id: string | null };

/** Auditable record of exactly what one create-post request targets. */
export type TargetSummary = {
  requestedPlatform: string;
  providerPlatform: string;
  accountId: string;
  connectionPlatform: string;
  platforms: Array<{ platform: string; accountId: string }>;
};

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Root/platform keys like facebookSettings that would configure another network. */
function foreignSettingsKeys(source: Record<string, unknown> | null, providerPlatform: string) {
  if (!source) return [];
  return Object.keys(source).filter((key) => {
    const match = key.match(/^([a-z]+)Settings$/);
    return Boolean(match && match[1] !== providerPlatform);
  });
}

/**
 * Runs immediately before every Zernio create-post call. The request must
 * contain exactly one platforms[] entry for the current variant, aimed at the
 * connection selected for that variant, whose stored platform also matches.
 * Throws before anything is sent when any of that is not true.
 */
export function assertSingleTargetRequest(input: {
  variantPlatform: string;
  requestBody: unknown;
  connection: TargetConnection | null | undefined;
}): TargetSummary {
  const { variantPlatform, connection } = input;
  const label = targetLabel(variantPlatform);
  const body = record(input.requestBody);
  const providerPlatform = providerPlatformFor(variantPlatform);
  const entries = Array.isArray(body?.platforms) ? body!.platforms : [];
  if (entries.length !== 1) {
    throw new PublishTargetError(
      `WaveOS stopped this ${label} post before sending: it must go to exactly one ${label} account, but ${entries.length} destinations were prepared.`,
    );
  }
  const entry = record(entries[0]);
  const entryPlatform = typeof entry?.platform === "string" ? entry.platform : "";
  const entryAccount = typeof entry?.accountId === "string" ? entry.accountId : "";
  if (entryPlatform !== providerPlatform) {
    throw new PublishTargetError(
      `WaveOS stopped this ${label} post before sending: the prepared destination was ${targetLabel(entryPlatform) || "unknown"}.`,
    );
  }
  if (!connection?.provider_account_id || entryAccount !== connection.provider_account_id) {
    throw new PublishTargetError(
      `WaveOS stopped this ${label} post before sending: the account doesn't match the ${label} account selected for this post.`,
    );
  }
  if (connection.platform !== variantPlatform) {
    throw new PublishTargetError(
      `WaveOS stopped this ${label} post before sending: the selected account is a ${targetLabel(connection.platform)} account.`,
    );
  }
  const foreign = [
    ...foreignSettingsKeys(body, providerPlatform),
    ...foreignSettingsKeys(record(entry?.platformSpecificData), providerPlatform),
  ];
  if (foreign.length) {
    throw new PublishTargetError(
      `WaveOS stopped this ${label} post before sending: it carried settings for another network (${foreign.join(", ")}).`,
    );
  }
  return {
    requestedPlatform: variantPlatform,
    providerPlatform,
    accountId: entryAccount,
    connectionPlatform: connection.platform,
    platforms: [{ platform: entryPlatform, accountId: entryAccount }],
  };
}

const accountIdOf = (value: unknown) => {
  if (typeof value === "string") return value;
  const nested = record(value);
  return typeof nested?._id === "string" ? nested._id : typeof nested?.id === "string" ? nested.id : "";
};

/** Destinations Zernio reports on the created post that WaveOS did not request. */
export function unexpectedResponseTargets(post: unknown, summary: TargetSummary) {
  const platforms = record(post)?.platforms;
  if (!Array.isArray(platforms)) return [];
  return platforms.flatMap((value) => {
    const entry = record(value);
    if (!entry) return [];
    const platform = typeof entry.platform === "string" ? entry.platform : "";
    const accountId = accountIdOf(entry.accountId);
    const requested = summary.platforms.some(
      (target) => target.platform === platform && (!accountId || target.accountId === accountId),
    );
    return requested ? [] : [{ platform, accountId: accountId || null }];
  });
}

export function unexpectedTargetMessage(
  extra: Array<{ platform: string; accountId: string | null }>,
  requestedPlatform: string,
) {
  const names = [...new Set(extra.map((target) => targetLabel(target.platform) || "an unknown network"))];
  return `Needs attention: Zernio reported this ${targetLabel(requestedPlatform)} post also went to ${names.join(", ")}, which WaveOS did not request. Nothing was removed automatically. Open Social Media › Published to review it.`;
}

/** Reads the stored target summary from a publish attempt's request_snapshot. */
export function readTargetSummary(snapshot: unknown): TargetSummary | null {
  const target = record(record(snapshot)?.waveosTarget);
  if (!target) return null;
  const platforms = Array.isArray(target.platforms)
    ? target.platforms.flatMap((value) => {
        const entry = record(value);
        return entry && typeof entry.platform === "string" && typeof entry.accountId === "string"
          ? [{ platform: entry.platform, accountId: entry.accountId }]
          : [];
      })
    : [];
  if (
    typeof target.requestedPlatform !== "string" ||
    typeof target.providerPlatform !== "string" ||
    typeof target.accountId !== "string" ||
    typeof target.connectionPlatform !== "string" ||
    platforms.length === 0
  )
    return null;
  return {
    requestedPlatform: target.requestedPlatform,
    providerPlatform: target.providerPlatform,
    accountId: target.accountId,
    connectionPlatform: target.connectionPlatform,
    platforms,
  };
}

/** The saved selection must be exactly what the person saw when they pressed Publish. */
export function sameDestinations(saved: string[], expected: string[]) {
  const a = [...new Set(saved)].sort();
  const b = [...new Set(expected)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export type EditorConnection = {
  platform: string;
  connected: boolean;
  connection_state: string;
  provider_account_id?: string | null;
  username: string | null;
  display_name: string | null;
};

const connectedRows = (connections: EditorConnection[], platform: string) =>
  connections.filter(
    (row) => row.platform === platform && row.connected && row.connection_state === "connected",
  );

/** One line per selected destination, e.g. "Instagram · @organicskin". */
export function destinationLines(
  platforms: string[],
  connections: EditorConnection[],
  selectedAccountIds: Partial<Record<string, string[]>> = {},
) {
  return platforms.map((platform) => {
    const rows = connectedRows(connections, platform);
    const chosen = selectedAccountIds[platform]?.length
      ? rows.filter((row) => selectedAccountIds[platform]!.includes(row.provider_account_id ?? ""))
      : rows.slice(0, 1);
    const names = chosen.map((row) =>
      row.username ? `@${row.username.replace(/^@/, "")}` : row.display_name || "account",
    );
    return {
      platform,
      text: `${targetLabel(platform)} · ${names.length ? names.join(", ") : "not connected"}`,
      connected: names.length > 0,
    };
  });
}

export function destinationHeadline(lines: Array<{ text: string }>) {
  if (lines.length === 0) return "No destination selected";
  if (lines.length === 1) return `Publishing only to ${lines[0]!.text}`;
  return `Publishing to ${lines.length} destinations`;
}

export const META_SHARING_WARNING =
  "WaveOS will send only to Instagram. If Meta automatic sharing is enabled in Accounts Center, Meta may still copy it to Facebook.";
export const META_SHARING_HELP_URL = "https://accountscenter.instagram.com/sharing_preferences/";

/** Instagram selected, Facebook not selected, and a Facebook connection exists. */
export function showMetaSharingWarning(platforms: string[], connections: EditorConnection[]) {
  return (
    platforms.includes("instagram") &&
    !platforms.includes("facebook") &&
    connectedRows(connections, "facebook").length > 0
  );
}
