import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, RefreshCcw, Share2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/app/empty-state";
import { useWorkspace } from "@/components/app/workspace-context";
import { useCurrentUser } from "@/hooks/use-waveos";
import { PLATFORM_LABEL, useSocialConnections, type SocialPlatform } from "@/hooks/use-content";
import {
  createAyrshareConnectUrl,
  ensureAyrshareProfile,
  getIntegrationStatus,
  refreshSocialConnections,
} from "@/lib/ayrshare.functions";

export const Route = createFileRoute("/_authenticated/social-accounts")({
  component: SocialAccountsPage,
  head: () => ({
    meta: [{ title: "Social Accounts — WaveOS" }, { name: "robots", content: "noindex" }],
  }),
});

const SUPPORTED: SocialPlatform[] = [
  "instagram", "facebook", "tiktok", "youtube", "linkedin", "x", "pinterest", "threads", "bluesky",
];

function SocialAccountsPage() {
  const { activeWorkspace } = useWorkspace();
  const { data: user } = useCurrentUser();
  const workspaceId = activeWorkspace?.id ?? null;
  const conns = useSocialConnections(workspaceId);
  const qc = useQueryClient();

  const statusFn = useServerFn(getIntegrationStatus);
  const status = useQuery({
    queryKey: ["integration-status"],
    queryFn: () => statusFn(),
    enabled: !!user,
    staleTime: 60_000,
  });

  const ensureFn = useServerFn(ensureAyrshareProfile);
  const connectFn = useServerFn(createAyrshareConnectUrl);
  const refreshFn = useServerFn(refreshSocialConnections);
  const [busy, setBusy] = useState<"connect" | "refresh" | null>(null);

  if (!activeWorkspace) {
    return <EmptyState icon={Share2} title="No workspace" body="Select a workspace to manage its social accounts." />;
  }

  const ayrshareReady = status.data?.ayrshare.api_key ?? false;

  async function handleConnect() {
    if (!workspaceId) return;
    setBusy("connect");
    try {
      await ensureFn({ data: { workspaceId } });
      const { url } = await connectFn({ data: { workspaceId } });
      if (!url) throw new Error("No connect URL returned");
      window.open(url, "waveos-connect", "width=760,height=780");
      toast.success("Opening secure connect window…");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleRefresh() {
    if (!workspaceId) return;
    setBusy("refresh");
    try {
      const r = await refreshFn({ data: { workspaceId } });
      toast.success(`Synced ${r.updated} account${r.updated === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["social-connections"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const connectionByPlatform = new Map((conns.data ?? []).map((c) => [c.platform, c]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Social accounts</h1>
          <p className="text-sm text-muted-foreground">
            Connect each channel Dream Wave Media will publish for {activeWorkspace.name}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={!ayrshareReady || busy !== null}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-elevated px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-50"
          >
            {busy === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Sync
          </button>
          <button
            onClick={handleConnect}
            disabled={!ayrshareReady || busy !== null}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
          >
            {busy === "connect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            Connect a channel
          </button>
        </div>
      </div>

      {!ayrshareReady && (
        <div className="surface-card p-5 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Social publishing is not configured yet.</p>
          <p className="mt-1">
            Dream Wave Media staff need to add the Ayrshare API credentials before channels can be connected.
            Once configured, this page will show a "Connect" button that opens a secure white-label flow.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SUPPORTED.map((p) => {
          const c = connectionByPlatform.get(p);
          const on = !!c?.connected;
          return (
            <div
              key={p}
              className={cn(
                "surface-card space-y-2 p-4",
                on ? "ring-1 ring-primary/30" : "",
              )}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-foreground">{PLATFORM_LABEL[p]}</div>
                {on ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" /> Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    <XCircle className="h-3 w-3" /> Not connected
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {c?.display_name || c?.username || "No account linked"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
