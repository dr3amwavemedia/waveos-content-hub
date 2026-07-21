import { RequireFeature } from "@/components/app/require-feature";
import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, TrendingUp } from "lucide-react";

import { useWorkspace } from "@/components/app/workspace-context";
import { EmptyState } from "@/components/app/empty-state";
import { useContentItems, useSocialConnections, PLATFORM_LABEL } from "@/hooks/use-content";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: () => (
    <RequireFeature feature="can_view_analytics" title="Analytics isn't included in your plan">
      <AnalyticsPage />
    </RequireFeature>
  ),
  head: () => ({
    meta: [{ title: "Analytics — WaveOS" }, { name: "robots", content: "noindex" }],
  }),
});

function AnalyticsPage() {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;
  const items = useContentItems(workspaceId, ["published"]);
  const conns = useSocialConnections(workspaceId);

  if (!activeWorkspace) {
    return <EmptyState icon={BarChart3} title="No workspace" body="Select a workspace to view analytics." />;
  }

  const published = (items.data ?? []).length;
  const connected = (conns.data ?? []).filter((c) => c.connected).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Cross-platform performance for {activeWorkspace.name}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Published posts" value={published} />
        <Stat label="Connected channels" value={connected} />
        <Stat label="Total impressions" value="—" hint="Available once posts publish." />
        <Stat label="Total engagement" value="—" hint="Available once posts publish." />
      </div>

      <div className="surface-card p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <TrendingUp className="h-4 w-4 text-primary" /> Per-platform performance
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Per-platform analytics arrive after your first successful publish. WaveOS pulls metrics from each connected
          channel via Ayrshare; channels that don't expose analytics show "Not available from this platform" here.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(conns.data ?? []).filter((c) => c.connected).map((c) => (
            <div key={c.platform} className="rounded-lg border border-border bg-elevated/40 p-3">
              <div className="text-sm font-semibold text-foreground">{PLATFORM_LABEL[c.platform]}</div>
              <div className="text-xs text-muted-foreground">
                {c.display_name || c.username || "Connected"}
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">Metrics pending first publish.</div>
            </div>
          ))}
          {(conns.data ?? []).filter((c) => c.connected).length === 0 && (
            <p className="text-sm text-muted-foreground">Connect a channel to start collecting analytics.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="surface-card p-5">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-bold text-foreground">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
