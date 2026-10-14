import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as {
  // New additive Phase 1 table may precede generated Supabase client types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

interface WorkflowDraftRow<T> {
  id: string;
  workspace_id: string;
  user_id: string;
  workflow_key: string;
  entity_id: string | null;
  payload: T;
  updated_at: string;
}

export function useWorkflowDraft<T>({
  workspaceId,
  workflowKey,
  entityId = null,
}: {
  workspaceId: string | null | undefined;
  workflowKey: string;
  entityId?: string | null;
}) {
  const queryClient = useQueryClient();
  const key = ["workflow-draft", workspaceId, workflowKey, entityId] as const;

  const query = useQuery({
    queryKey: key,
    enabled: Boolean(workspaceId),
    queryFn: async (): Promise<WorkflowDraftRow<T> | null> => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw authError ?? new Error("Sign in to restore drafts.");
      let request = db
        .from("workflow_drafts")
        .select("id,workspace_id,user_id,workflow_key,entity_id,payload,updated_at")
        .eq("workspace_id", workspaceId!)
        .eq("user_id", auth.user.id)
        .eq("workflow_key", workflowKey);
      request = entityId ? request.eq("entity_id", entityId) : request.is("entity_id", null);
      const { data, error } = await request.maybeSingle();
      if (error) throw error;
      return (data ?? null) as WorkflowDraftRow<T> | null;
    },
  });

  const save = useMutation({
    mutationFn: async (payload: T) => {
      if (!workspaceId) throw new Error("Select a workspace before saving this draft.");
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw authError ?? new Error("Sign in to save drafts.");
      const existing = query.data;
      if (existing?.id) {
        const { data, error } = await db
          .from("workflow_drafts")
          .update({ payload })
          .eq("id", existing.id)
          .eq("workspace_id", workspaceId)
          .select("id,workspace_id,user_id,workflow_key,entity_id,payload,updated_at")
          .single();
        if (error) throw error;
        return data as WorkflowDraftRow<T>;
      }
      const { data, error } = await db
        .from("workflow_drafts")
        .insert({
          workspace_id: workspaceId,
          user_id: auth.user.id,
          workflow_key: workflowKey,
          entity_id: entityId,
          payload,
        })
        .select("id,workspace_id,user_id,workflow_key,entity_id,payload,updated_at")
        .single();
      if (error) throw error;
      return data as WorkflowDraftRow<T>;
    },
    onSuccess: (row) => queryClient.setQueryData(key, row),
  });

  const discard = useMutation({
    mutationFn: async () => {
      if (!workspaceId) return;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      let request = db
        .from("workflow_drafts")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("user_id", auth.user.id)
        .eq("workflow_key", workflowKey);
      request = entityId ? request.eq("entity_id", entityId) : request.is("entity_id", null);
      const { error } = await request;
      if (error) throw error;
    },
    onSuccess: () => queryClient.setQueryData(key, null),
  });

  return { ...query, save, discard };
}
