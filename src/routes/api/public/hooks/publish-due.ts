import { createFileRoute } from "@tanstack/react-router";
import { parseAyrsharePostResponse } from "@/lib/ayrshare-response";

/**
 * Cron endpoint (called by pg_cron every 5 minutes) that publishes items
 * whose scheduled_at is due and status is `approved` or `scheduled`.
 */
export const Route = createFileRoute("/api/public/hooks/publish-due")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) return new Response("cron_not_configured", { status: 503 });
        const provided =
          request.headers.get("x-cron-secret") ??
          (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        const a = Buffer.from(provided, "utf8");
        const b = Buffer.from(cronSecret, "utf8");
        if (a.length !== b.length) return new Response("unauthorized", { status: 401 });
        const { timingSafeEqual } = await import("crypto");
        if (!timingSafeEqual(a, b)) return new Response("unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const nowIso = new Date().toISOString();
        const { data: due } = await supabaseAdmin
          .from("content_items")
          .select("id")
          .in("status", ["approved", "scheduled"])
          .lte("scheduled_at", nowIso)
          .limit(20);

        if (!due?.length) return Response.json({ processed: 0 });

        // Dynamic import so the handler stays inside a plain server route module
        const { publishContentItem } = await import("@/lib/publish.functions");
        let ok = 0;
        for (const item of due) {
          try {
            // publishContentItem requires auth; here we run it directly via admin
            // by re-implementing the flow inline is heavy — instead call server-side helper.
            // But publishContentItem uses requireSupabaseAuth. So we call an admin variant:
            await publishNowAdmin(item.id);
            ok++;
          } catch {
            // continue
          }
        }
        void publishContentItem;
        return Response.json({ processed: ok });
      },
    },
  },
});

async function publishNowAdmin(contentId: string) {
  const apiKey = process.env.AYRSHARE_API_KEY;
  if (!apiKey) throw new Error("no_ayrshare");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: item } = await supabaseAdmin.from("content_items").select("*").eq("id", contentId).maybeSingle();
  if (!item) throw new Error("not_found");
  const { data: variants } = await supabaseAdmin.from("post_variants")
    .select("*").eq("content_item_id", contentId).eq("enabled", true);
  const { data: prof } = await supabaseAdmin.from("ayrshare_profiles")
    .select("profile_key").eq("workspace_id", item.workspace_id).maybeSingle();
  if (!prof || !variants?.length) throw new Error("missing_prereqs");

  let mediaUrls: string[] = [];
  let isVideo = false;
  if (item.media_asset_ids?.length) {
    const { data: assets } = await supabaseAdmin.from("media_assets")
      .select("id,workspace_id,name,storage_path,mime_type,size_bytes,source_provider,external_file_id,source_web_url")
      .in("id", item.media_asset_ids);
    isVideo = assets?.length === 1 && assets[0]?.mime_type?.startsWith("video/") === true;
    const { resolveMediaAssetUrl } = await import("@/lib/external-media.server");
    mediaUrls = await Promise.all((assets ?? []).map((asset) => resolveMediaAssetUrl(asset)));
  }

  await supabaseAdmin.from("content_items").update({ status: "publishing" }).eq("id", contentId);

  let successCount = 0, failCount = 0, pendingCount = 0;
  for (const v of variants) {
    const idempotencyKey = `${contentId}:${v.platform}`;
    const { data: existing } = await supabaseAdmin
      .from("publish_attempts")
      .select("status")
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
    const { data: attempt } = await supabaseAdmin.from("publish_attempts").upsert({
      content_item_id: contentId, workspace_id: item.workspace_id, platform: v.platform,
      status: "sending", idempotency_key: idempotencyKey,
      request_snapshot: body as never, attempted_at: new Date().toISOString(),
    }, { onConflict: "idempotency_key,platform" }).select("id").single();
    try {
      const res = await fetch("https://api.ayrshare.com/api/post", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Profile-Key": prof.profile_key },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as Record<string, unknown>;
      const result = parseAyrsharePostResponse(json, v.platform, res.status);
      if (!result.accepted) {
        await supabaseAdmin.from("publish_attempts").update({
          status: "failed", ayrshare_post_id: result.ayrshareId,
          error_code: result.errorCode, error_message: result.errorMessage,
          response_snapshot: json as never, completed_at: new Date().toISOString(),
        }).eq("id", attempt!.id);
        failCount++;
        continue;
      }
      await supabaseAdmin.from("publish_attempts").update({
        status: result.pending ? "sending" : "success",
        ayrshare_post_id: result.ayrshareId, post_url: result.postUrl,
        response_snapshot: json as never, completed_at: result.pending ? null : new Date().toISOString(),
      }).eq("id", attempt!.id);
      if (result.pending) pendingCount++;
      else successCount++;
    } catch (e) {
      await supabaseAdmin.from("publish_attempts").update({
        status: "failed", error_message: (e as Error).message, completed_at: new Date().toISOString(),
      }).eq("id", attempt!.id);
      failCount++;
    }
  }

  await supabaseAdmin.from("content_items").update({
    status: failCount > 0 ? "failed" : pendingCount > 0 ? "publishing" : "published",
    published_at: successCount > 0 ? new Date().toISOString() : null,
  }).eq("id", contentId);

  return { successCount, failCount, pendingCount };
}
