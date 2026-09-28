import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type StrategyKind =
  "idea" | "campaign" | "product" | "promotion" | "launch" | "announcement";

export type StrategyStatus =
  "idea" | "planned" | "in_progress" | "awaiting_approval" | "scheduled" | "completed";

export interface SocialStrategyItem {
  id: string;
  workspace_id: string;
  title: string;
  details: string | null;
  item_kind: StrategyKind;
  status: StrategyStatus;
  priority: "low" | "normal" | "high";
  start_date: string;
  end_date: string | null;
  platforms: string[];
  links: string[];
  media_asset_ids: string[];
  owner_id: string | null;
  related_content_item_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarCategory {
  id: string;
  workspace_id: string;
  category_key: string;
  name: string;
  color: string;
  sort_order: number;
  personal_color: string | null;
  effective_color: string;
}

type StrategyDraft = Pick<
  SocialStrategyItem,
  | "title"
  | "details"
  | "item_kind"
  | "status"
  | "priority"
  | "start_date"
  | "end_date"
  | "platforms"
>;

const db = supabase as unknown as {
  from: (table: string) => {
    // Supabase's generated schema does not include these additive tables until
    // the migration is applied and types are regenerated.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (columns?: string) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    insert: (values: unknown) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: (values: unknown) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    upsert: (values: unknown, options?: unknown) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete: () => any;
  };
};

export function useStrategyItems(workspaceId: string | null, month: Date) {
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  return useQuery({
    queryKey: ["social-strategy", workspaceId, monthKey],
    enabled: !!workspaceId,
    queryFn: async (): Promise<SocialStrategyItem[]> => {
      const start = `${monthKey}-01`;
      const endDate = new Date(month.getFullYear(), month.getMonth() + 1, 0);
      const end = `${monthKey}-${String(endDate.getDate()).padStart(2, "0")}`;
      const { data, error } = await db
        .from("social_strategy_items")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .lte("start_date", end)
        .or(`end_date.is.null,end_date.gte.${start}`)
        .order("start_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SocialStrategyItem[];
    },
  });
}

export function useCreateStrategyItem(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draft: StrategyDraft) => {
      if (!workspaceId) throw new Error("Select a workspace first.");
      const { data, error } = await db
        .from("social_strategy_items")
        .insert({ ...draft, workspace_id: workspaceId })
        .select("*")
        .single();
      if (error) throw error;
      return data as SocialStrategyItem;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["social-strategy", workspaceId] }),
  });
}

export function useUpdateStrategyItem(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<StrategyDraft> }) => {
      const { data, error } = await db
        .from("social_strategy_items")
        .update(patch)
        .eq("id", id)
        .eq("workspace_id", workspaceId!)
        .select("*")
        .single();
      if (error) throw error;
      return data as SocialStrategyItem;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["social-strategy", workspaceId] }),
  });
}

export function useDeleteStrategyItem(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("social_strategy_items")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId!);
      if (error) throw error;
      return id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["social-strategy", workspaceId] }),
  });
}

export function useCalendarCategories(workspaceId: string | null) {
  return useQuery({
    queryKey: ["calendar-categories", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<CalendarCategory[]> => {
      const [
        { data: categories, error: categoryError },
        { data: preferences, error: preferenceError },
      ] = await Promise.all([
        db
          .from("calendar_categories")
          .select("id,workspace_id,category_key,name,color,sort_order")
          .eq("workspace_id", workspaceId!)
          .order("sort_order", { ascending: true }),
        db
          .from("calendar_color_preferences")
          .select("category_key,color")
          .eq("workspace_id", workspaceId!),
      ]);
      if (categoryError) throw categoryError;
      if (preferenceError) throw preferenceError;
      const personal = new Map<string, string>(
        (preferences ?? []).map((preference: { category_key: string; color: string }) => [
          preference.category_key,
          preference.color,
        ]),
      );
      return (categories ?? []).map(
        (category: Omit<CalendarCategory, "personal_color" | "effective_color">) => ({
          ...category,
          personal_color: personal.get(category.category_key) ?? null,
          effective_color: personal.get(category.category_key) ?? category.color,
        }),
      );
    },
  });
}

export function useUpdateCalendarCategory(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name: string; color: string }) => {
      const { error } = await db
        .from("calendar_categories")
        .update({ name, color })
        .eq("id", id)
        .eq("workspace_id", workspaceId!);
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["calendar-categories", workspaceId] }),
  });
}

export function useSetPersonalCalendarColor(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ categoryKey, color }: { categoryKey: string; color: string }) => {
      if (!workspaceId) throw new Error("Select a workspace first.");
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error("Sign in again to save your calendar colors.");
      const { error } = await db.from("calendar_color_preferences").upsert(
        {
          workspace_id: workspaceId,
          user_id: auth.user.id,
          category_key: categoryKey,
          color,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,user_id,category_key" },
      );
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["calendar-categories", workspaceId] }),
  });
}

export const DEFAULT_CALENDAR_CATEGORIES: CalendarCategory[] = [
  {
    id: "content",
    workspace_id: "",
    category_key: "content",
    name: "Social posts",
    color: "#38BDF8",
    sort_order: 10,
    personal_color: null,
    effective_color: "#38BDF8",
  },
  {
    id: "production",
    workspace_id: "",
    category_key: "production",
    name: "Productions",
    color: "#F59E0B",
    sort_order: 20,
    personal_color: null,
    effective_color: "#F59E0B",
  },
  {
    id: "strategy",
    workspace_id: "",
    category_key: "strategy",
    name: "Ideas & strategy",
    color: "#A78BFA",
    sort_order: 30,
    personal_color: null,
    effective_color: "#A78BFA",
  },
];
