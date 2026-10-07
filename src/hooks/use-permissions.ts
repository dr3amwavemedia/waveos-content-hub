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

export interface PublicSubscriptionState {
  plan: "trial" | "standard" | "full" | "expanded";
  status: string;
  trial_ends_at: string | null;
  payment_failure_count: number;
  service_locked_at: string | null;
  stripe_subscription_id: string | null;
}

export interface WorkspacePermissions {
  access: WorkspaceAccess | null;
  raw: WorkspaceAccessRow | null;
  subscription: PublicSubscriptionState | null;
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

const PUBLIC_OS_FEATURES = new Set<FeatureKey>([
  "can_view_profile",
  "can_edit_profile",
  "can_manage_brand_voice",
  "can_view_calendar_preview",
  "can_view_media_library",
  "can_upload_media",
  "can_create_content",
  "can_connect_socials",
  "can_publish_content",
  "can_view_analytics",
  "can_view_activity_log",
  "can_invite_members",
  "can_manage_workspace",
]);

const PUBLIC_OS_PREMIUM_FEATURES = new Set<FeatureKey>([
  "can_use_ai_tools",
  "can_schedule_content",
]);

export function publicSubscriptionActive(subscription: PublicSubscriptionState | null) {
  if (!subscription || subscription.service_locked_at) return false;
  if (subscription.status === "trialing") {
    return Boolean(
      subscription.stripe_subscription_id &&
      subscription.trial_ends_at &&
      new Date(subscription.trial_ends_at).getTime() > Date.now(),
    );
  }
  if (!subscription.stripe_subscription_id) return false;
  if (subscription.status === "active") return true;
  return subscription.status === "past_due" && subscription.payment_failure_count < 2;
}

export function usePermissions(): WorkspacePermissions {
  const { activeWorkspace } = useWorkspace();
  const { data: user } = useCurrentUser();
  const workspaceId = activeWorkspace?.id ?? null;
  const isPublicOs = activeWorkspace?.data_source === "os_data";

  const { data, isLoading } = useQuery({
    queryKey: ["workspace-access", workspaceId],
    enabled: !!workspaceId,
    staleTime: 60_000,
    queryFn: async (): Promise<WorkspaceAccessRow | null> => {
      const { data, error } = await supabase
        .from("workspaces")
        .select(
          "access_tier, account_status, agreement_term, access_starts_at, access_expires_at, activated_at, invited_at, feature_overrides",
        )
        .eq("id", workspaceId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as WorkspaceAccessRow | null;
    },
  });

  const subscriptionQuery = useQuery({
    queryKey: ["workspace-social-subscription-access", workspaceId],
    enabled: !!workspaceId && isPublicOs,
    staleTime: 30_000,
    queryFn: async (): Promise<PublicSubscriptionState | null> => {
      const { data, error } = await supabase
        .from("workspace_social_subscriptions")
        .select(
          "plan,status,trial_ends_at,payment_failure_count,service_locked_at,stripe_subscription_id",
        )
        .eq("workspace_id", workspaceId!)
        .maybeSingle();
      if (error) throw error;
      return data as PublicSubscriptionState | null;
    },
  });

  const impersonate = useImpersonateClient();

  return useMemo<WorkspacePermissions>(() => {
    // During "View as client", all UI authorization must use the effective
    // client identity. The real staff role remains available only after exit.
    const isStaff = !!user?.isStaff && !impersonate.on;
    const clientAccess: WorkspaceAccess | null = data
      ? {
          tier: impersonate.on && impersonate.tier ? impersonate.tier : data.access_tier,
          status: data.account_status,
          expiresAt: data.access_expires_at,
          overrides: (data.feature_overrides ?? {}) as WorkspaceAccess["overrides"],
        }
      : null;

    // Staff normally get full access; when "View as Client" is on, they get the
    // exact same access as the actual client of this workspace would.
    if (isStaff) {
      return {
        access: STAFF_ACCESS,
        raw: data ?? null,
        subscription: subscriptionQuery.data ?? null,
        isLoading,
        isStaff,
        can: (f) => hasFeature(STAFF_ACCESS, f),
        visibility: (f) => featureVisibility(STAFF_ACCESS, f),
      };
    }

    if (isPublicOs) {
      const subscription = subscriptionQuery.data ?? null;
      const active = publicSubscriptionActive(subscription);
      const premium = subscription?.plan === "full" || subscription?.plan === "expanded";
      const allowed = (feature: FeatureKey) =>
        active &&
        (PUBLIC_OS_FEATURES.has(feature) || (premium && PUBLIC_OS_PREMIUM_FEATURES.has(feature)));
      return {
        access: clientAccess,
        raw: data ?? null,
        subscription,
        isLoading: isLoading || subscriptionQuery.isLoading,
        isStaff,
        can: allowed,
        visibility: (feature) => (allowed(feature) ? "enabled" : "hidden"),
      };
    }

    return {
      access: clientAccess,
      raw: data ?? null,
      subscription: null,
      isLoading,
      isStaff,
      can: (f) => (clientAccess ? hasFeature(clientAccess, f) : false),
      visibility: (f) => (clientAccess ? featureVisibility(clientAccess, f) : "hidden"),
    };
  }, [
    data,
    isLoading,
    user?.isStaff,
    impersonate.on,
    impersonate.tier,
    isPublicOs,
    subscriptionQuery.data,
    subscriptionQuery.isLoading,
  ]);
}
