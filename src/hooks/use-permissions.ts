import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/components/app/workspace-context";
import { useCurrentUser } from "@/hooks/use-waveos";
import { useImpersonateClient } from "@/hooks/use-impersonation";
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

  const impersonate = useImpersonateClient();

  return useMemo<WorkspacePermissions>(() => {
    const isStaff = !!user?.isStaff;
    const clientAccess: WorkspaceAccess | null = data
      ? {
          tier: data.access_tier,
          status: data.account_status,
          expiresAt: data.access_expires_at,
          overrides: (data.feature_overrides ?? {}) as WorkspaceAccess["overrides"],
        }
      : null;

    // Staff normally get full access; when "View as Client" is on, they get the
    // exact same access as the actual client of this workspace would.
    if (isStaff && !impersonate.on) {
      return {
        access: STAFF_ACCESS,
        raw: data ?? null,
        isLoading,
        isStaff,
        can: (f) => hasFeature(STAFF_ACCESS, f),
        visibility: (f) => featureVisibility(STAFF_ACCESS, f),
      };
    }

    return {
      access: clientAccess,
      raw: data ?? null,
      isLoading,
      isStaff,
      can: (f) => (clientAccess ? hasFeature(clientAccess, f) : false),
      visibility: (f) => (clientAccess ? featureVisibility(clientAccess, f) : "hidden"),
    };
  }, [data, isLoading, user?.isStaff, impersonate.on]);
}
