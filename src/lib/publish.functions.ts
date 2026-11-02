import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUnpublishConfirmation } from "@/lib/published-post-management";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  .validator((data: { contentId: string; allowDuplicate?: boolean }) => ({
    contentId: data.contentId,
    allowDuplicate: data.allowDuplicate === true,
  }))
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
    return publishContentItemWithZernio(data.contentId, context.userId, {
      allowDuplicate: data.allowDuplicate,
    });
  });

/** Remove one live platform post through Zernio after an explicit REMOVE confirmation. */
export const unpublishPublishAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { attemptId: string; confirmation: string }) => {
    if (typeof data?.attemptId !== "string" || !UUID.test(data.attemptId))
      throw new Error("Invalid publishing attempt.");
    if (!isUnpublishConfirmation(data.confirmation))
      throw new Error("Type REMOVE to confirm removing the live post.");
    return { attemptId: data.attemptId };
  })
  .handler(async ({ data, context }) => {
    // Load through the signed-in user's client first so RLS decides visibility.
    const { data: attempt, error } = await context.supabase
      .from("publish_attempts")
      .select("id,workspace_id")
      .eq("id", data.attemptId)
      .maybeSingle();
    if (error) throw error;
    if (!attempt) throw new Error("Publishing attempt not found.");
    const { requireSocialWorkspaceManager } = await import("./zernio.server");
    try {
      await requireSocialWorkspaceManager(context.supabase, context.userId, attempt.workspace_id);
    } catch {
      throw new Error(
        "Only workspace owners, admins or Dream Wave staff can remove a published post.",
      );
    }
    const { unpublishZernioPublishAttempt } = await import("./zernio-publish.server");
    return unpublishZernioPublishAttempt({
      attemptId: attempt.id,
      workspaceId: attempt.workspace_id,
      actorUserId: context.userId,
    });
  });
