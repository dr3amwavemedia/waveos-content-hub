import { createHmac, timingSafeEqual } from "crypto";
import { createFileRoute } from "@tanstack/react-router";

import { claimWebhookEvent } from "@/lib/webhook-claim.server";
import { fromZernioPlatform } from "@/lib/zernio.server";
import { cleanupConfirmedTemporaryMedia } from "@/lib/temporary-media-cleanup.server";

export const Route = createFileRoute("/api/public/hooks/zernio")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const secret = process.env.ZERNIO_WEBHOOK_SECRET;
        if (!secret) return new Response("webhook_not_configured", { status: 503 });
        const provided =
          request.headers.get("x-zernio-signature") ??
          request.headers.get("x-late-signature") ??
          "";
        const expected = createHmac("sha256", secret).update(raw).digest("hex");
        const providedBuffer = Buffer.from(provided, "utf8");
        const expectedBuffer = Buffer.from(expected, "utf8");
        if (
          providedBuffer.length !== expectedBuffer.length ||
          !timingSafeEqual(providedBuffer, expectedBuffer)
        ) {
          return new Response("invalid_signature", { status: 401 });
        }

        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          return new Response("invalid_json", { status: 400 });
        }
        const eventType = String(
          payload.event ?? request.headers.get("x-zernio-event") ?? "unknown",
        );
        const eventId = String(payload.id ?? request.headers.get("x-zernio-event-id") ?? "").trim();
        if (!eventId) return new Response("event_id_required", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const claim = await claimWebhookEvent(supabaseAdmin, {
          source: "zernio",
          eventType,
          externalId: eventId,
          payload,
        });
        if (claim.error) return new Response("event_store_failed", { status: 503 });
        if (!claim.claimed) return new Response("duplicate_ignored", { status: 200 });
        if (eventType === "webhook.test") return new Response("ok");

        const post = objectOrEmpty(payload.post);
        const providerPostId = String(post._id ?? post.id ?? payload.postId ?? "");
        if (!providerPostId || !eventType.startsWith("post.")) return new Response("ok");

        const eventPlatform = objectOrEmpty(payload.platform);
        const targetRows = Array.isArray(post.platforms)
          ? post.platforms.filter((row): row is Record<string, unknown> =>
              Boolean(row && typeof row === "object"),
            )
          : [];
        const targets = Object.keys(eventPlatform).length ? [eventPlatform] : targetRows;
        const postStatus = String(post.status ?? "").toLowerCase();
        const completedAt = new Date().toISOString();

        if (targets.length) {
          for (const target of targets) {
            const platform = fromZernioPlatform(String(target.platform ?? "").toLowerCase());
            if (!platform) continue;
            const status = String(target.status ?? postStatus).toLowerCase();
            const succeeded = status === "published";
            const failed = status === "failed" || status === "deleted";
            if (!succeeded && !failed) continue;
            const platformError = objectOrEmpty(target.platformError);
            await supabaseAdmin
              .from("publish_attempts")
              .update({
                status: succeeded ? "success" : "failed",
                response_snapshot: payload as never,
                completed_at: completedAt,
                post_url:
                  typeof target.platformPostUrl === "string" ? target.platformPostUrl : null,
                error_code: succeeded
                  ? null
                  : String(target.errorCode ?? platformError.code ?? "zernio_failed"),
                error_message: succeeded
                  ? null
                  : String(
                      target.errorMessage ??
                        platformError.message ??
                        "Zernio reported a publishing failure.",
                    ),
              })
              .eq("provider", "zernio" as never)
              .eq("provider_post_id", providerPostId as never)
              .eq("platform", platform);
          }
        }

        const { data: updatedAttempts } = await supabaseAdmin
          .from("publish_attempts")
          .select("content_item_id,status")
          .eq("provider", "zernio" as never)
          .eq("provider_post_id", providerPostId as never);
        const contentIds = Array.from(
          new Set((updatedAttempts ?? []).map((row) => row.content_item_id)),
        );
        for (const contentId of contentIds) {
          const { data: attempts } = await supabaseAdmin
            .from("publish_attempts")
            .select("status")
            .eq("content_item_id", contentId);
          const statuses = (attempts ?? []).map((attempt) => attempt.status);
          const itemStatus = statuses.some((status) => status === "failed")
            ? statuses.some((status) => status === "success")
              ? "published"
              : "failed"
            : statuses.some((status) => status === "sending" || status === "queued")
              ? "publishing"
              : "published";
          await supabaseAdmin
            .from("content_items")
            .update({
              status: itemStatus,
              ...(itemStatus === "published" ? { published_at: completedAt } : {}),
            })
            .eq("id", contentId);
          if (statuses.length > 0 && statuses.every((status) => status === "success")) {
            await cleanupConfirmedTemporaryMedia(contentId);
          }
        }
        return new Response("ok");
      },
    },
  },
});

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
