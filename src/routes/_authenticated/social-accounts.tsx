import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, RefreshCcw, Share2, ShieldCheck, XCircle } from "lucide-react";
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
  getWorkspaceAyrshareStatus,
  refreshSocialConnections,
  setRequireFreshSocialLogin,
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

  const wsStatusFn = useServerFn(getWorkspaceAyrshareStatus);
  const wsStatus = useQuery({
    queryKey: ["workspace-ayrshare-status", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => wsStatusFn({ data: { workspaceId: workspaceId! } }),
  });

  const ensureFn = useServerFn(ensureAyrshareProfile);
  const connectFn = useServerFn(createAyrshareConnectUrl);
  const refreshFn = useServerFn(refreshSocialConnections);
  const toggleFn = useServerFn(setRequireFreshSocialLogin);
  const [busy, setBusy] = useState<"connect" | "refresh" | null>(null);

  // Ensure the connections list shown is the current workspace's — never a
  // cached list from a previously active workspace.
  useEffect(() => {
    if (workspaceId) qc.invalidateQueries({ queryKey: ["social-connections", workspaceId] });
  }, [workspaceId, qc]);

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => toggleFn({ data: { workspaceId: workspaceId!, enabled } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-ayrshare-status", workspaceId] });
      toast.success("Preference saved");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!activeWorkspace || !workspaceId) {
    return <EmptyState icon={Share2} title="No workspace" body="Select a workspace to manage its social accounts." />;
  }

  const ayrshareReady = status.data?.ayrshare.api_key ?? false;
  const fingerprint = wsStatus.data?.profileFingerprint;

  async function handleConnect() {
    if (!workspaceId) return;
    setBusy("connect");
    try {
      await ensureFn({ data: { workspaceId } });
      const { url, diagnostics } = await connectFn({ data: { workspaceId } });
      if (!url) throw new Error("No connect URL returned");
      if (!diagnostics.urlHostOk) throw new Error("Unexpected connect URL host");
      // Open in a FRESH popup with noopener so no prior tab context is inherited.
      const popup = window.open(url, `waveos-connect-${workspaceId}`, "width=760,height=780,noopener");
      if (!popup) toast.error("Popup blocked — allow pop-ups and try again");
      else toast.success(diagnostics.logout ? "Opening fresh Ayrshare session…" : "Opening secure connect window…");
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
      // Scope invalidation to this workspace only.
      qc.invalidateQueries({ queryKey: ["social-connections", workspaceId] });
      qc.invalidateQueries({ queryKey: ["workspace-ayrshare-status", workspaceId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const connectionByPlatform = new Map((conns.data ?? []).map((c) => [c.platform, c]));
  const requireFresh = wsStatus.data?.requireFreshLogin ?? false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Social accounts</h1>
          <p className="text-sm text-muted-foreground">
            Connect the channels you want to publish to from {activeWorkspace.name}.
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
            Social publishing credentials aren't set up on this environment yet. Once configured, you'll be able to
            connect Instagram, Facebook, TikTok, YouTube, LinkedIn, X, Pinterest, Threads, and Bluesky from here.
          </p>
        </div>
      )}

      {ayrshareReady && (
        <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <div>
              <div className="font-semibold text-foreground">Workspace isolation</div>
              <div className="text-xs text-muted-foreground">
                {fingerprint
                  ? <>Ayrshare profile <span className="font-mono">•{fingerprint}</span> is dedicated to this workspace.</>
                  : "No Ayrshare profile yet — one will be created on first connect."}
              </div>
            </div>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={requireFresh}
              disabled={toggleMutation.isPending}
              onChange={(e) => toggleMutation.mutate(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Always require fresh social-account login
          </label>
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

