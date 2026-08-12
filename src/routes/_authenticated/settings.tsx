import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Cloud, ExternalLink, Loader2, Settings as SettingsIcon, ShieldCheck, Unplug } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-waveos";
import { useWorkspace } from "@/components/app/workspace-context";
import { supabase } from "@/integrations/supabase/client";
import {
  disconnectExternalMedia,
  getExternalMediaStatus,
  startExternalMediaConnection,
  type ExternalMediaProvider,
} from "@/hooks/use-external-media";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Settings — WaveOS" }] }),
});

function SettingsPage() {
  const { data: user } = useCurrentUser();
  const { activeWorkspace } = useWorkspace();
  const qc = useQueryClient();
  const canManageApproval =
    !user?.isStaff && (activeWorkspace?.role === "owner" || activeWorkspace?.role === "admin");
  const automaticApproval = activeWorkspace?.approval_required === false;
  const updateApproval = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!activeWorkspace) throw new Error("No workspace selected.");
      const { error } = await supabase.rpc("set_workspace_automatic_content_approval", {
        _workspace_id: activeWorkspace.id,
        _enabled: enabled,
      });
      if (error) throw error;
    },
    onSuccess: async (_, enabled) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["waveos", "workspaces"] }),
        qc.invalidateQueries({ queryKey: ["workspace-access", activeWorkspace?.id] }),
      ]);
      toast.success(
        enabled ? "Automatic post approval is on." : "Post approval is required again.",
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update approval settings."),
  });

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Account</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Settings
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Manage your profile and workspace preferences.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface-card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            You
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Row
              label="Name"
              value={[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "—"}
            />
            <Row label="Email" value={user?.email ?? "—"} />
            <Row
              label="Role"
              value={
                user?.isDreamWaveOwner
                  ? "Dream Wave Owner"
                  : user?.isStaff
                    ? "Dream Wave Team"
                    : "Client"
              }
            />
          </dl>
        </div>

        <div className="surface-card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Active workspace
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="Name" value={activeWorkspace?.name ?? "—"} />
            <Row label="Industry" value={activeWorkspace?.industry ?? "Not set"} />
            <Row label="Timezone" value={activeWorkspace?.timezone ?? "—"} />
            <Row label="Your access" value={activeWorkspace?.role ?? "—"} />
          </dl>
        </div>
      </div>

      {canManageApproval && (
        <div className="surface-card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Automatic post approval</h3>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Turn this on during busy periods to let your Dream Wave Media manager schedule and
                publish without waiting for individual approvals. You can turn it off anytime.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={automaticApproval}
            disabled={updateApproval.isPending}
            onClick={() => updateApproval.mutate(!automaticApproval)}
            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${automaticApproval ? "bg-primary" : "bg-elevated ring-1 ring-border"}`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${automaticApproval ? "translate-x-7" : "translate-x-1"}`}
            />
            <span className="sr-only">Automatic post approval</span>
          </button>
        </div>
      )}

      {activeWorkspace && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Connected media storage</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Let your team pick files from your storage without copying the originals into WaveOS.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <StorageConnectionCard
              provider="google_drive"
              workspaceId={activeWorkspace.id}
              label="Google Drive"
            />
            <StorageConnectionCard
              provider="dropbox"
              workspaceId={activeWorkspace.id}
              label="Dropbox"
            />
          </div>
        </section>
      )}

      <div className="surface-card flex items-start gap-4 p-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <SettingsIcon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">More settings coming soon</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Notification preferences, timezone, language, and workspace admin tools land in later
            phases.
          </p>
        </div>
      </div>
    </div>
  );
}

function StorageConnectionCard({
  provider,
  workspaceId,
  label,
}: {
  provider: ExternalMediaProvider;
  workspaceId: string;
  label: string;
}) {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["external-media-status", workspaceId, provider],
    queryFn: () => getExternalMediaStatus(provider, workspaceId),
  });
  const connect = useMutation({
    mutationFn: async () => {
      const result = await startExternalMediaConnection(provider, workspaceId);
      window.location.assign(result.url);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Connection failed."),
  });
  const disconnect = useMutation({
    mutationFn: () => disconnectExternalMedia(provider, workspaceId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["external-media-status", workspaceId, provider] });
      toast.success(`${label} disconnected.`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Disconnect failed."),
  });
  const connected = status.data?.connected === true;
  const configured = status.data?.configured !== false;

  return (
    <div className="surface-card flex items-center justify-between gap-4 p-5">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <Cloud className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground">{label}</h3>
            {connected && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {status.isLoading
              ? "Checking connection…"
              : connected
                ? status.data?.account?.email || "Connected"
                : configured
                  ? "Not connected"
                  : "Developer credentials needed"}
          </p>
        </div>
      </div>
      {connected ? (
        <button
          type="button"
          onClick={() => disconnect.mutate()}
          disabled={disconnect.isPending}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {disconnect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
          Disconnect
        </button>
      ) : (
        <button
          type="button"
          onClick={() => connect.mutate()}
          disabled={!configured || status.isLoading || connect.isPending}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          Connect
        </button>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,100px)_minmax(0,1fr)] items-baseline gap-3">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium text-foreground">{value}</dd>
    </div>
  );
}
