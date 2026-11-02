import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUnpublishConfirmation, UNPUBLISH_CONFIRMATION } from "@/lib/published-post-management";

export const refreshPublishAttemptDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { attemptId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: attempt, error } = await context.supabase
      .from("publish_attempts")
      .select("id")
      .eq("id", data.attemptId)
      .maybeSingle();
    if (error) throw error;
    if (!attempt) throw new Error("Publishing attempt not found.");
    const { refreshZernioPublishAttempt } = await import("./zernio-publish.server");
    return refreshZernioPublishAttempt(data.attemptId);
  });

export const publishContentItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { contentId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: item, error } = await context.supabase
      .from("content_items")
      .select("id,workspace_id")
      .eq("id", data.contentId)
      .maybeSingle();
    if (error) throw error;
    if (!item) throw new Error("Post not found.");
    const { requireSocialWorkspaceWriter } = await import("./zernio.server");
    await requireSocialWorkspaceWriter(context.supabase, context.userId, item.workspace_id);
    const { publishContentItemWithZernio } = await import("./zernio-publish.server");
    return publishContentItemWithZernio(data.contentId, context.userId);
  });

export const unpublishPublishAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { attemptId: string; confirmation: string }) => data)
  .handler(async ({ data, context }) => {
    if (!isUnpublishConfirmation(data.confirmation)) {
      throw new Error(`Type ${UNPUBLISH_CONFIRMATION} to confirm removing this post.`);
    }
    // Load through the caller's own access first so other workspaces stay invisible.
    const { data: attempt, error } = await context.supabase
      .from("publish_attempts")
      .select("id,workspace_id")
      .eq("id", data.attemptId)
      .maybeSingle();
    if (error) throw new Error("Could not load this published post. Try again.");
    if (!attempt) throw new Error("Published post not found.");
    const { requireSocialWorkspaceManager } = await import("./zernio.server");
    try {
      await requireSocialWorkspaceManager(context.supabase, context.userId, attempt.workspace_id);
    } catch {
      throw new Error("Only workspace managers can remove published posts.");
    }
    const { unpublishZernioPublishAttempt } = await import("./publish-removal.server");
    return unpublishZernioPublishAttempt(attempt.id, context.userId);
  });
