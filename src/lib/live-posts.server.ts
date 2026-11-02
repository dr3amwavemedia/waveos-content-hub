import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { zernioRequest } from "@/lib/zernio.server";
import { isZernioTimeoutError } from "@/lib/zernio-timeout";
import {
  applyRemovalLog,
  applyWaveosHistory,
  classifyAccountError,
  livePlatformLabel,
  livePostKey,
  LIVE_POSTS_PAGE_SIZE,
  LIVE_POSTS_RANGE_DAYS,
  mergeLivePosts,
  normalizeAnalyticsPosts,
  normalizeSyncedPosts,
  providerPlatformSupportsUnpublish,
  requestAccountIds,
  toProviderPlatform,
  zernioPostContainsCopy,
  type AccountFetchError,
  type LivePost,
  type LivePostAccount,
} from "@/lib/live-posts";

const LIVE_POSTS_TIMEOUT_MS = 20_000;
const UNPUBLISH_TIMEOUT_MS = 30_000;
const REMOVED_ACTION = "live_post_removed";

export type WorkspaceLiveAccount = LivePostAccount & { needsReconnect: boolean };

/**
 * Connected Zernio accounts of one workspace, read with the caller's own
 * session so existing workspace RLS decides which accounts are visible.
 */
export async function loadWorkspaceLiveAccounts(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
): Promise<WorkspaceLiveAccount[]> {
  const { data, error } = await supabase
    .from("social_connections")
    .select("platform,provider,provider_account_id,connected,connection_state,display_name,username")
    .eq("workspace_id", workspaceId)
    .eq("provider", "zernio");
  if (error) throw new Error("Couldn't load this workspace's social accounts.");
  return (data ?? []).flatMap((row) => {
    if (!row.provider_account_id) return [];
    if (row.connection_state === "not_connected" || row.connection_state === "disconnected")
      return [];
    if (!row.connected && row.connection_state === "connected") return [];
    return [
      {
        accountId: row.provider_account_id,
        platform: toProviderPlatform(row.platform),
        name: row.display_name || row.username || livePlatformLabel(row.platform),
        needsReconnect: ["expired", "action_required", "error"].includes(row.connection_state),
      },
    ];
  });
}

function analyticsPath(accountId: string, page: number, now = new Date()) {
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - LIVE_POSTS_RANGE_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const params = new URLSearchParams({
    accountId,
    source: "all",
    fromDate: from,
    toDate: to,
    limit: String(LIVE_POSTS_PAGE_SIZE),
    page: String(page),
    sortBy: "date",
    order: "desc",
  });
  return `/analytics?${params}`;
}

function hasMorePages(payload: unknown, page: number) {
  const pagination = (payload as { pagination?: { pages?: unknown; totalPages?: unknown } } | null)
    ?.pagination;
  const pages = Number(pagination?.pages ?? pagination?.totalPages ?? 0);
  return Number.isFinite(pages) && pages > page;
}

export async function loadLivePostsPage(input: {
  workspaceId: string;
  accounts: WorkspaceLiveAccount[];
  page: number;
}) {
  const outcomes = await Promise.all(
    input.accounts.map(async (account) => {
      if (account.needsReconnect) {
        return {
          posts: [] as LivePost[],
          hasMore: false,
          error: classifyAccountError({ code: "ads_connection_required", status: 409 }, account),
        };
      }
      const lists: LivePost[][] = [];
      let error: AccountFetchError | null = null;
      let hasMore = false;
      // Refresh the account's recent platform posts only for the first page.
      if (input.page === 1) {
        try {
          const synced = await zernioRequest<unknown>("/posts/sync-external", {
            method: "POST",
            body: JSON.stringify({ accountId: account.accountId }),
            signal: AbortSignal.timeout(LIVE_POSTS_TIMEOUT_MS),
          });
          lists.push(normalizeSyncedPosts(synced, account));
        } catch (reason) {
          error = classifyAccountError(reason, account);
        }
      }
      try {
        const analytics = await zernioRequest<unknown>(analyticsPath(account.accountId, input.page), {
          signal: AbortSignal.timeout(LIVE_POSTS_TIMEOUT_MS),
        });
        lists.push(normalizeAnalyticsPosts(analytics, account));
        hasMore = hasMorePages(analytics, input.page);
      } catch (reason) {
        // Keep the first failure; a reconnect message is more useful than a retry hint.
        if (!error || (!error.reconnect && classifyAccountError(reason, account).reconnect)) {
          error = classifyAccountError(reason, account);
        }
      }
      return { posts: mergeLivePosts(...lists), hasMore, error };
    }),
  );

  let posts = mergeLivePosts(...outcomes.map((outcome) => outcome.posts));
  posts = await withStoredHistory(input.workspaceId, posts);
  return {
    posts,
    accounts: input.accounts.map((account, index) => ({
      accountId: account.accountId,
      platform: account.platform,
      name: account.name,
      hasMore: outcomes[index]!.hasMore,
      error: outcomes[index]!.error,
    })),
  };
}

/** Adds WaveOS publish history (Zernio post ids, removals) and logged removals. */
async function withStoredHistory(workspaceId: string, posts: LivePost[]) {
  if (!posts.length) return posts;
  const [attempts, removals] = await Promise.all([
    supabaseAdmin
      .from("publish_attempts")
      .select("platform,provider_post_id,post_url,unpublished_at,request_snapshot")
      .eq("workspace_id", workspaceId)
      .eq("provider", "zernio")
      .eq("status", "success")
      .not("provider_post_id", "is", null)
      .order("attempted_at", { ascending: false })
      .limit(500),
    supabaseAdmin
      .from("activity_logs")
      .select("created_at,safe_metadata")
      .eq("workspace_id", workspaceId)
      .eq("action", REMOVED_ACTION)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  let next = posts;
  if (!attempts.error && attempts.data) next = applyWaveosHistory(next, attempts.data);
  if (!removals.error && removals.data) {
    next = applyRemovalLog(
      next,
      removals.data.flatMap((row) => {
        const meta = (row.safe_metadata ?? {}) as Record<string, unknown>;
        if (
          typeof meta.platform !== "string" ||
          typeof meta.account_id !== "string" ||
          typeof meta.platform_post_id !== "string"
        )
          return [];
        return [
          {
            key: livePostKey(meta.platform, meta.account_id, meta.platform_post_id),
            removedAt: row.created_at,
          },
        ];
      }),
    );
  }
  return next;
}

export async function removeExactLivePost(input: {
  workspaceId: string;
  actorUserId: string;
  account: WorkspaceLiveAccount;
  platform: string;
  platformPostId: string;
  latePostId: string;
  url: string | null;
}) {
  const platform = toProviderPlatform(input.platform);
  const label = livePlatformLabel(platform);
  if (platform !== input.account.platform) {
    throw new Error("This post doesn't belong to that account.");
  }
  if (!providerPlatformSupportsUnpublish(platform)) {
    throw new Error(`${label} doesn't allow removing posts from WaveOS. Delete it on ${label}.`);
  }

  // Confirm the Zernio post really holds this account's copy of this exact
  // platform post, so a different post or copy can never be deleted.
  let zernioPost: unknown;
  try {
    const response = await zernioRequest<{ post?: unknown }>(
      `/posts/${encodeURIComponent(input.latePostId)}`,
      { signal: AbortSignal.timeout(LIVE_POSTS_TIMEOUT_MS) },
    );
    zernioPost = response.post;
  } catch {
    throw new Error(`Couldn't confirm this exact ${label} post, so nothing was removed. Try again.`);
  }
  const target = {
    platform,
    accountId: input.account.accountId,
    platformPostId: input.platformPostId,
    url: input.url,
  };
  if (!zernioPostContainsCopy(zernioPost, target)) {
    throw new Error(
      `WaveOS couldn't match this card to a single ${label} post, so nothing was removed. Delete it on ${label}.`,
    );
  }

  const safeMetadata = {
    provider: "zernio",
    platform,
    account_id: input.account.accountId,
    platform_post_id: input.platformPostId,
    late_post_id: input.latePostId,
  };
  let response: unknown;
  try {
    response = await zernioRequest<Record<string, unknown>>(
      `/posts/${encodeURIComponent(input.latePostId)}/unpublish`,
      {
        method: "POST",
        body: JSON.stringify({ platform, accountId: input.account.accountId }),
        signal: AbortSignal.timeout(UNPUBLISH_TIMEOUT_MS),
      },
    );
  } catch (reason) {
    const timedOut = isZernioTimeoutError(reason);
    const error = reason as { status?: number; code?: string };
    console.error("Live post removal failed", {
      platform,
      status: error?.status,
      code: error?.code,
      timedOut,
    });
    await supabaseAdmin.from("activity_logs").insert({
      workspace_id: input.workspaceId,
      actor_user_id: input.actorUserId,
      action: "live_post_remove_failed",
      entity_type: "live_post",
      entity_id: null,
      safe_metadata: { ...safeMetadata, timeout: timedOut },
    });
    throw new Error(
      timedOut
        ? `Zernio didn't answer in time. The removal may still finish, so check the post on ${label} before trying again.`
        : `${label} didn't confirm the removal, so the post is probably still live. Try again, or delete it on ${label}.`,
    );
  }

  const removedAt = new Date().toISOString();
  await supabaseAdmin.from("activity_logs").insert({
    workspace_id: input.workspaceId,
    actor_user_id: input.actorUserId,
    action: REMOVED_ACTION,
    entity_type: "live_post",
    entity_id: null,
    safe_metadata: safeMetadata,
  });

  // Keep WaveOS publish history in step when this exact copy came from WaveOS.
  const { data: attempts } = await supabaseAdmin
    .from("publish_attempts")
    .select("id,platform,request_snapshot")
    .eq("workspace_id", input.workspaceId)
    .eq("provider", "zernio")
    .eq("provider_post_id", input.latePostId)
    .is("unpublished_at", null);
  const exact = (attempts ?? []).filter((attempt) => {
    if (toProviderPlatform(attempt.platform) !== platform) return false;
    const ids = requestAccountIds(attempt.request_snapshot, platform);
    return ids.length === 1 && ids[0] === input.account.accountId;
  });
  for (const attempt of exact) {
    await supabaseAdmin
      .from("publish_attempts")
      .update({
        unpublished_at: removedAt,
        unpublished_by: input.actorUserId,
        unpublish_response: (response ?? null) as Json,
        unpublish_error: null,
      })
      .eq("id", attempt.id)
      .eq("workspace_id", input.workspaceId)
      .is("unpublished_at", null);
  }

  return { key: livePostKey(platform, input.account.accountId, input.platformPostId), removedAt };
}
