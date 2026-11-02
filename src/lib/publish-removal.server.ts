import type { Json } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { toZernioPlatform, zernioRequest } from "@/lib/zernio.server";
import { unpublishBlockReason, withUnpublishedMarker } from "@/lib/published-post-management";

const PLATFORM_NAMES: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X",
  pinterest: "Pinterest",
  threads: "Threads",
  bluesky: "Bluesky",
  gmb: "Google Business",
  snapchat: "Snapchat",
};

/**
 * Removes one published post from its platform through Zernio. The caller must
 * already have verified the confirmation and workspace manager authority. The
 * WaveOS publish_attempt row is never deleted; removal is recorded in it.
 */
export async function unpublishZernioPublishAttempt(attemptId: string, actorUserId: string) {
  const { data: attempt, error } = await supabaseAdmin
    .from("publish_attempts")
    .select(
      "id,workspace_id,content_item_id,platform,provider,provider_post_id,status,post_url,response_snapshot",
    )
    .eq("id", attemptId)
    .maybeSingle();
  if (error) throw new Error("Could not load this published post. Try again.");
  if (!attempt) throw new Error("Published post not found.");

  const label = PLATFORM_NAMES[attempt.platform] ?? attempt.platform;
  const blocked = unpublishBlockReason(attempt, label);
  if (blocked) throw new Error(blocked);

  let unpublishResponse: unknown;
  try {
    unpublishResponse = await zernioRequest<Record<string, unknown>>(
      `/posts/${encodeURIComponent(attempt.provider_post_id!)}/unpublish`,
      {
        method: "POST",
        body: JSON.stringify({ platform: toZernioPlatform(attempt.platform) }),
      },
    );
  } catch (reason) {
    const providerError = reason as Error & { status?: number; code?: string };
    console.error("Zernio unpublish failed", {
      attemptId,
      platform: attempt.platform,
      status: providerError.status,
      code: providerError.code,
      message: providerError.message,
    });
    throw new Error(
      `${label} did not confirm the removal, so the post may still be live. Try again, or remove it on ${label}.`,
    );
  }

  const unpublishedAt = new Date().toISOString();
  const { error: saveError } = await supabaseAdmin
    .from("publish_attempts")
    .update({
      response_snapshot: withUnpublishedMarker(attempt.response_snapshot, {
        unpublishedAt,
        unpublishedBy: actorUserId,
        unpublishResponse,
      }) as unknown as Json,
      post_url: null,
    })
    .eq("id", attempt.id);
  if (saveError) {
    console.error("Failed to record unpublish", { attemptId, message: saveError.message });
    throw new Error(
      `${label} removed the post, but WaveOS could not record it. Refresh before trying again.`,
    );
  }

  await supabaseAdmin.from("activity_logs").insert({
    workspace_id: attempt.workspace_id,
    actor_user_id: actorUserId,
    action: "content_unpublished",
    entity_type: "publish_attempt",
    entity_id: attempt.id,
    safe_metadata: {
      content_item_id: attempt.content_item_id,
      platform: attempt.platform,
      provider: "zernio",
      provider_post_id: attempt.provider_post_id,
    },
  });

  return { attemptId: attempt.id, platform: attempt.platform, unpublishedAt };
}
