import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ContentStatus = Database["public"]["Enums"]["content_status"];
export type SocialPlatform = Database["public"]["Enums"]["social_platform"];
export type ApprovalDecision = Database["public"]["Enums"]["approval_decision"];

export type ContentItem = Database["public"]["Tables"]["content_items"]["Row"];
export type PostVariant = Database["public"]["Tables"]["post_variants"]["Row"];
export type ApprovalRow = Database["public"]["Tables"]["approvals"]["Row"];
export type CommentRow = Database["public"]["Tables"]["comments"]["Row"];

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
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

export const ALL_PLATFORMS: SocialPlatform[] = [
  "instagram", "facebook", "tiktok", "youtube", "linkedin",
  "x", "pinterest", "threads", "bluesky",
];

export function useContentItems(workspaceId: string | null, status?: ContentStatus[]) {
  return useQuery({
    queryKey: ["content-items", workspaceId, status?.join(",") ?? "all"],
    enabled: !!workspaceId,
    queryFn: async () => {
      let q = supabase.from("content_items").select("*").eq("workspace_id", workspaceId!);
      if (status?.length) q = q.in("status", status);
      q = q.order("created_at", { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ContentItem[];
    },
  });
}

export function useContentItem(id: string | null) {
  return useQuery({
    queryKey: ["content-item", id],
    enabled: !!id,
    queryFn: async () => {
      const [{ data: item, error: e1 }, { data: variants, error: e2 }] = await Promise.all([
        supabase.from("content_items").select("*").eq("id", id!).maybeSingle(),
        supabase.from("post_variants").select("*").eq("content_item_id", id!),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return { item: item as ContentItem | null, variants: (variants ?? []) as PostVariant[] };
    },
  });
}

export function useCreateContentItem(workspaceId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title?: string;
      primary_caption?: string;
      media_asset_ids?: string[];
      platforms: SocialPlatform[];
      scheduled_at?: string | null;
    }) => {
      if (!workspaceId) throw new Error("No workspace");
      const { data: user } = await supabase.auth.getUser();
      const { data: item, error } = await supabase
        .from("content_items")
        .insert({
          workspace_id: workspaceId,
          title: input.title ?? null,
          primary_caption: input.primary_caption ?? null,
          media_asset_ids: input.media_asset_ids ?? [],
          scheduled_at: input.scheduled_at ?? null,
          status: "draft",
          created_by: user.user?.id,
        })
        .select()
        .single();
      if (error) throw error;

      if (input.platforms.length) {
        const rows = input.platforms.map((p) => ({
          content_item_id: item.id,
          workspace_id: workspaceId,
          platform: p,
          caption: input.primary_caption ?? "",
        }));
        const { error: ve } = await supabase.from("post_variants").insert(rows);
        if (ve) throw ve;
      }
      return item as ContentItem;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-items"] });
    },
  });
}

export function useUpdateContentItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ContentItem> }) => {
      const { error } = await supabase.from("content_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["content-items"] });
      qc.invalidateQueries({ queryKey: ["content-item", v.id] });
    },
  });
}

export function useUpdateVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<PostVariant> }) => {
      const { error } = await supabase.from("post_variants").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["content-item"] });
      void v;
    },
  });
}

export function useDeleteContentItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("content_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-items"] }),
  });
}

export function useSubmitForApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contentId: string) => {
      const { error } = await supabase
        .from("content_items")
        .update({ status: "in_review" })
        .eq("id", contentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-items"] });
      qc.invalidateQueries({ queryKey: ["content-item"] });
    },
  });
}

export function useDecideApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      contentId: string;
      workspaceId: string;
      decision: ApprovalDecision;
      note?: string;
    }) => {
      const { data: user } = await supabase.auth.getUser();
      const nextStatus: ContentStatus =
        input.decision === "approved" ? "approved"
        : input.decision === "changes_requested" ? "changes_requested"
        : input.decision === "rejected" ? "draft"
        : "in_review";
      const { error } = await supabase.from("approvals").insert({
        content_item_id: input.contentId,
        workspace_id: input.workspaceId,
        decision: input.decision,
        note: input.note ?? null,
        reviewer_id: user.user?.id,
        decided_at: new Date().toISOString(),
      });
      if (error) throw error;
      const patch: Partial<ContentItem> = { status: nextStatus };
      if (input.decision === "approved") {
        patch.approved_by = user.user?.id ?? null;
        patch.approved_at = new Date().toISOString();
      }
      const { error: e2 } = await supabase
        .from("content_items")
        .update(patch)
        .eq("id", input.contentId);
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-items"] });
      qc.invalidateQueries({ queryKey: ["content-item"] });
      qc.invalidateQueries({ queryKey: ["approvals"] });
    },
  });
}

export function useComments(contentId: string | null) {
  return useQuery({
    queryKey: ["comments", contentId],
    enabled: !!contentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("*")
        .eq("content_item_id", contentId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CommentRow[];
    },
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { contentId: string; workspaceId: string; body: string }) => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("comments").insert({
        content_item_id: input.contentId,
        workspace_id: input.workspaceId,
        author_id: user.user!.id,
        body: input.body,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["comments", v.contentId] }),
  });
}

export function useSocialConnections(workspaceId: string | null) {
  return useQuery({
    queryKey: ["social-connections", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_connections")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("platform", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
