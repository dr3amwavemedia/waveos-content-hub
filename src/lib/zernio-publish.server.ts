import type { Json } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveMediaAssetUrl } from "@/lib/external-media.server";
import { normalizeZernioAccounts, toZernioPlatform, zernioRequest } from "@/lib/zernio.server";
import { cleanupConfirmedTemporaryMedia } from "@/lib/temporary-media-cleanup.server";
import { assertPublishingEnabled } from "@/lib/publishing-controls.server";
import {
  isZernioTimeoutError,
  normalizeZernioRequestError,
  ZERNIO_CREATE_POST_TIMEOUT_MS,
} from "@/lib/zernio-timeout";
import {
  assertSingleTargetRequest,
  readTargetSummary,
  sameDestinations,
  unexpectedResponseTargets,
  unexpectedTargetMessage,
} from "@/lib/publish-targets";
import {
  DUPLICATE_GUARD_ERROR_CODE,
  DUPLICATE_GUARD_WINDOW_MS,
  findDuplicatePublishes,
  publishFingerprint,
  type DuplicateGuardMatch,
} from "@/lib/publish-fingerprint";
import { snapshotAccountIds, unpublishBlockReason } from "@/lib/published-post-management";

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

export type PublishContentResult = {
  success: number;
  failed: number;
  pending: number;
  duplicateGuard?: DuplicateGuardMatch[];
};

export async function publishContentItemWithZernio(
  contentId: string,
  actorUserId?: string | null,
  options: { allowDuplicate?: boolean; expectedPlatforms?: string[] } = {},
): Promise<PublishContentResult> {
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

  // This function runs with service-role credentials for both interactive and
  // cron publishing. Re-check the workspace entitlements here so neither path
  // can bypass a lapsed subscription or a plan boundary.
  const isScheduledPublish = item.status === "scheduled" || item.scheduled_at !== null;
  const requiredFeatures = [
    {
      key: "can_publish_content",
      message: "Publishing is not included for this workspace.",
    },
    ...(isScheduledPublish
      ? [
          {
            key: "can_schedule_content",
            message: "Scheduling is not included for this workspace.",
          },
        ]
      : []),
  ];
  for (const feature of requiredFeatures) {
    const { data: included, error: featureError } = await supabaseAdmin.rpc("has_feature", {
      _workspace_id: item.workspace_id,
      _feature: feature.key,
    });
    if (featureError) throw featureError;
    if (included !== true) throw new Error(feature.message);
  }
  if (item.status === "scheduled" && !item.scheduled_at) {
    throw new Error("Scheduled content is missing its publish time.");
  }
  if (item.scheduled_at) {
    const publishAt = Date.parse(item.scheduled_at);
    if (!Number.isFinite(publishAt) || publishAt > Date.now()) {
      throw new Error("Scheduled content is not due yet.");
    }
  }

  const { data: variants, error: variantsError } = await supabaseAdmin
    .from("post_variants")
    .select("*")
    .eq("content_item_id", contentId)
    .eq("workspace_id", item.workspace_id)
    .eq("enabled", true);
  if (variantsError) throw variantsError;
  if (!variants?.length) throw new Error("No platforms selected.");
  // Interactive publishes pass the destinations the person saw on screen. The
  // saved selection must match exactly, so stale editor state cannot add one.
  if (
    options.expectedPlatforms &&
    !sameDestinations(
      variants.map((variant) => variant.platform),
      options.expectedPlatforms,
    )
  ) {
    throw new Error(
      "The saved platforms don't match what was shown when you pressed Publish. Nothing was sent. Review the destinations and publish again.",
    );
  }

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

  const { data: subprofiles, error: subprofilesError } = await supabaseAdmin
    .from("zernio_workspace_subprofiles" as never)
    .select("profile_id")
    .eq("workspace_id", item.workspace_id);
  if (subprofilesError) throw subprofilesError;
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
    .eq("connected", true)
    .eq("connection_state", "connected");
  if (connectionsError) throw connectionsError;
  const { data: rawLimit, error: limitError } = await supabaseAdmin.rpc(
    "social_account_limit" as never,
    {
      _workspace_id: item.workspace_id,
    } as never,
  );
  if (limitError) throw limitError;
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

  // Build and validate every provider request before claiming the content item.
  // A bad destination must not leave an otherwise editable post stuck in the
  // publishing state, and no platform should publish before all destinations
  // have passed the same preflight.
  const preparedVariants = variants.map((variant) => {
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
    if (selectedConnections.length === 0) {
      throw new Error(
        `Connect ${variant.platform} to this client's Zernio profile before publishing.`,
      );
    }
    if (selectedConnections.length !== 1) {
      throw new Error(
        `Choose exactly one ${variant.platform} account for this post. WaveOS sends each platform to one account.`,
      );
    }
    if (contentType && !["instagram", "facebook"].includes(variant.platform)) {
      throw new Error(`${variant.platform} does not support Story publishing through Zernio.`);
    }
    if (contentType && mediaItems.length !== 1) {
      throw new Error(`${variant.platform} Stories require exactly one media item.`);
    }
    const providerPlatform = toZernioPlatform(variant.platform);
    const requestBody = {
      content: variant.caption || item.primary_caption || "",
      ...(mediaItems.length ? { mediaItems } : {}),
      platforms: [
        ...selectedConnections.map((connection) => ({
          platform: providerPlatform,
          accountId: connection.provider_account_id,
          ...(contentType ? { platformSpecificData: { contentType } } : {}),
        })),
      ],
      publishNow: true,
    };
    const fingerprintInput = {
      workspaceId: item.workspace_id,
      platform: variant.platform,
      accountIds: selectedConnections.map((connection) => connection.provider_account_id!),
      caption: requestBody.content,
      mediaAssetIds: item.media_asset_ids ?? [],
      contentType,
    };
    const connection = selectedConnections[0]!;
    const targetSummary = assertSingleTargetRequest({
      variantPlatform: variant.platform,
      requestBody,
      connection,
    });
    return {
      idempotencyKey,
      providerPlatform,
      requestBody,
      variant,
      fingerprintInput,
      connection,
      targetSummary,
    };
  });
  const fingerprints = await Promise.all(
    preparedVariants.map((prepared) => publishFingerprint(prepared.fingerprintInput)),
  );

  // Duplicate-content fail-safe. Runs before the content item is claimed and
  // before any provider write. Networks this same item already published are
  // skipped later as before, so they are not checked here.
  const duplicateGuard = await checkDuplicatePublishes({
    contentId,
    workspaceId: item.workspace_id,
    prepared: preparedVariants.map((prepared, index) => ({
      platform: prepared.variant.platform,
      idempotencyKey: prepared.idempotencyKey,
      fingerprint: fingerprints[index]!,
    })),
    allowDuplicate: options.allowDuplicate === true,
  });
  if (duplicateGuard.length > 0) {
    if (!actorUserId) await holdScheduledDuplicate(item, duplicateGuard, preparedVariants, fingerprints);
    return { success: 0, failed: 0, pending: 0, duplicateGuard };
  }

  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("content_items")
    .update({ status: "publishing" })
    .eq("id", contentId)
    .eq("workspace_id", item.workspace_id)
    .eq("status", item.status)
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) throw new Error("This content item is already being published or was changed.");

  let success = 0;
  let failed = 0;
  let pending = 0;

  try {
    for (const [
      index,
      { idempotencyKey, providerPlatform, requestBody, variant, connection },
    ] of preparedVariants.entries()) {
      // Re-check immediately before the create call; nothing is sent on mismatch.
      const targetSummary = assertSingleTargetRequest({
        variantPlatform: variant.platform,
        requestBody,
        connection,
      });
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("publish_attempts")
        .select("id,status,error_code,provider_post_id")
        .eq("idempotency_key", idempotencyKey)
        .eq("platform", variant.platform)
        .eq("content_item_id", contentId)
        .eq("workspace_id", item.workspace_id)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing?.status === "success") {
        success += 1;
        continue;
      }
      // Already created once with an unexpected extra destination. Never
      // re-send; the person reviews it in Published posts instead.
      if (existing?.error_code === "unexpected_target" && existing.provider_post_id) {
        failed += 1;
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
            status: "sending",
            idempotency_key: idempotencyKey,
            request_snapshot: {
              ...requestBody,
              waveosFingerprint: fingerprints[index],
              waveosTarget: targetSummary,
            } as unknown as Json,
            attempted_at: new Date().toISOString(),
            error_code: null,
            error_message: null,
            completed_at: null,
          },
          { onConflict: "idempotency_key,platform" },
        )
        .select("id")
        .single();
      if (attemptError) throw attemptError;

      try {
        const response = await zernioRequest<{ post?: ZernioPost }>("/posts", {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(ZERNIO_CREATE_POST_TIMEOUT_MS),
        });
        const result = zernioPostResult(response.post, providerPlatform);
        const extraTargets = unexpectedResponseTargets(response.post, targetSummary);
        if (extraTargets.length) {
          console.error("Zernio reported unrequested publish targets", {
            attemptId: attempt.id,
            requested: targetSummary.platforms,
            unexpected: extraTargets,
          });
          result.status = "failed";
          result.errorCode = "unexpected_target";
          result.errorMessage = unexpectedTargetMessage(extraTargets, variant.platform);
        }
        const { error: attemptUpdateError } = await supabaseAdmin
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
          .eq("id", attempt.id)
          .eq("workspace_id", item.workspace_id)
          .eq("content_item_id", contentId);
        if (attemptUpdateError) throw attemptUpdateError;
        if (result.status === "success") success += 1;
        else if (result.status === "sending") pending += 1;
        else failed += 1;
      } catch (reason) {
        const providerError = normalizeZernioRequestError(reason);
        const { error: failureWriteError } = await supabaseAdmin
          .from("publish_attempts")
          .update({
            status: "failed",
            error_code: providerError.code,
            error_message: providerError.message,
            response_snapshot: providerError.details as Json,
            completed_at: new Date().toISOString(),
          })
          .eq("id", attempt.id)
          .eq("workspace_id", item.workspace_id)
          .eq("content_item_id", contentId);
        if (failureWriteError) throw failureWriteError;
        failed += 1;
      }
    }

    const nextStatus = failed > 0 ? "failed" : pending > 0 ? "publishing" : "published";
    const { data: finalized, error: finalizeError } = await supabaseAdmin
      .from("content_items")
      .update({
        status: nextStatus,
        published_at: success > 0 ? new Date().toISOString() : null,
      })
      .eq("id", contentId)
      .eq("workspace_id", item.workspace_id)
      .eq("status", "publishing")
      .select("id")
      .maybeSingle();
    if (finalizeError) throw finalizeError;
    if (!finalized) throw new Error("Publishing state changed before completion.");
  } catch (reason) {
    // A database or orchestration failure after the atomic claim must never
    // strand the item in `publishing`. Provider requests are idempotent, so a
    // failed item can be safely reviewed and retried.
    const { error: recoveryError } = await supabaseAdmin
      .from("content_items")
      .update({ status: "failed" })
      .eq("id", contentId)
      .eq("workspace_id", item.workspace_id)
      .eq("status", "publishing");
    if (recoveryError) {
      console.error("Failed to recover content publishing state", {
        contentId,
        message: recoveryError.message,
      });
    }
    throw reason;
  }

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
    .select("id,content_item_id,platform,provider,provider_post_id,request_snapshot")
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
  const storedTarget = readTargetSummary(attempt.request_snapshot);
  const extraTargets = storedTarget ? unexpectedResponseTargets(response.post, storedTarget) : [];
  if (extraTargets.length) {
    result.status = "failed";
    result.errorCode = "unexpected_target";
    result.errorMessage = unexpectedTargetMessage(extraTargets, attempt.platform);
  }
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

type PreparedDuplicateCheck = { platform: string; idempotencyKey: string; fingerprint: string };

async function checkDuplicatePublishes(input: {
  contentId: string;
  workspaceId: string;
  prepared: PreparedDuplicateCheck[];
  allowDuplicate: boolean;
}): Promise<DuplicateGuardMatch[]> {
  if (input.allowDuplicate || input.prepared.length === 0) return [];
  const { data: own, error: ownError } = await supabaseAdmin
    .from("publish_attempts")
    .select("platform,status")
    .eq("content_item_id", input.contentId)
    .eq("workspace_id", input.workspaceId)
    .in(
      "idempotency_key",
      input.prepared.map((entry) => entry.idempotencyKey),
    );
  if (ownError) throw ownError;
  const alreadyPublished = new Set(
    (own ?? []).filter((row) => row.status === "success").map((row) => row.platform as string),
  );
  const candidates = input.prepared.filter((entry) => !alreadyPublished.has(entry.platform));
  if (candidates.length === 0) return [];
  const { data: prior, error: priorError } = await supabaseAdmin
    .from("publish_attempts")
    .select("id,content_item_id,platform,status,attempted_at,post_url,unpublished_at,request_snapshot")
    .eq("workspace_id", input.workspaceId)
    .eq("status", "success")
    .is("unpublished_at", null)
    .neq("content_item_id", input.contentId)
    .in("platform", candidates.map((entry) => entry.platform) as never)
    .gte("attempted_at", new Date(Date.now() - DUPLICATE_GUARD_WINDOW_MS).toISOString())
    .limit(200);
  if (priorError) throw priorError;
  return findDuplicatePublishes({
    contentItemId: input.contentId,
    prepared: candidates,
    prior: (prior ?? []).map((row) => {
      const snapshot = (row.request_snapshot ?? {}) as Record<string, unknown>;
      return {
        id: row.id,
        content_item_id: row.content_item_id,
        platform: row.platform as string,
        status: row.status as string,
        attempted_at: row.attempted_at,
        post_url: row.post_url,
        unpublished_at: row.unpublished_at,
        fingerprint:
          typeof snapshot.waveosFingerprint === "string" ? snapshot.waveosFingerprint : null,
      };
    }),
  });
}

/**
 * Scheduled publishing has nobody to confirm a possible duplicate, so the item
 * is held as failed with a clear reason instead of retrying on every run. The
 * earlier successful post is never touched.
 */
async function holdScheduledDuplicate(
  item: { id: string; workspace_id: string; status: string },
  matches: DuplicateGuardMatch[],
  preparedVariants: Array<{
    idempotencyKey: string;
    requestBody: Record<string, unknown>;
    variant: { platform: string };
  }>,
  fingerprints: string[],
) {
  const { data: held, error: holdError } = await supabaseAdmin
    .from("content_items")
    .update({ status: "failed" })
    .eq("id", item.id)
    .eq("workspace_id", item.workspace_id)
    .eq("status", item.status as never)
    .select("id")
    .maybeSingle();
  if (holdError) throw holdError;
  if (!held) return;
  const now = new Date().toISOString();
  for (const match of matches) {
    const index = preparedVariants.findIndex((entry) => entry.variant.platform === match.platform);
    const prepared = preparedVariants[index];
    if (!prepared) continue;
    const label = platformDisplayName(match.platform);
    const { error } = await supabaseAdmin.from("publish_attempts").upsert(
      {
        content_item_id: item.id,
        workspace_id: item.workspace_id,
        platform: match.platform as never,
        provider: "zernio",
        status: "failed",
        idempotency_key: prepared.idempotencyKey,
        request_snapshot: {
          ...prepared.requestBody,
          waveosFingerprint: fingerprints[index],
        } as unknown as Json,
        attempted_at: now,
        completed_at: now,
        error_code: DUPLICATE_GUARD_ERROR_CODE,
        error_message: `WaveOS held this ${label} post as a possible duplicate: the same caption and media were already published to ${label} from another post at ${match.attemptedAt.slice(0, 16).replace("T", " ")} UTC. Open and retry post to confirm before publishing another copy.`,
      },
      { onConflict: "idempotency_key,platform" },
    );
    if (error) throw error;
  }
  await supabaseAdmin.from("activity_logs").insert({
    workspace_id: item.workspace_id,
    actor_user_id: null,
    action: "content_publish_held_duplicate",
    entity_type: "content_item",
    entity_id: item.id,
    safe_metadata: {
      provider: "zernio",
      platforms: matches.map((match) => match.platform),
      existing_attempt_ids: matches.map((match) => match.existingAttemptId),
    },
  });
}

function platformDisplayName(platform: string) {
  const names: Record<string, string> = {
    x: "X",
    gmb: "Google Business",
    youtube: "YouTube",
    linkedin: "LinkedIn",
    tiktok: "TikTok",
  };
  return names[platform] ?? platform.charAt(0).toUpperCase() + platform.slice(1);
}

const ZERNIO_UNPUBLISH_TIMEOUT_MS = 60_000;

/**
 * Delete one live platform post through Zernio. The caller must already have
 * loaded the attempt through RLS and verified workspace-manager authority.
 * The WaveOS attempt row is kept as history either way.
 */
export async function unpublishZernioPublishAttempt(input: {
  attemptId: string;
  workspaceId: string;
  actorUserId: string;
}) {
  const { data: attempt, error } = await supabaseAdmin
    .from("publish_attempts")
    .select(
      "id,workspace_id,content_item_id,platform,provider,provider_post_id,status,post_url,unpublished_at,request_snapshot",
    )
    .eq("id", input.attemptId)
    .eq("workspace_id", input.workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!attempt) throw new Error("Publishing attempt not found.");
  const label = platformDisplayName(attempt.platform);
  const blocked = unpublishBlockReason(
    {
      platform: attempt.platform,
      provider: attempt.provider,
      provider_post_id: attempt.provider_post_id,
      status: attempt.status,
      post_url: attempt.post_url,
      unpublished_at: attempt.unpublished_at,
    },
    label,
  );
  if (blocked) throw new Error(blocked);
  const providerPlatform = toZernioPlatform(attempt.platform);
  if (snapshotAccountIds(attempt.request_snapshot, providerPlatform).length > 1) {
    throw new Error(
      `This post went to several ${label} accounts. Remove each copy on ${label} so the right one is deleted.`,
    );
  }

  const logBase = {
    workspace_id: attempt.workspace_id,
    actor_user_id: input.actorUserId,
    entity_type: "publish_attempt",
    entity_id: attempt.id,
  };
  try {
    const response = await zernioRequest<Record<string, unknown>>(
      `/posts/${encodeURIComponent(attempt.provider_post_id!)}/unpublish`,
      {
        method: "POST",
        body: JSON.stringify({ platform: providerPlatform }),
        signal: AbortSignal.timeout(ZERNIO_UNPUBLISH_TIMEOUT_MS),
      },
    );
    const unpublishedAt = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("publish_attempts")
      .update({
        unpublished_at: unpublishedAt,
        unpublished_by: input.actorUserId,
        unpublish_response: response as unknown as Json,
        unpublish_error: null,
      })
      .eq("id", attempt.id)
      .eq("workspace_id", attempt.workspace_id)
      .is("unpublished_at", null);
    if (updateError) throw updateError;
    await supabaseAdmin.from("activity_logs").insert({
      ...logBase,
      action: "published_post_removed",
      safe_metadata: {
        provider: "zernio",
        platform: attempt.platform,
        content_item_id: attempt.content_item_id,
        provider_post_id: attempt.provider_post_id,
      },
    });
    return { unpublishedAt, platform: attempt.platform };
  } catch (reason) {
    const message = isZernioTimeoutError(reason)
      ? `Zernio did not answer in time. The removal may still complete, so check the post on ${label} before trying again.`
      : `${label} removal failed: ${
          reason instanceof Error && reason.message
            ? reason.message.slice(0, 300)
            : "Zernio did not remove the post."
        }`;
    await supabaseAdmin
      .from("publish_attempts")
      .update({ unpublish_error: message })
      .eq("id", attempt.id)
      .eq("workspace_id", attempt.workspace_id)
      .is("unpublished_at", null);
    await supabaseAdmin.from("activity_logs").insert({
      ...logBase,
      action: "published_post_remove_failed",
      safe_metadata: {
        provider: "zernio",
        platform: attempt.platform,
        content_item_id: attempt.content_item_id,
        timeout: isZernioTimeoutError(reason),
      },
    });
    throw new Error(message);
  }
}
