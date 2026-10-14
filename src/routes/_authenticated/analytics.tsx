import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { RequireFeature } from "@/components/app/require-feature";
import { useWorkspace } from "@/components/app/workspace-context";
import { AnalyticsCheckup, type ObservedCount } from "@/components/social/analytics-checkup";
import { useContentItems, useSocialConnections } from "@/hooks/use-content";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: () => (
    <RequireFeature
      feature="can_view_analytics_checkup"
      title="Analytics checkup isn't available for this workspace"
      description="Analytics checkup is available to active WaveOS and Dream Wave Media client workspaces."
    >
      <AnalyticsPage />
    </RequireFeature>
  ),
  head: () => ({
    meta: [{ title: "Analytics Checkup — WaveOS" }, { name: "robots", content: "noindex" }],
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
        body="Select a workspace to view the analytics checkup."
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
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Phase 1</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Analytics checkup</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Inspect available performance data, missing-source states, and calculation provenance for{" "}
          {activeWorkspace.name}.
        </p>
      </div>
      <AnalyticsCheckup
        workspaceId={activeWorkspace.id}
        publishedPosts={publishedPosts}
        connectedChannels={connectedChannels}
      />
    </div>
  );
}
