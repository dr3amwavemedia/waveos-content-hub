import type { Json } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveMediaAssetUrl } from "@/lib/external-media.server";
import { normalizeZernioAccounts, toZernioPlatform, zernioRequest } from "@/lib/zernio.server";
import { cleanupConfirmedTemporaryMedia } from "@/lib/temporary-media-cleanup.server";
import { assertPublishingEnabled } from "@/lib/publishing-controls.server";

type ZernioTarget = {
  platform?: string;
  status?: string;
  platformPostUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  errorCategory?: string;
  platformError?: { code?: string | number; message?: string };
};

type ZernioPost = {
  _id?: string;
  status?: string;
  platforms?: ZernioTarget[];
};

export async function publishContentItemWithZernio(contentId: string, actorUserId?: string | null) {
  const { data: item, error } = await supabaseAdmin
    .from("content_items")
    .select("*")
    .eq("id", contentId)
    .maybeSingle();
  if (error) throw error;
  if (!item) throw new Error("Post not found.");
  await assertPublishingEnabled(item.workspace_id);
  if (item.status !== "approved" && item.status !== "scheduled") {
    throw new Error("Item must be approved before publishing.");
  }

  const { data: variants, error: variantsError } = await supabaseAdmin
    .from("post_variants")
    .select("*")
    .eq("content_item_id", contentId)
    .eq("enabled", true);
  if (variantsError) throw variantsError;
  if (!variants?.length) throw new Error("No platforms selected.");

  // Resolve the provider profile from the content item's workspace every time.
  // Neither the acting staff member nor browser state can choose a different
  // Zernio profile for this publish.
  const { data: workspaceProfile, error: profileError } = await supabaseAdmin
    .from("zernio_profiles" as never)
    .select("profile_id")
    .eq("workspace_id", item.workspace_id)
    .maybeSingle();
  if (profileError) throw profileError;
  const profile = workspaceProfile as { profile_id: string } | null;
  if (!profile?.profile_id) {
    throw new Error("This client workspace does not have a connected Zernio profile.");
  }

  const { data: subprofiles } = await supabaseAdmin
    .from("zernio_workspace_subprofiles" as never)
    .select("profile_id")
    .eq("workspace_id", item.workspace_id);
  const profileIds = [
    profile.profile_id,
    ...((subprofiles ?? []) as Array<{ profile_id: string }>).map((row) => row.profile_id),
  ];
  const providerAccounts = (
    await Promise.all(
      profileIds.map(async (profileId) => {
        const accountParams = new URLSearchParams({ profileId, page: "1", limit: "100" });
        const response = await zernioRequest<Record<string, unknown>>(`/accounts?${accountParams}`);
        return normalizeZernioAccounts(response).filter(
          (account) => !account.profileId || account.profileId === profileId,
        );
      }),
    )
  ).flat();
  const verifiedAccountIds = new Set(providerAccounts.map((account) => account.id));

  const { data: connections, error: connectionsError } = await supabaseAdmin
    .from("social_connections")
    .select("platform,provider_account_id,connected,connection_state")
    .eq("workspace_id", item.workspace_id)
    .eq("provider", "zernio")
    .eq("connected", true);
  if (connectionsError) throw connectionsError;
  const { data: rawLimit } = await supabaseAdmin.rpc(
    "social_account_limit" as never,
    {
      _workspace_id: item.workspace_id,
    } as never,
  );
  const accountLimit = Number(rawLimit ?? 0);
  if ((connections?.length ?? 0) > accountLimit) {
    throw new Error(
      `This workspace has ${connections?.length ?? 0} connected accounts but its plan allows ${accountLimit}. Disconnect the extra accounts or upgrade before publishing.`,
    );
  }
  const accountsByPlatform = new Map<string, NonNullable<typeof connections>>();
  for (const connection of connections ?? []) {
    if (!connection.provider_account_id || !verifiedAccountIds.has(connection.provider_account_id))
      continue;
    const group = accountsByPlatform.get(connection.platform) ?? [];
    group.push(connection);
    accountsByPlatform.set(connection.platform, group);
  }

  let assets: Array<{
    id: string;
    workspace_id: string;
    name: string;
    storage_path: string | null;
    mime_type: string;
    size_bytes: number;
    source_provider: string;
    external_file_id: string | null;
    source_web_url: string | null;
  }> = [];
  if (item.media_asset_ids?.length) {
    const result = await supabaseAdmin
      .from("media_assets")
      .select(
        "id,workspace_id,name,storage_path,mime_type,size_bytes,source_provider,external_file_id,source_web_url",
      )
      .in("id", item.media_asset_ids)
      .eq("workspace_id", item.workspace_id);
    if (result.error) throw result.error;
    assets = result.data ?? [];
    if (assets.length !== new Set(item.media_asset_ids).size) {
      throw new Error("One or more selected media files do not belong to this client workspace.");
    }
  }
  const mediaUrls = await Promise.all(assets.map((asset) => resolveMediaAssetUrl(asset)));
  const mediaItems = mediaUrls.map((url, index) => ({
    url,
    type: assets[index]?.mime_type.startsWith("video/") ? "video" : "image",
  }));

  await supabaseAdmin.from("content_items").update({ status: "publishing" }).eq("id", contentId);
  let success = 0;
  let failed = 0;
  let pending = 0;

  for (const variant of variants) {
    const platformConnections = accountsByPlatform.get(variant.platform) ?? [];
    const idempotencyKey = `${contentId}:${variant.platform}`;
    const platformOptions =
      variant.platform_options && typeof variant.platform_options === "object"
        ? (variant.platform_options as Record<string, unknown>)
        : {};
    const contentType = platformOptions.contentType === "story" ? "story" : null;
    const requestedAccountIds = Array.isArray(platformOptions.accountIds)
      ? platformOptions.accountIds.filter((value): value is string => typeof value === "string")
      : [];
    if (platformConnections.length > 1 && requestedAccountIds.length === 0) {
      throw new Error(
        `Choose at least one ${variant.platform} account in the post editor before publishing.`,
      );
    }
    const selectedConnections =
      requestedAccountIds.length > 0
        ? platformConnections.filter((connection) =>
            requestedAccountIds.includes(connection.provider_account_id!),
          )
        : platformConnections.slice(0, 1);
    if (
      requestedAccountIds.length > 0 &&
      selectedConnections.length !== requestedAccountIds.length
    ) {
      throw new Error(
        `One or more selected ${variant.platform} accounts are no longer connected. Review the post destinations and try again.`,
      );
    }
    if (contentType && !["instagram", "facebook"].includes(variant.platform)) {
      throw new Error(`${variant.platform} does not support Story publishing through Zernio.`);
    }
    if (contentType && mediaItems.length !== 1) {
      throw new Error(`${variant.platform} Stories require exactly one media item.`);
    }
    const requestBody = {
      content: variant.caption || item.primary_caption || "",
      ...(mediaItems.length ? { mediaItems } : {}),
      platforms: [
        ...selectedConnections.map((connection) => ({
          platform: toZernioPlatform(variant.platform),
          accountId: connection.provider_account_id,
          ...(contentType ? { platformSpecificData: { contentType } } : {}),
        })),
      ],
      publishNow: true,
    };

    const { data: existing } = await supabaseAdmin
      .from("publish_attempts")
      .select("id,status")
      .eq("idempotency_key", idempotencyKey)
      .eq("platform", variant.platform)
      .maybeSingle();
    if (existing?.status === "success") {
      success += 1;
      continue;
    }

    const { data: attempt, error: attemptError } = await supabaseAdmin
      .from("publish_attempts")
      .upsert(
        {
          content_item_id: contentId,
          workspace_id: item.workspace_id,
          platform: variant.platform,
          provider: "zernio",
          status: selectedConnections.length ? "sending" : "failed",
          idempotency_key: idempotencyKey,
          request_snapshot: requestBody as unknown as Json,
          attempted_at: new Date().toISOString(),
          error_code: selectedConnections.length ? null : "account_not_connected",
          error_message: selectedConnections.length
            ? null
            : `Connect ${variant.platform} to this client's Zernio profile before publishing.`,
          completed_at: selectedConnections.length ? null : new Date().toISOString(),
        },
        { onConflict: "idempotency_key,platform" },
      )
      .select("id")
      .single();
    if (attemptError) throw attemptError;
    if (!selectedConnections.length) {
      failed += 1;
      continue;
    }

    try {
      const response = await zernioRequest<{ post?: ZernioPost }>("/posts", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(requestBody),
      });
      const result = zernioPostResult(response.post, toZernioPlatform(variant.platform));
      await supabaseAdmin
        .from("publish_attempts")
        .update({
          status: result.status,
          provider: "zernio",
          provider_post_id: result.postId,
          response_snapshot: response as unknown as Json,
          post_url: result.postUrl,
          error_code: result.errorCode,
          error_message: result.errorMessage,
          completed_at: result.status === "sending" ? null : new Date().toISOString(),
        })
        .eq("id", attempt.id);
      if (result.status === "success") success += 1;
      else if (result.status === "sending") pending += 1;
      else failed += 1;
    } catch (reason) {
      const providerError = reason as Error & { code?: string; details?: unknown };
      await supabaseAdmin
        .from("publish_attempts")
        .update({
          status: "failed",
          error_code: providerError.code ?? "zernio_request_failed",
          error_message: providerError.message,
          response_snapshot: (providerError.details ?? {}) as Json,
          completed_at: new Date().toISOString(),
        })
        .eq("id", attempt.id);
      failed += 1;
    }
  }

  const nextStatus = failed > 0 ? "failed" : pending > 0 ? "publishing" : "published";
  await supabaseAdmin
    .from("content_items")
    .update({
      status: nextStatus,
      published_at: success > 0 ? new Date().toISOString() : null,
    })
    .eq("id", contentId);
  await supabaseAdmin.from("activity_logs").insert({
    workspace_id: item.workspace_id,
    actor_user_id: actorUserId ?? null,
    action: "content_published",
    entity_type: "content_item",
    entity_id: contentId,
    safe_metadata: {
      success,
      failed,
      pending,
      provider: "zernio",
      provider_profile_verified: true,
    },
  });
  if (failed === 0 && pending === 0 && success > 0) {
    await cleanupConfirmedTemporaryMedia(contentId);
  }
  return { success, failed, pending };
}

export async function refreshZernioPublishAttempt(attemptId: string) {
  const { data: attempt, error } = await supabaseAdmin
    .from("publish_attempts")
    .select("id,content_item_id,platform,provider,provider_post_id")
    .eq("id", attemptId)
    .maybeSingle();
  if (error) throw error;
  if (!attempt) throw new Error("Publishing attempt not found.");
  if (attempt.provider !== "zernio" || !attempt.provider_post_id) {
    throw new Error("This attempt does not have a Zernio post reference.");
  }
  const response = await zernioRequest<{ post?: ZernioPost }>(
    `/posts/${encodeURIComponent(attempt.provider_post_id)}`,
  );
  const result = zernioPostResult(response.post, toZernioPlatform(attempt.platform));
  await supabaseAdmin
    .from("publish_attempts")
    .update({
      status: result.status,
      response_snapshot: response as unknown as Json,
      post_url: result.postUrl,
      error_code: result.errorCode,
      error_message: result.errorMessage,
      completed_at: result.status === "sending" ? null : new Date().toISOString(),
    })
    .eq("id", attempt.id);
  await reconcileContentStatus(attempt.content_item_id);
  return {
    status: result.status,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    postUrl: result.postUrl,
    providerReference: result.postId,
  };
}

function zernioPostResult(post: ZernioPost | undefined, platform: string) {
  const matchingTargets =
    post?.platforms?.filter((entry) => entry.platform === platform) ?? post?.platforms ?? [];
  const target = matchingTargets[0];
  const targetStatuses = matchingTargets.map((entry) =>
    String(entry.status ?? post?.status ?? "publishing").toLowerCase(),
  );
  const status = targetStatuses.includes("failed")
    ? "failed"
    : targetStatuses.length > 0 && targetStatuses.every((value) => value === "published")
      ? "published"
      : String(post?.status ?? target?.status ?? "publishing").toLowerCase();
  const failedTarget = matchingTargets.find(
    (entry) => String(entry.status ?? "").toLowerCase() === "failed",
  );
  const error = failedTarget?.platformError ?? target?.platformError;
  return {
    postId: post?._id ?? null,
    status:
      status === "published"
        ? ("success" as const)
        : status === "failed"
          ? ("failed" as const)
          : ("sending" as const),
    postUrl: target?.platformPostUrl ?? null,
    errorCode:
      status === "failed"
        ? String(
            failedTarget?.errorCode ??
              error?.code ??
              failedTarget?.errorCategory ??
              "zernio_failed",
          )
        : null,
    errorMessage:
      status === "failed"
        ? String(
            failedTarget?.errorMessage ?? error?.message ?? "Zernio reported a publishing failure.",
          )
        : null,
  };
}

async function reconcileContentStatus(contentItemId: string) {
  const { data: attempts } = await supabaseAdmin
    .from("publish_attempts")
    .select("status")
    .eq("content_item_id", contentItemId);
  const statuses = (attempts ?? []).map((attempt) => attempt.status);
  const status = statuses.some((value) => value === "failed")
    ? "failed"
    : statuses.some((value) => value === "sending" || value === "queued")
      ? "publishing"
      : "published";
  await supabaseAdmin
    .from("content_items")
    .update({
      status,
      ...(status === "published" ? { published_at: new Date().toISOString() } : {}),
    })
    .eq("id", contentItemId);
  if (
    status === "published" &&
    statuses.length > 0 &&
    statuses.every((value) => value === "success")
  ) {
    await cleanupConfirmedTemporaryMedia(contentItemId);
  }
}
