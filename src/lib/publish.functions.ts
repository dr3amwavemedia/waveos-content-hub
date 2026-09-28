import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    const { requireSocialWorkspaceAccess } = await import("./zernio.server");
    await requireSocialWorkspaceAccess(context.supabase, context.userId, item.workspace_id);
    const { publishContentItemWithZernio } = await import("./zernio-publish.server");
    return publishContentItemWithZernio(data.contentId, context.userId);
  });
