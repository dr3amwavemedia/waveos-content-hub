import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canManageContentReview, reviewItemPatch, reviewVariantCaption } from "./content-review";
import type { Database, Json } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

async function reviewAccess(client: SupabaseClient<Database>, userId: string, workspaceId: string) {
  const [roles, member] = await Promise.all([
    client.from("user_roles").select("role").eq("user_id", userId),
    client.from("workspace_members").select("role").eq("user_id", userId).eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  if (roles.error) throw roles.error;
  if (member.error) throw member.error;
  return canManageContentReview((roles.data ?? []).map(row => row.role), member.data?.role ?? null);
}

export const getContentReviewAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ workspaceId: z.string().uuid() }))
  .handler(async ({ data, context }) => ({ canManage: await reviewAccess(context.supabase, context.userId, data.workspaceId) }));

const saveSchema = z.object({
  contentId: z.string().uuid(), expectedUpdatedAt: z.string(), title: z.string(), caption: z.string(),
  mediaIds: z.array(z.string().uuid()), scheduledAt: z.string().datetime().nullable(),
  platforms: z.array(z.enum(["instagram", "facebook", "tiktok", "youtube", "linkedin", "x", "pinterest", "threads", "bluesky", "gmb", "snapchat"])),
  variants: z.array(z.object({ id: z.string().uuid(), caption: z.string().optional(), platform_options: z.record(z.unknown()).optional() })),
});

export const saveContentReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(saveSchema)
  .handler(async ({ data, context }) => {
    const client = context.supabase;
    const result = await client.from("content_items").select("*").eq("id", data.contentId).single();
    if (result.error) throw result.error;
    const item = result.data;
    if (!await reviewAccess(client, context.userId, item.workspace_id)) throw new Error("Only an admin can edit a post during review.");
    if (item.status !== "in_review" || item.updated_at !== data.expectedUpdatedAt) throw new Error("This review has changed. Reload the post before editing.");
    if (data.scheduledAt && Date.parse(data.scheduledAt) <= Date.now() + 60_000) throw new Error("Schedule time must be in the future.");
    if (data.scheduledAt) {
      const feature = await client.rpc("has_feature", { _workspace_id: item.workspace_id, _feature: "can_schedule_content" });
      if (feature.error) throw feature.error;
      if (!feature.data) throw new Error("Scheduling is not included for this workspace.");
    }
    if (data.mediaIds.length) {
      const media = await client.from("media_assets").select("id").eq("workspace_id", item.workspace_id).in("id", data.mediaIds);
      if (media.error) throw media.error;
      if (media.data.length !== new Set(data.mediaIds).size) throw new Error("Selected media must belong to this workspace.");
    }
    const variants = await client.from("post_variants").select("*").eq("content_item_id", item.id).eq("workspace_id", item.workspace_id);
    if (variants.error) throw variants.error;
    if (data.variants.some(patch => !variants.data.some(row => row.id === patch.id))) throw new Error("Invalid platform edit.");
    for (const variant of variants.data) {
      const patch = data.variants.find(row => row.id === variant.id);
      const updated = await client.from("post_variants").update({
        enabled: data.platforms.includes(variant.platform),
        caption: reviewVariantCaption(data.caption, item.primary_caption, variant.caption, patch?.caption),
        ...(patch?.platform_options ? { platform_options: patch.platform_options as Json } : {}),
      }).eq("id", variant.id).eq("content_item_id", item.id).eq("workspace_id", item.workspace_id);
      if (updated.error) throw updated.error;
    }
    const missing = data.platforms.filter(platform => !variants.data.some(row => row.platform === platform));
    if (missing.length) {
      const inserted = await client.from("post_variants").insert(missing.map(platform => ({ content_item_id: item.id, workspace_id: item.workspace_id, platform, caption: data.caption, enabled: true })));
      if (inserted.error) throw inserted.error;
    }
    const metadata = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata) ? item.metadata : {};
    const saved = await client.from("content_items").update(reviewItemPatch(data, metadata, context.userId, new Date().toISOString()) as never)
      .eq("id", item.id).eq("status", "in_review").eq("updated_at", data.expectedUpdatedAt).select("*").maybeSingle();
    if (saved.error) throw saved.error;
    if (!saved.data) throw new Error("This review has changed. Reload before approving.");
    return saved.data;
  });

export const decideContentReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ contentId: z.string().uuid(), expectedUpdatedAt: z.string(), action: z.enum(["approve", "schedule", "publish_now", "changes_requested"]), note: z.string().optional() }))
  .handler(async ({ data, context }) => {
    const client = context.supabase;
    const result = await client.from("content_items").select("*").eq("id", data.contentId).single();
    if (result.error) throw result.error;
    const item = result.data;
    if (!await reviewAccess(client, context.userId, item.workspace_id)) throw new Error("Only an admin can manage this review.");
    if (item.status !== "in_review" || item.updated_at !== data.expectedUpdatedAt) throw new Error("This review changed. Reload before deciding.");
    if (data.action === "schedule" && (!item.scheduled_at || Date.parse(item.scheduled_at) <= Date.now())) throw new Error("Choose a future schedule and save changes first.");
    if (data.action !== "changes_requested") {
      const metadata = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata) ? item.metadata : {};
      const request = metadata.approval_request && typeof metadata.approval_request === "object" && !Array.isArray(metadata.approval_request) ? metadata.approval_request : {};
      const updated = await client.from("content_items").update({
        metadata: { ...metadata, approval_request: { ...request, action: data.action === "approve" ? "review_only" : data.action } },
        ...(data.action === "publish_now" ? { scheduled_at: null } : {}),
      }).eq("id", item.id).eq("status", "in_review").eq("updated_at", data.expectedUpdatedAt).select("id").maybeSingle();
      if (updated.error) throw updated.error;
      if (!updated.data) throw new Error("This review changed. Reload before deciding.");
    }
    const decision = await client.rpc("decide_content_approval", { _content_id: item.id, _decision: data.action === "changes_requested" ? "changes_requested" : "approved", _note: data.note });
    if (decision.error) throw decision.error;
    return { status: decision.data };
  });