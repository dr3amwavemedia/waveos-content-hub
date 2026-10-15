import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useWorkspace } from "@/components/app/workspace-context";
import { usePermissions } from "@/hooks/use-permissions";
import { useCurrentUser } from "@/hooks/use-waveos";
import { supabase } from "@/integrations/supabase/client";
import {
  releaseMatchesAudience,
  type ProductRelease,
  type ReleaseAudience,
} from "@/lib/product-release-audience";

export { releaseMatchesAudience, safeReleaseLink } from "@/lib/product-release-audience";
export type { ProductRelease, ReleaseAudience } from "@/lib/product-release-audience";

export interface ReleaseUserState {
  release_id: string;
  viewed_at: string;
  acknowledged_at: string | null;
  dismissed_at: string | null;
}

export interface ApplicableRelease extends ProductRelease {
  state: ReleaseUserState | null;
}

const releaseDb = supabase as unknown as {
  // Generated Supabase types are refreshed after the additive migration lands.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

function validPublishedRelease(value: unknown): value is ProductRelease {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<ProductRelease>;
  if (
    typeof row.id !== "string" ||
    typeof row.version !== "string" ||
    typeof row.title !== "string" ||
    typeof row.summary !== "string" ||
    typeof row.body !== "string" ||
    typeof row.published_at !== "string"
  ) {
    return false;
  }
  const publishedAt = new Date(row.published_at).getTime();
  return Number.isFinite(publishedAt) && publishedAt <= Date.now();
}

function normalizeRelease(value: ProductRelease): ProductRelease {
  return {
    ...value,
    target_data_sources: Array.isArray(value.target_data_sources)
      ? value.target_data_sources.filter((item): item is string => typeof item === "string")
      : [],
    target_public_plans: Array.isArray(value.target_public_plans)
      ? value.target_public_plans.filter((item): item is string => typeof item === "string")
      : [],
    target_client_tiers: Array.isArray(value.target_client_tiers)
      ? value.target_client_tiers.filter((item): item is string => typeof item === "string")
      : [],
    target_workspace_roles: Array.isArray(value.target_workspace_roles)
      ? value.target_workspace_roles.filter((item): item is string => typeof item === "string")
      : [],
    link_url: typeof value.link_url === "string" ? value.link_url : null,
  };
}

export function useProductReleases() {
  const { activeWorkspace } = useWorkspace();
  const { subscription, isStaff, isLoading: permissionsLoading } = usePermissions();
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const workspaceId = activeWorkspace?.id ?? null;
  const audience: ReleaseAudience | null = activeWorkspace
    ? {
        dataSource: activeWorkspace.data_source,
        publicPlan: activeWorkspace.data_source === "os_data" ? (subscription?.plan ?? null) : null,
        clientTier: activeWorkspace.access_tier,
        workspaceRole: activeWorkspace.role,
        isStaff,
      }
    : null;
  const queryKey = [
    "product-releases",
    user?.actualUserId ?? user?.userId,
    workspaceId,
    audience?.publicPlan,
    audience?.clientTier,
    audience?.workspaceRole,
    audience?.isStaff,
  ] as const;

  const query = useQuery({
    queryKey,
    enabled: Boolean(user && audience && !permissionsLoading),
    staleTime: 60_000,
    queryFn: async () => {
      const { data: releases, error: releasesError } = await releaseDb
        .from("product_releases")
        .select(
          "id,version,title,summary,body,published_at,target_data_sources,target_public_plans,target_client_tiers,target_workspace_roles,link_url",
        )
        .not("published_at", "is", null)
        .lte("published_at", new Date().toISOString())
        .order("published_at", { ascending: false });
      if (releasesError) throw releasesError;

      const applicable = ((releases ?? []) as unknown[])
        .filter(validPublishedRelease)
        .map(normalizeRelease)
        .filter((release) => releaseMatchesAudience(release, audience!));
      const ids = applicable.map((release) => release.id);

      const [statesResult, preferencesResult] = await Promise.all([
        ids.length
          ? releaseDb
              .from("release_user_states")
              .select("release_id,viewed_at,acknowledged_at,dismissed_at")
              .in("release_id", ids)
          : Promise.resolve({ data: [], error: null }),
        releaseDb.from("release_preferences").select("auto_show_releases").maybeSingle(),
      ]);
      if (statesResult.error) throw statesResult.error;
      if (preferencesResult.error) throw preferencesResult.error;
      const states = new Map(
        ((statesResult.data ?? []) as ReleaseUserState[]).map((state) => [state.release_id, state]),
      );

      return {
        releases: applicable.map((release) => ({
          ...release,
          state: states.get(release.id) ?? null,
        })),
        autoShow: preferencesResult.data?.auto_show_releases !== false,
      };
    },
  });

  const stateMutation = useMutation({
    mutationFn: async ({
      release,
      action,
    }: {
      release: ApplicableRelease;
      action: "view" | "acknowledge" | "dismiss";
    }) => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw authError ?? new Error("Please sign in again.");
      const now = new Date().toISOString();
      const patch = {
        viewed_at: release.state?.viewed_at ?? now,
        ...(action === "acknowledge" ? { acknowledged_at: now } : {}),
        ...(action === "dismiss" ? { dismissed_at: now } : {}),
      };
      if (release.state) {
        const { error } = await releaseDb
          .from("release_user_states")
          .update(patch)
          .eq("release_id", release.id)
          .eq("user_id", auth.user.id);
        if (error) throw error;
      } else {
        const { error } = await releaseDb.from("release_user_states").insert({
          release_id: release.id,
          user_id: auth.user.id,
          viewed_at: patch.viewed_at,
          acknowledged_at: action === "acknowledge" ? now : null,
          dismissed_at: action === "dismiss" ? now : null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["product-releases"] }),
  });

  const preferenceMutation = useMutation({
    mutationFn: async (autoShow: boolean) => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw authError ?? new Error("Please sign in again.");
      const { error } = await releaseDb.from("release_preferences").upsert(
        {
          user_id: auth.user.id,
          auto_show_releases: autoShow,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
      return autoShow;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["product-releases"] }),
  });

  const releases = query.data?.releases ?? [];
  return {
    ...query,
    releases,
    unreadReleases: releases.filter((release) => !release.state?.acknowledged_at),
    // Announcements are intentionally one-view. A release only becomes a popup when
    // it was explicitly published and this user has never viewed it before.
    popupRelease: releases.find((release) => !release.state?.viewed_at) ?? null,
    autoShow: query.data?.autoShow ?? true,
    markState: stateMutation.mutateAsync,
    statePending: stateMutation.isPending,
    setAutoShow: preferenceMutation.mutateAsync,
    preferencePending: preferenceMutation.isPending,
  };
}
