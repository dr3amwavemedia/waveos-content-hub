import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/components/app/workspace-context";
import { useCurrentUser } from "@/hooks/use-waveos";
import {
  hasFeature,
  featureVisibility,
  type FeatureKey,
  type WorkspaceAccess,
  type ClientAccessTier,
  type AccountStatus,
  type AgreementTerm,
} from "@/lib/permissions";

interface WorkspaceAccessRow {
  access_tier: ClientAccessTier;
  account_status: AccountStatus;
  agreement_term: AgreementTerm | null;
  access_starts_at: string | null;
  access_expires_at: string | null;
  activated_at: string | null;
  invited_at: string | null;
  feature_overrides: Record<string, boolean> | null;
}

export interface WorkspacePermissions {
  access: WorkspaceAccess | null;
  raw: WorkspaceAccessRow | null;
  isLoading: boolean;
  isStaff: boolean;
  can: (feature: FeatureKey) => boolean;
  visibility: (feature: FeatureKey) => "enabled" | "preview" | "hidden";
}

const STAFF_ACCESS: WorkspaceAccess = {
  tier: "retainer_full",
  status: "active",
  expiresAt: null,
  overrides: {},
};

export function usePermissions(): WorkspacePermissions {
  const { activeWorkspace } = useWorkspace();
  const { data: user } = useCurrentUser();
  const workspaceId = activeWorkspace?.id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["workspace-access", workspaceId],
    enabled: !!workspaceId,
    staleTime: 60_000,
    queryFn: async (): Promise<WorkspaceAccessRow | null> => {
      const { data, error } = await supabase
        .from("workspaces")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select(
          "access_tier, account_status, agreement_term, access_starts_at, access_expires_at, activated_at, invited_at, feature_overrides",
        )
        .eq("id", workspaceId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as WorkspaceAccessRow | null;
    },
  });

  return useMemo<WorkspacePermissions>(() => {
    const isStaff = !!user?.isStaff;
    // Staff always get full access to any workspace they open.
    if (isStaff) {
      return {
        access: STAFF_ACCESS,
        raw: data ?? null,
        isLoading,
        isStaff,
        can: (f) => hasFeature(STAFF_ACCESS, f),
        visibility: (f) => featureVisibility(STAFF_ACCESS, f),
      };
    }

    const access: WorkspaceAccess | null = data
      ? {
          tier: data.access_tier,
          status: data.account_status,
          expiresAt: data.access_expires_at,
          overrides: (data.feature_overrides ?? {}) as WorkspaceAccess["overrides"],
        }
      : null;

    return {
      access,
      raw: data ?? null,
      isLoading,
      isStaff,
      can: (f) => (access ? hasFeature(access, f) : false),
      visibility: (f) => (access ? featureVisibility(access, f) : "hidden"),
    };
  }, [data, isLoading, user?.isStaff]);
}
