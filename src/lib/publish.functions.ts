import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseAyrsharePostResponse } from "@/lib/ayrshare-response";

/**
 * Attempt to publish a content_item to all its enabled platforms via Ayrshare.
 * Records a publish_attempt per platform with idempotency key = content_id:platform.
 * Marks item as `publishing` while attempting; success/partial/failed after.
 */
export const publishContentItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { contentId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.AYRSHARE_API_KEY;
    if (!apiKey) throw new Error("Ayrshare not configured");

    const { data: item, error } = await supabase
      .from("content_items")
      .select("*")
      .eq("id", data.contentId)
      .maybeSingle();
    if (error) throw error;
    if (!item) throw new Error("not_found");
    if (item.status !== "approved" && item.status !== "scheduled") {
      throw new Error("Item must be approved before publishing.");
    }

    const { data: variants, error: ve } = await supabase
      .from("post_variants")
      .select("*")
      .eq("content_item_id", data.contentId)
      .eq("enabled", true);
    if (ve) throw ve;
    if (!variants?.length) throw new Error("No platforms selected");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("ayrshare_profiles")
      .select("profile_key")
      .eq("workspace_id", item.workspace_id)
      .maybeSingle();
    if (!prof) throw new Error("Ayrshare profile missing for this workspace.");

    // Long-lived signed URLs for media
    let mediaUrls: string[] = [];
    let isVideo = false;
    if (item.media_asset_ids?.length) {
      const { data: assets } = await supabaseAdmin
        .from("media_assets")
        .select("storage_path,mime_type")
        .in("id", item.media_asset_ids);
      isVideo = assets?.length === 1 && assets[0]?.mime_type?.startsWith("video/") === true;
      const paths = (assets ?? []).map((a) => a.storage_path);
      const signed = await Promise.all(
        paths.map(async (p) => {
          const { data: s } = await supabaseAdmin.storage
            .from("media")
            .createSignedUrl(p, 60 * 60 * 24 * 7);
          return s?.signedUrl ?? null;
        }),
      );
      mediaUrls = signed.filter(Boolean) as string[];
    }

    await supabase.from("content_items").update({ status: "publishing" }).eq("id", data.contentId);

    let successCount = 0;
    let failCount = 0;
    let pendingCount = 0;

    for (const v of variants) {
      const idempotencyKey = `${data.contentId}:${v.platform}`;
      // Skip if already succeeded
      const { data: existing } = await supabaseAdmin
        .from("publish_attempts")
        .select("id,status")
        .eq("idempotency_key", idempotencyKey)
        .eq("platform", v.platform)
        .maybeSingle();
      if (existing?.status === "success") {
        successCount++;
        continue;
      }

      const body = {
        post: v.caption || item.primary_caption || "",
        platforms: [v.platform],
        mediaUrls,
        ...(isVideo ? { isVideo: true } : {}),
      };

      const { data: attempt } = await supabaseAdmin
        .from("publish_attempts")
        .upsert(
          {
            content_item_id: data.contentId,
            workspace_id: item.workspace_id,
            platform: v.platform,
            status: "sending",
            idempotency_key: idempotencyKey,
            request_snapshot: body as never,
            attempted_at: new Date().toISOString(),
          },
          { onConflict: "idempotency_key,platform" },
        )
        .select("id")
        .single();

      try {
        const res = await fetch("https://api.ayrshare.com/api/post", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Profile-Key": prof.profile_key,
          },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as Record<string, unknown>;
        const result = parseAyrsharePostResponse(json, v.platform, res.status);
        if (!result.accepted) {
          await supabaseAdmin
            .from("publish_attempts")
            .update({
              status: "failed",
              ayrshare_post_id: result.ayrshareId,
              error_code: result.errorCode,
              error_message: result.errorMessage,
              response_snapshot: json as never,
              completed_at: new Date().toISOString(),
            })
            .eq("id", attempt!.id);
          failCount++;
          continue;
        }

        await supabaseAdmin
          .from("publish_attempts")
          .update({
            status: result.pending ? "sending" : "success",
            ayrshare_post_id: result.ayrshareId,
            post_url: result.postUrl,
            response_snapshot: json as never,
            completed_at: result.pending ? null : new Date().toISOString(),
          })
          .eq("id", attempt!.id);
        if (result.pending) pendingCount++;
        else successCount++;
      } catch (e) {
        await supabaseAdmin
          .from("publish_attempts")
          .update({
            status: "failed",
            error_message: (e as Error).message,
            completed_at: new Date().toISOString(),
          })
          .eq("id", attempt!.id);
        failCount++;
      }
    }

    // A partial result must remain recoverable. Successful attempts are kept
    // and skipped by idempotency on retry; failed networks can be retried.
    const nextStatus = failCount > 0 ? "failed" : pendingCount > 0 ? "publishing" : "published";

    await supabase
      .from("content_items")
      .update({
        status: nextStatus,
        published_at: successCount > 0 ? new Date().toISOString() : null,
      })
      .eq("id", data.contentId);

    await supabaseAdmin.from("activity_logs").insert({
      workspace_id: item.workspace_id,
      actor_user_id: userId,
      action: "content_published",
      entity_type: "content_item",
      entity_id: data.contentId,
      safe_metadata: { success: successCount, failed: failCount } as never,
    });

    return { success: successCount, failed: failCount, pending: pendingCount };
  });
