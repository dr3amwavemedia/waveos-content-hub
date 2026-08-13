import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CheckCircle2, Cloud, ExternalLink, Image, Loader2, Palette, Settings as SettingsIcon, ShieldCheck, Unplug, Upload } from "lucide-react";
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
import {
  DEFAULT_WORKSPACE_ACCENT,
  useWorkspaceBranding,
  workspaceThemeStyle,
} from "@/hooks/use-workspace-branding";
import {
  disconnectFrameioService,
  getFrameioServiceStatus,
  startFrameioServiceConnection,
} from "@/hooks/use-frameio";

const db = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

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
  const canManageBranding =
    Boolean(user?.isStaff) || activeWorkspace?.role === "owner" || activeWorkspace?.role === "admin";
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

      {activeWorkspace && canManageBranding && (
        <WorkspaceBrandingEditor
          workspaceId={activeWorkspace.id}
          workspaceName={activeWorkspace.name}
        />
      )}

      {user?.isDreamWaveOwner && <FrameioServiceConnectionCard />}

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

function FrameioServiceConnectionCard() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["frameio-service-status"],
    queryFn: getFrameioServiceStatus,
  });
  const connect = useMutation({
    mutationFn: startFrameioServiceConnection,
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Frame.io connection failed."),
  });
  const disconnect = useMutation({
    mutationFn: disconnectFrameioService,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["frameio-service-status"] });
      toast.success("Dream Wave Frame.io disconnected.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not disconnect Frame.io."),
  });
  const connected = status.data?.connected === true;
  return (
    <section className="surface-card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <Cloud className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">Dream Wave Frame.io</h2>
            {connected && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            One protected company connection powers the curated Shares assigned to client workspaces.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {status.isLoading ? "Checking connection…" : connected ? status.data?.email || "Connected" : status.data?.configured === false ? "Developer credentials needed" : "Not connected"}
          </p>
        </div>
      </div>
      {connected ? (
        <button type="button" onClick={() => disconnect.mutate()} disabled={disconnect.isPending} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50">
          {disconnect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />} Disconnect
        </button>
      ) : (
        <button type="button" onClick={() => connect.mutate()} disabled={status.isLoading || status.data?.configured === false || connect.isPending} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />} Connect Frame.io
        </button>
      )}
    </section>
  );
}

function WorkspaceBrandingEditor({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const qc = useQueryClient();
  const branding = useWorkspaceBranding(workspaceId);
  const [accentColor, setAccentColor] = useState(DEFAULT_WORKSPACE_ACCENT);
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);

  useEffect(() => {
    setAccentColor(branding.data?.accentColor ?? DEFAULT_WORKSPACE_ACCENT);
    setPendingLogo(null);
  }, [branding.data?.accentColor, workspaceId]);

  const save = useMutation({
    mutationFn: async () => {
      if (!/^#[0-9a-f]{6}$/i.test(accentColor)) throw new Error("Choose a valid brand color.");
      let logoPath = branding.data?.logoPath ?? null;
      if (pendingLogo) {
        if (!/^image\/(png|jpeg|webp)$/.test(pendingLogo.type))
          throw new Error("Use a PNG, JPG, or WebP logo.");
        if (pendingLogo.size > 5 * 1024 * 1024) throw new Error("Logo must be smaller than 5 MB.");
        const extension = pendingLogo.name.split(".").pop()?.toLowerCase() || "png";
        logoPath = `${workspaceId}/logo.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("workspace-branding")
          .upload(logoPath, pendingLogo, { contentType: pendingLogo.type, upsert: true });
        if (uploadError) throw uploadError;
      }
      const { error } = await db.from("workspace_branding").upsert({
        workspace_id: workspaceId,
        logo_path: logoPath,
        accent_color: accentColor.toUpperCase(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["workspace-branding", workspaceId] });
      setPendingLogo(null);
      toast.success("Workspace branding updated.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update workspace branding."),
  });

  const previewUrl = pendingLogo ? URL.createObjectURL(pendingLogo) : branding.data?.logoUrl;

  return (
    <section className="surface-card overflow-hidden" style={workspaceThemeStyle(accentColor)}>
      <div className="border-b border-border bg-gradient-to-r from-primary/15 via-transparent to-transparent p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Palette className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Workspace identity</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Give {workspaceName} a private, recognizable welcome while keeping the WaveOS luxury foundation.
            </p>
          </div>
        </div>
      </div>
      <div className="grid gap-6 p-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-3xl border border-primary/25 bg-elevated shadow-[var(--shadow-glow)]">
          {previewUrl ? (
            <img src={previewUrl} alt={`${workspaceName} logo preview`} className="h-full w-full object-contain p-3" />
          ) : (
            <Image className="h-8 w-8 text-primary" />
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client logo</span>
            <span className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-elevated px-4 py-3 text-sm font-medium text-foreground hover:border-primary/40">
              <Upload className="h-4 w-4 text-primary" />
              {pendingLogo ? pendingLogo.name : branding.data?.logoPath ? "Replace logo" : "Upload logo"}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(event) => setPendingLogo(event.target.files?.[0] ?? null)}
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Brand accent</span>
            <span className="flex items-center gap-3 rounded-xl border border-border bg-elevated px-3 py-2">
              <input
                type="color"
                value={accentColor}
                onChange={(event) => setAccentColor(event.target.value)}
                className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                aria-label="Brand accent color"
              />
              <input
                value={accentColor}
                onChange={(event) => setAccentColor(event.target.value)}
                maxLength={7}
                className="min-w-0 flex-1 bg-transparent font-mono text-sm uppercase text-foreground outline-none"
                aria-label="Brand accent hex value"
              />
            </span>
            <span className="flex flex-wrap gap-2" aria-label="Suggested brand colors">
              {["#4DB8FF", "#8B5CF6", "#E8B86D", "#F43F5E", "#22C55E", "#F8FAFC"].map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setAccentColor(color)}
                  className="h-7 w-7 rounded-full border border-white/20 ring-offset-2 ring-offset-background transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary"
                  style={{ backgroundColor: color }}
                  aria-label={`Use ${color}`}
                />
              ))}
            </span>
          </label>
          <div className="flex justify-end sm:col-span-2">
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending || branding.isLoading}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] disabled:opacity-50"
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save workspace style
            </button>
          </div>
          <p className="text-right text-xs text-muted-foreground sm:col-span-2">
            The preview changes immediately. Select Save to apply it throughout this workspace.
          </p>
        </div>
      </div>
    </section>
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
