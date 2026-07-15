import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Archive,
  Check,
  Copy,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Users2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/app/empty-state";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/clients")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", data.user.id);
    const staff = (roles ?? []).some(
      (r) => r.role === "dream_wave_owner" || r.role === "dream_wave_team",
    );
    if (!staff) throw redirect({ to: "/home" });
  },
  component: ClientsPage,
  head: () => ({
    meta: [{ title: "Clients — WaveOS" }, { name: "robots", content: "noindex" }],
  }),
});

type WorkspaceStatus = "onboarding" | "active" | "paused" | "archived";

interface ClientWorkspace {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  timezone: string;
  is_demo: boolean;
  status: WorkspaceStatus;
  service_tier: string | null;
  account_manager_id: string | null;
  last_activity_at: string | null;
  created_at: string;
  member_count: number;
  invite_count: number;
  media_count: number;
}

function ClientsPage() {
  const [open, setOpen] = useState(false);
  const [newInviteLink, setNewInviteLink] = useState<{
    link: string; email: string; workspace: string;
  } | null>(null);
  const [selectedWs, setSelectedWs] = useState<ClientWorkspace | null>(null);

  const qc = useQueryClient();

  const workspacesQ = useQuery({
    queryKey: ["clients", "workspaces"],
    queryFn: async () => {
      const { data: ws, error } = await supabase
        .from("workspaces")
        .select("id,name,slug,industry,timezone,is_demo,status,service_tier,account_manager_id,last_activity_at,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const [{ data: members }, { data: invites }, { data: media }] = await Promise.all([
        supabase.from("workspace_members").select("workspace_id"),
        supabase.from("invites_admin").select("workspace_id").eq("status", "pending"),
        supabase.from("media_assets").select("workspace_id").is("archived_at", null),
      ]);
      const bump = (m: Map<string, number>, k: string | null) => {
        if (!k) return; m.set(k, (m.get(k) ?? 0) + 1);
      };
      const mCount = new Map<string, number>();
      (members ?? []).forEach((m) => bump(mCount, m.workspace_id));
      const iCount = new Map<string, number>();
      (invites ?? []).forEach((i) => bump(iCount, i.workspace_id));
      const mediaCount = new Map<string, number>();
      (media ?? []).forEach((m) => bump(mediaCount, m.workspace_id));
      return (ws ?? []).map<ClientWorkspace>((w) => ({
        ...w,
        member_count: mCount.get(w.id) ?? 0,
        invite_count: iCount.get(w.id) ?? 0,
        media_count: mediaCount.get(w.id) ?? 0,
      }));
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: WorkspaceStatus }) => {
      const { error } = await supabase.from("workspaces").update({
        status,
        is_archived: status === "archived",
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients", "workspaces"] });
      qc.invalidateQueries({ queryKey: ["waveos", "workspaces"] });
      toast.success("Workspace updated.");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to update workspace."),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
            Dream Wave Media
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Clients
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Create a client workspace, invite the client, and manage their engagement.
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          New client
        </button>
      </header>

      <div className="surface-card overflow-hidden">
        {workspacesQ.isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading workspaces…
          </div>
        ) : (workspacesQ.data ?? []).length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Users2}
              title="No client workspaces yet"
              body="Click New client to create your first workspace and send an invite."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Workspace</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Tier</th>
                  <th className="px-4 py-3 text-left font-medium">Members</th>
                  <th className="px-4 py-3 text-left font-medium">Media</th>
                  <th className="px-4 py-3 text-left font-medium">Pending</th>
                  <th className="px-4 py-3 text-left font-medium">Last activity</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {(workspacesQ.data ?? []).map((w) => (
                  <tr key={w.id} className="border-t border-border/60 hover:bg-elevated/40">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground">{w.name}</div>
                      <div className="text-xs text-muted-foreground">/{w.slug} · {w.industry ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={w.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{w.service_tier ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground">{w.member_count}</td>
                    <td className="px-4 py-3 text-foreground">{w.media_count}</td>
                    <td className="px-4 py-3">
                      {w.invite_count > 0 ? (
                        <span className="rounded-md bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning ring-1 ring-warning/30">
                          {w.invite_count}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {w.last_activity_at
                        ? new Date(w.last_activity_at).toLocaleDateString()
                        : new Date(w.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedWs(w)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-elevated hover:text-foreground"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && (
        <OnboardingModal
          onClose={() => setOpen(false)}
          onCreated={(payload) => {
            setOpen(false);
            setNewInviteLink(payload);
          }}
        />
      )}

      {newInviteLink && (
        <InviteLinkModal {...newInviteLink} onClose={() => setNewInviteLink(null)} />
      )}

      {selectedWs && (
        <WorkspaceDrawer
          workspace={selectedWs}
          onClose={() => setSelectedWs(null)}
          onStatus={(status) => setStatus.mutate({ id: selectedWs.id, status })}
          onNewInvite={(link) => {
            setNewInviteLink(link);
            setSelectedWs(null);
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: WorkspaceStatus }) {
  const tones: Record<WorkspaceStatus, string> = {
    onboarding: "bg-primary/12 text-primary ring-primary/30",
    active: "bg-success/15 text-success ring-success/30",
    paused: "bg-warning/15 text-warning ring-warning/30",
    archived: "bg-muted/20 text-muted-foreground ring-border",
  };
  return (
    <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium capitalize ring-1", tones[status])}>
      {status}
    </span>
  );
}

function WorkspaceDrawer({
  workspace, onClose, onStatus, onNewInvite,
}: {
  workspace: ClientWorkspace;
  onClose: () => void;
  onStatus: (s: WorkspaceStatus) => void;
  onNewInvite: (p: { link: string; email: string; workspace: string }) => void;
}) {
  const qc = useQueryClient();
  const invitesQ = useQuery({
    queryKey: ["clients", "invites", workspace.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invites_admin")
        .select("id,email,workspace_role,app_role,status,expires_at,created_at,resend_count")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("revoke_invite", { _invite_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients", "invites", workspace.id] });
      qc.invalidateQueries({ queryKey: ["clients", "workspaces"] });
      toast.success("Invite revoked.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  const resend = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("resend_invite", { _invite_id: id, _extend_days: 14 });
      if (error) throw error;
      return (data as { raw_token: string }[] | null)?.[0]?.raw_token ?? "";
    },
    onSuccess: (token, id) => {
      qc.invalidateQueries({ queryKey: ["clients", "invites", workspace.id] });
      const row = invitesQ.data?.find((i) => i.id === id);
      onNewInvite({
        link: `${window.location.origin}/accept-invite?token=${token}`,
        email: row?.email ?? "",
        workspace: workspace.name,
      });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  return (
    <ModalShell title={workspace.name} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={workspace.status} />
          <span className="text-xs text-muted-foreground">Timezone: {workspace.timezone}</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {workspace.status !== "active" && workspace.status !== "archived" && (
            <ActionBtn icon={Play} onClick={() => onStatus("active")}>Mark active</ActionBtn>
          )}
          {workspace.status === "active" && (
            <ActionBtn icon={Pause} onClick={() => onStatus("paused")}>Pause</ActionBtn>
          )}
          {workspace.status === "paused" && (
            <ActionBtn icon={Play} onClick={() => onStatus("active")}>Resume</ActionBtn>
          )}
          {workspace.status !== "archived" && (
            <ActionBtn icon={Archive} onClick={() => {
              if (confirm(`Archive ${workspace.name}? Members will lose access.`))
                onStatus("archived");
            }}>Archive</ActionBtn>
          )}
          <Link
            to="/home"
            onClick={() => {
              try { localStorage.setItem("waveos.active-workspace", workspace.id); } catch { /* noop */ }
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-xs text-foreground hover:bg-elevated"
          >
            Open workspace
          </Link>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Invitations
          </h3>
          {invitesQ.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (invitesQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No invitations yet.</p>
          ) : (
            <ul className="space-y-2">
              {invitesQ.data!.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-surface/40 p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-foreground">{inv.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {inv.workspace_role} · {inv.status}
                      {inv.status === "pending" && inv.expires_at &&
                        ` · expires ${new Date(inv.expires_at).toLocaleDateString()}`}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {inv.status === "pending" && (
                      <button
                        onClick={() => inv.id && revoke.mutate(inv.id)}
                        className="rounded-md p-1.5 text-destructive hover:bg-destructive/15"
                        title="Revoke"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    {(inv.status === "pending" || inv.status === "expired" || inv.status === "revoked") && (
                      <button
                        onClick={() => inv.id && resend.mutate(inv.id)}
                        className="rounded-md p-1.5 text-primary hover:bg-primary/15"
                        title="Regenerate & resend"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

function ActionBtn({ icon: Icon, onClick, children }: {
  icon: typeof Play; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-elevated"
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function OnboardingModal({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: (payload: { link: string; email: string; workspace: string }) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [industry, setIndustry] = useState("");
  const [tier, setTier] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "approver" | "viewer">("owner");

  const create = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Not signed in");

      const finalSlug =
        (slug.trim() || name.trim())
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || `client-${Date.now()}`;

      const { data: ws, error: wsErr } = await supabase
        .from("workspaces")
        .insert({
          name: name.trim(), slug: finalSlug,
          industry: industry.trim() || null,
          service_tier: tier.trim() || null,
          timezone, created_by: uid,
          status: "onboarding",
        })
        .select().single();
      if (wsErr) throw wsErr;

      const appRole =
        role === "owner" ? "client_owner"
          : role === "approver" ? "client_approver"
          : "client_viewer";

      const { data: inviteData, error: invErr } = await supabase.rpc("create_invite", {
        _email: email.trim().toLowerCase(),
        _workspace_id: ws.id,
        _workspace_role: role,
        _app_role: appRole,
        _expires_days: 14,
      });
      if (invErr) throw invErr;
      const token = (inviteData as { raw_token: string }[] | null)?.[0]?.raw_token;
      if (!token) throw new Error("No token returned");

      const link = `${window.location.origin}/accept-invite?token=${token}`;
      return { link, email: email.trim(), workspace: ws.name };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["clients", "workspaces"] });
      qc.invalidateQueries({ queryKey: ["waveos", "workspaces"] });
      onCreated(data);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Failed to create workspace.");
    },
  });

  const canSubmit = name.trim().length > 1 && /@/.test(email);

  return (
    <ModalShell title="Onboard a new client" onClose={onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); if (canSubmit) create.mutate(); }}
        className="space-y-4"
      >
        <p className="text-xs text-muted-foreground">
          Creates the workspace and generates a private, single-use invite link that
          expires in 14 days. Only the invited email can accept it.
        </p>

        <Field label="Client / brand name">
          <input required autoFocus value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Acme Coffee Co." className={inputCls} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="URL slug (optional)">
            <input value={slug} onChange={(e) => setSlug(e.target.value)}
              placeholder="acme-coffee" className={inputCls} />
          </Field>
          <Field label="Industry">
            <input value={industry} onChange={(e) => setIndustry(e.target.value)}
              placeholder="Coffee shop" className={inputCls} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Service tier">
            <input value={tier} onChange={(e) => setTier(e.target.value)}
              placeholder="Growth · Premium · Elite" className={inputCls} />
          </Field>
          <Field label="Timezone">
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputCls}>
              {["America/New_York","America/Chicago","America/Denver","America/Los_Angeles",
                "Europe/London","Europe/Paris","Asia/Dubai","Asia/Tokyo","Australia/Sydney"].map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="my-2 h-px bg-border" />

        <Field label="Client contact email">
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@acmecoffee.com" className={inputCls} />
        </Field>

        <Field label="Role in this workspace">
          <div className="grid grid-cols-3 gap-2">
            {(["owner", "approver", "viewer"] as const).map((r) => (
              <button key={r} type="button" onClick={() => setRole(r)}
                className={cn("rounded-lg border px-3 py-2 text-xs font-medium capitalize transition-all",
                  role === r
                    ? "border-primary/50 bg-primary/15 text-foreground ring-1 ring-primary/40"
                    : "border-border bg-surface/60 text-muted-foreground hover:text-foreground")}>
                {r}
              </button>
            ))}
          </div>
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-border bg-surface/60 px-3 py-2 text-sm text-foreground hover:bg-elevated">
            Cancel
          </button>
          <button type="submit" disabled={!canSubmit || create.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-60">
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create workspace & invite
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function InviteLinkModal({
  link, email, workspace, onClose,
}: { link: string; email: string; workspace: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <ModalShell title="Invite ready" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">
          <Check className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <div className="font-medium text-foreground">{workspace} is ready.</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Send this private link to <span className="text-foreground">{email}</span>.
              It's single-use, expires in 14 days, and can only be redeemed by that email.
              We won't show this link again.
            </p>
          </div>
        </div>
        <div className="flex items-stretch gap-2">
          <input readOnly value={link} onFocus={(e) => e.currentTarget.select()}
            className={cn(inputCls, "font-mono text-xs")} />
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              toast.success("Copied to clipboard.");
              setTimeout(() => setCopied(false), 2000);
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:brightness-110"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="flex justify-end">
          <button onClick={onClose}
            className="rounded-lg border border-border bg-surface/60 px-3 py-2 text-sm text-foreground hover:bg-elevated">
            Done
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

const inputCls =
  "w-full rounded-lg border border-input bg-surface/60 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function ModalShell({ children, onClose, title }: {
  children: React.ReactNode; onClose: () => void; title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8" role="dialog">
      <div className="absolute inset-0 bg-background/70 backdrop-blur" onClick={onClose} />
      <div className="surface-card relative w-full max-w-lg overflow-hidden p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-elevated hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
