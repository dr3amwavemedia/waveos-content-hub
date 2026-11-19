import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { filtersInput, loadSocialPerformance, type Client } from "@/lib/social-performance-loader";
import { confirmedLeadInput, normalizeConfirmedLead } from "@/lib/social-lead-conversions";

export const getSocialPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => filtersInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireWorkspaceFeatureAccess } = await import("./zernio.server");
    await requireWorkspaceFeatureAccess(context.supabase, context.userId, data.workspaceId, "can_view_analytics_checkup");
    return loadSocialPerformance(context.supabase as Client, data);
  });

export const confirmSocialLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => confirmedLeadInput.parse(input))
  .handler(async ({ data, context }) => {
    const row = normalizeConfirmedLead(data, context.userId);
    if (!row) throw new Error("Add the lead's email, phone or CRM contact so it can be counted once.");
    // RLS allows only workspace owners/admins and managing staff to write.
    const { data: saved, error } = await context.supabase
      .from("social_lead_conversions" as never)
      .upsert(row as never, { onConflict: "workspace_id,dedupe_key", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error("Only workspace managers can confirm leads, or lead storage isn't ready yet.");
    return { created: Boolean((saved as unknown[] | null)?.length), duplicate: !(saved as unknown[] | null)?.length };
  });

export const removeSocialLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ workspaceId: z.string().uuid(), id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: removed, error } = await context.supabase
      .from("social_lead_conversions" as never)
      .delete()
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error("Only workspace managers can remove confirmed leads.");
    return { removed: Boolean((removed as unknown[] | null)?.length) };
  });

export const listSocialLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("social_lead_conversions" as never)
      .select("id,source,platform,provider_post_id,confirmed_at,metadata")
      .eq("workspace_id", data.workspaceId)
      .order("confirmed_at", { ascending: false })
      .limit(50);
    if (error) return { leads: [], storageReady: false };
    return {
      leads: (rows ?? []) as Array<{ id: string; source: string; platform: string | null; provider_post_id: string | null; confirmed_at: string; metadata: { name?: string } | null }>,
      storageReady: true,
    };
  });
