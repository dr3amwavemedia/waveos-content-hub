import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const listInput = z.object({
  workspaceId: z.string().uuid(),
  page: z.number().int().min(1).max(50).default(1),
  accountIds: z.array(z.string().min(1).max(100)).max(50).optional(),
});

const removeInput = z.object({
  workspaceId: z.string().uuid(),
  accountId: z.string().min(1).max(100),
  platform: z.string().min(1).max(40),
  platformPostId: z.string().min(1).max(200),
  latePostId: z.string().min(1).max(100),
  url: z.string().max(2000).nullable(),
  confirmation: z.string().max(20),
});

/**
 * Every published post on the active workspace's connected accounts: recent
 * platform posts (sync-external) plus Zernio/synced history (analytics).
 */
export const listLivePosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.input<typeof listInput>) => listInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireSocialWorkspaceAccess, requireSocialWorkspaceManager } = await import(
      "./zernio.server"
    );
    await requireSocialWorkspaceAccess(context.supabase, context.userId, data.workspaceId);
    const canManage = await requireSocialWorkspaceManager(
      context.supabase,
      context.userId,
      data.workspaceId,
    ).then(
      () => true,
      () => false,
    );
    const { loadWorkspaceLiveAccounts, loadLivePostsPage } = await import("./live-posts.server");
    const accounts = await loadWorkspaceLiveAccounts(context.supabase, data.workspaceId);
    const scoped = data.accountIds
      ? accounts.filter((account) => data.accountIds!.includes(account.accountId))
      : accounts;
    const result = await loadLivePostsPage({
      workspaceId: data.workspaceId,
      accounts: scoped,
      page: data.page,
    });
    return { ...result, canManage, page: data.page };
  });

/** Removes one exact live post through Zernio. Manager-only; typed REMOVE. */
export const removeLivePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.input<typeof removeInput>) => removeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { isLivePostRemoveConfirmation, LIVE_POST_REMOVE_CONFIRMATION } = await import(
      "./live-posts"
    );
    if (!isLivePostRemoveConfirmation(data.confirmation)) {
      throw new Error(`Type ${LIVE_POST_REMOVE_CONFIRMATION} to confirm removing this post.`);
    }
    const { requireSocialWorkspaceManager } = await import("./zernio.server");
    try {
      await requireSocialWorkspaceManager(context.supabase, context.userId, data.workspaceId);
    } catch {
      throw new Error("Only workspace owners, admins and Dream Wave staff can remove posts.");
    }
    const { loadWorkspaceLiveAccounts, removeExactLivePost } = await import(
      "./live-posts.server"
    );
    const accounts = await loadWorkspaceLiveAccounts(context.supabase, data.workspaceId);
    const account = accounts.find((row) => row.accountId === data.accountId);
    if (!account) throw new Error("That account isn't connected to this workspace.");
    return removeExactLivePost({
      workspaceId: data.workspaceId,
      actorUserId: context.userId,
      account,
      platform: data.platform,
      platformPostId: data.platformPostId,
      latePostId: data.latePostId,
      url: data.url,
    });
  });
