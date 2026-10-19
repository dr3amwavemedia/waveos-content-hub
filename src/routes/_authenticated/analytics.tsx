import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, TrendingUp } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { RequireFeature } from "@/components/app/require-feature";
import { useWorkspace } from "@/components/app/workspace-context";
import { AnalyticsCheckup, type ObservedCount } from "@/components/social/analytics-checkup";
import { useContentItems, useSocialConnections } from "@/hooks/use-content";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: () => (
    <RequireFeature
      feature="can_view_analytics_checkup"
      title="Analytics isn't available for this workspace"
      description="Analytics is available to active WaveOS and Dream Wave Media client workspaces."
    >
      <AnalyticsPage />
    </RequireFeature>
  ),
  head: () => ({
    meta: [{ title: "Analytics — WaveOS" }, { name: "description", content: "Understand sourced social performance and historical growth in your WaveOS workspace." }, { property: "og:title", content: "Analytics — WaveOS" }, { property: "og:description", content: "Understand sourced social performance and historical growth in your WaveOS workspace." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }],
  }),
});

function queryCount(input: {
  pending: boolean;
  error: Error | null;
  value: number;
  unavailableReason: string;
}): ObservedCount {
  if (input.pending) return { value: null, state: "loading" };
  if (input.error) {
    return {
      value: null,
      state: "unavailable",
      unavailableReason: input.unavailableReason,
    };
  }
  return { value: input.value, state: "available" };
}

function AnalyticsPage() {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;
  const items = useContentItems(workspaceId, ["published"]);
  const connections = useSocialConnections(workspaceId);

  if (!activeWorkspace) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No workspace"
        body="Select a workspace to view the analytics."
      />
    );
  }

  const publishedPosts = queryCount({
    pending: items.isPending,
    error: items.error,
    value: items.data?.length ?? 0,
    unavailableReason: "Published-post records could not be loaded.",
  });
  const connectedChannels = queryCount({
    pending: connections.isPending,
    error: connections.error,
    value: connections.data?.filter((connection) => connection.connected).length ?? 0,
    unavailableReason: "Connected-channel records could not be loaded.",
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-emerald-300">
          <TrendingUp className="h-4 w-4" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em]">Performance & growth</p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          See how {activeWorkspace.name} is performing, where attention is growing, and which real provider metrics are available.
        </p>
      </div>
      {!connections.isPending &&
        !connections.error &&
        (connections.data?.filter((connection) => connection.connected).length ?? 0) === 0 && (
          <section className="rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:flex sm:items-center sm:justify-between sm:gap-4">
            <div>
              <h2 className="font-semibold text-foreground">Connect a social account to start seeing performance insights</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Once an account is connected and synced, WaveOS can begin showing the provider metrics available for this workspace.
              </p>
            </div>
            <Link
              to="/social-accounts"
              className="mt-4 inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground sm:mt-0"
            >
              Connect account
            </Link>
          </section>
        )}
      <AnalyticsCheckup
        workspaceId={activeWorkspace.id}
        publishedPosts={publishedPosts}
        connectedChannels={connectedChannels}
      />
    </div>
  );
}
