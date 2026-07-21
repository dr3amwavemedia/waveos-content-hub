import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import {
  Archive,
  Check,
  Copy,
  Eye,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Users2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/app/empty-state";
import { useImpersonateClient } from "@/hooks/use-impersonation";
import { cn } from "@/lib/utils";
import { isValidHttpsUrl, URL_VALIDATION_MESSAGE } from "@/lib/url-validation";
import type { Database } from "@/integrations/supabase/types";

type ClientAccessTier = Database["public"]["Enums"]["client_access_tier"];
type AccountStatus = Database["public"]["Enums"]["account_status"];
type AgreementTerm = Database["public"]["Enums"]["agreement_term"];
type DeliveryKind = Database["public"]["Enums"]["delivery_kind"];
type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];
type WorkspaceStatusLegacy = "onboarding" | "active" | "paused" | "archived";

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

interface ClientWorkspace {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  timezone: string;
  is_demo: boolean;
  status: WorkspaceStatusLegacy;
  access_tier: ClientAccessTier;
  account_status: AccountStatus;
  agreement_term: AgreementTerm | null;
  access_starts_at: string | null;
  access_expires_at: string | null;
  
  feature_overrides: Record<string, boolean>;
  last_activity_at: string | null;
  created_at: string;
  member_count: number;
  invite_count: number;
  media_count: number;
}

const TIER_LABEL: Record<ClientAccessTier, string> = {
  project_client: "Project Client",
  growth_90: "Growth (90 days)",
  retainer_full: "Retainer",
};
const STATUS_TONE: Record<AccountStatus, string> = {
  active: "bg-success/15 text-success ring-success/30",
  pending: "bg-primary/15 text-primary ring-primary/30",
  suspended: "bg-warning/15 text-warning ring-warning/30",
  expired: "bg-warning/15 text-warning ring-warning/30",
  archived: "bg-muted/20 text-muted-foreground ring-border",
};

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
        .select(
          "id,name,slug,industry,timezone,is_demo,status,access_tier,account_status,agreement_term,access_starts_at,access_expires_at,feature_overrides,last_activity_at,created_at",
        )
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
        feature_overrides: (w.feature_overrides ?? {}) as Record<string, boolean>,
        member_count: mCount.get(w.id) ?? 0,
        invite_count: iCount.get(w.id) ?? 0,
        media_count: mediaCount.get(w.id) ?? 0,
      }));
    },
  });

  const setLegacyStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: WorkspaceStatusLegacy }) => {
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
            Provision a workspace, choose the tier, and send a single-use invite.
            Access is granted only after the client accepts.
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
                  <th className="px-4 py-3 text-left font-medium">Tier</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Term ends</th>
                  <th className="px-4 py-3 text-left font-medium">Members</th>
                  <th className="px-4 py-3 text-left font-medium">Pending</th>
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
                    <td className="px-4 py-3">
                      <TierBadge tier={w.access_tier} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium capitalize ring-1", STATUS_TONE[w.account_status])}>
                        {w.account_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {w.access_expires_at
                        ? new Date(w.access_expires_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-foreground">{w.member_count}</td>
                    <td className="px-4 py-3">
                      {w.invite_count > 0 ? (
                        <span className="rounded-md bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning ring-1 ring-warning/30">
                          {w.invite_count}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
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
          onLegacyStatus={(status) => setLegacyStatus.mutate({ id: selectedWs.id, status })}
          onNewInvite={(link) => {
            setNewInviteLink(link);
            setSelectedWs(null);
          }}
          onRefresh={() => qc.invalidateQueries({ queryKey: ["clients", "workspaces"] })}
        />
      )}
    </div>
  );
}

function TierBadge({ tier }: { tier: ClientAccessTier }) {
  const tone: Record<ClientAccessTier, string> = {
    project_client: "bg-elevated text-foreground ring-border",
    growth_90: "bg-primary/12 text-primary ring-primary/30",
    retainer_full: "bg-success/15 text-success ring-success/30",
  };
  return (
    <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium ring-1", tone[tier])}>
      {TIER_LABEL[tier]}
    </span>
  );
}

// ─── Drawer with tabs ─────────────────────────────────────────────────────

type DrawerTab = "access" | "deliveries" | "invoices" | "invites";

function WorkspaceDrawer({
  workspace, onClose, onLegacyStatus, onNewInvite, onRefresh,
}: {
  workspace: ClientWorkspace;
  onClose: () => void;
  onLegacyStatus: (s: WorkspaceStatusLegacy) => void;
  onNewInvite: (p: { link: string; email: string; workspace: string }) => void;
  onRefresh: () => void;
}) {
  const [tab, setTab] = useState<DrawerTab>("access");
  const impersonate = useImpersonateClient();

  return (
    <ModalShell title={workspace.name} onClose={onClose} wide>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TierBadge tier={workspace.access_tier} />
        <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium capitalize ring-1", STATUS_TONE[workspace.account_status])}>
          {workspace.account_status}
        </span>
        <span className="text-xs text-muted-foreground">Timezone: {workspace.timezone}</span>
        <div className="ml-auto flex gap-2">
          <Link
            to="/home"
            onClick={() => {
              try {
                localStorage.setItem("waveos.active-workspace", workspace.id);
                impersonate.enable();
              } catch { /* noop */ }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
          >
            <Eye className="h-3.5 w-3.5" /> View as client
          </Link>
          <Link
            to="/home"
            onClick={() => {
              try { localStorage.setItem("waveos.active-workspace", workspace.id); } catch { /* noop */ }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-xs text-foreground hover:bg-elevated"
          >
            Open
          </Link>
        </div>
      </div>

      <div className="mb-4 flex gap-1 border-b border-border">
        {(["access", "deliveries", "invoices", "invites"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "border-b-2 px-3 py-2 text-xs font-medium capitalize -mb-px transition-colors",
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "access" && (
        <AccessTab workspace={workspace} onLegacyStatus={onLegacyStatus} onRefresh={onRefresh} />
      )}
      {tab === "deliveries" && <DeliveriesTab workspaceId={workspace.id} />}
      {tab === "invoices" && <InvoicesTab workspaceId={workspace.id} />}
      {tab === "invites" && (
        <InvitesTab workspace={workspace} onNewInvite={onNewInvite} />
      )}
    </ModalShell>
  );
}

// ─── Access tab ───────────────────────────────────────────────────────────

function AccessTab({
  workspace, onLegacyStatus, onRefresh,
}: {
  workspace: ClientWorkspace;
  onLegacyStatus: (s: WorkspaceStatusLegacy) => void;
  onRefresh: () => void;
}) {
  const qc = useQueryClient();
  const [tier, setTier] = useState<ClientAccessTier>(workspace.access_tier);
  const [status, setStatus] = useState<AccountStatus>(workspace.account_status);
  const [term, setTerm] = useState<AgreementTerm | "">(workspace.agreement_term ?? "");
  const [startsAt, setStartsAt] = useState(
    workspace.access_starts_at ? workspace.access_starts_at.slice(0, 10) : "",
  );
  const [expiresAt, setExpiresAt] = useState(
    workspace.access_expires_at ? workspace.access_expires_at.slice(0, 10) : "",
  );
  const notesQ = useQuery({
    queryKey: ["workspace-internal-notes", workspace.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_internal_notes")
        .select("notes")
        .eq("workspace_id", workspace.id)
        .maybeSingle();
      if (error) throw error;
      return data?.notes ?? "";
    },
  });
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (notesQ.data !== undefined) setNotes(notesQ.data);
  }, [notesQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("workspaces")
        .update({
          access_tier: tier,
          account_status: status,
          agreement_term: term || null,
          access_starts_at: startsAt ? new Date(startsAt).toISOString() : null,
          access_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        })
        .eq("id", workspace.id);
      if (error) throw error;
      const { data: auth } = await supabase.auth.getUser();
      const { error: nerr } = await supabase
        .from("workspace_internal_notes")
        .upsert({
          workspace_id: workspace.id,
          notes: notes.trim(),
          updated_by: auth.user?.id ?? null,
        });
      if (nerr) throw nerr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients", "workspaces"] });
      qc.invalidateQueries({ queryKey: ["workspace-access", workspace.id] });
      toast.success("Access updated.");
      onRefresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Access tier">
          <select value={tier} onChange={(e) => setTier(e.target.value as ClientAccessTier)} className={inputCls}>
            <option value="project_client">Project Client — profile + invoices only</option>
            <option value="growth_90">Growth (90 days) — review + brand voice</option>
            <option value="retainer_full">Retainer — full platform</option>
          </select>
        </Field>
        <Field label="Account status">
          <select value={status} onChange={(e) => setStatus(e.target.value as AccountStatus)} className={inputCls}>
            <option value="pending">Pending — awaiting activation</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended — read-only</option>
            <option value="expired">Expired — falls back to project tier</option>
            <option value="archived">Archived</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Agreement term">
          <select value={term} onChange={(e) => setTerm(e.target.value as AgreementTerm | "")} className={inputCls}>
            <option value="">—</option>
            <option value="one_time">One-time</option>
            <option value="90_day">90 days</option>
            <option value="6_month">6 months</option>
            <option value="12_month">12 months</option>
          </select>
        </Field>
        <Field label="Starts">
          <input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Expires">
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputCls} />
        </Field>
      </div>

      <Field label="Internal notes (staff only)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className={cn(inputCls, "font-normal")}
          placeholder="Context, upgrade path, renewal notes…"
        />
      </Field>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-60"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save access
        </button>
        {workspace.status !== "archived" && (
          <button
            onClick={() => {
              if (confirm(`Archive ${workspace.name}? Members lose access.`))
                onLegacyStatus("archived");
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/20"
          >
            <Archive className="h-3.5 w-3.5" /> Archive
          </button>
        )}
        {workspace.status === "archived" && (
          <button
            onClick={() => onLegacyStatus("active")}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs text-foreground hover:bg-elevated"
          >
            <Play className="h-3.5 w-3.5" /> Restore
          </button>
        )}
        {workspace.status === "active" && (
          <button
            onClick={() => onLegacyStatus("paused")}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs text-foreground hover:bg-elevated"
          >
            <Pause className="h-3.5 w-3.5" /> Pause workspace
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Deliveries tab ───────────────────────────────────────────────────────

function DeliveriesTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const q = useQuery({
    queryKey: ["client-deliveries", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_deliveries")
        .select("id,title,description,kind,url,delivered_at,is_pinned")
        .eq("workspace_id", workspaceId)
        .order("delivered_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_deliveries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-deliveries", workspaceId] });
      toast.success("Delivery removed.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm((s) => !s)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:brightness-110"
        >
          <Plus className="h-3.5 w-3.5" /> Add delivery
        </button>
      </div>
      {showForm && (
        <DeliveryForm workspaceId={workspaceId} onDone={() => setShowForm(false)} />
      )}
      {q.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (q.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No deliveries yet.</p>
      ) : (
        <ul className="space-y-2">
          {q.data!.map((d) => (
            <li key={d.id} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-surface/40 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{d.title}</span>
                  <span className="rounded-md bg-elevated px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {d.kind}
                  </span>
                </div>
                {d.description && (
                  <p className="mt-1 text-xs text-muted-foreground">{d.description}</p>
                )}
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{new Date(d.delivered_at).toLocaleDateString()}</span>
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" /> Open link
                  </a>
                </div>
              </div>
              <button
                onClick={() => confirm("Remove this delivery?") && del.mutate(d.id)}
                className="rounded-md p-1.5 text-destructive hover:bg-destructive/15"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeliveryForm({ workspaceId, onDone }: { workspaceId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<DeliveryKind>("link");

  const create = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("client_deliveries").insert({
        workspace_id: workspaceId,
        title: title.trim(),
        url: url.trim(),
        description: description.trim() || null,
        kind,
        created_by: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-deliveries", workspaceId] });
      toast.success("Delivery added.");
      onDone();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  const urlValid = isValidHttpsUrl(url);
  const canSubmit = title.trim().length > 0 && urlValid;

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (canSubmit) create.mutate(); }}
      className="space-y-3 rounded-lg border border-dashed border-border bg-surface/40 p-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <input required value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="July Photo Shoot" />
        </Field>
        <Field label="Kind">
          <select value={kind} onChange={(e) => setKind(e.target.value as DeliveryKind)} className={inputCls}>
            {(["photos","videos","reels","graphics","documents","link","other"] as DeliveryKind[]).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="URL">
        <input required type="url" value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls} placeholder="https://drive.google.com/…" />
      </Field>
      <Field label="Description (optional)">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls} />
      </Field>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-xs text-foreground hover:bg-elevated">
          Cancel
        </button>
        <button type="submit" disabled={!canSubmit || create.isPending} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60">
          {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save
        </button>
      </div>
    </form>
  );
}

// ─── Invoices tab ─────────────────────────────────────────────────────────

function InvoicesTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const q = useQuery({
    queryKey: ["client-invoices", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_invoices")
        .select("id,number,description,amount_cents,currency,status,hosted_url,issued_at,due_at,paid_at")
        .eq("workspace_id", workspaceId)
        .order("issued_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-invoices", workspaceId] });
      toast.success("Invoice removed.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm((s) => !s)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:brightness-110"
        >
          <Plus className="h-3.5 w-3.5" /> Add invoice
        </button>
      </div>
      {showForm && <InvoiceForm workspaceId={workspaceId} onDone={() => setShowForm(false)} />}
      {q.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (q.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No invoices yet.</p>
      ) : (
        <ul className="space-y-2">
          {q.data!.map((i) => (
            <li key={i.id} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-surface/40 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {i.number || "Invoice"}
                  </span>
                  <InvoiceStatusBadge status={i.status} />
                </div>
                {i.description && (
                  <p className="mt-1 text-xs text-muted-foreground">{i.description}</p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                  {i.amount_cents !== null && (
                    <span className="font-medium text-foreground">
                      {(i.amount_cents / 100).toLocaleString("en-US", { style: "currency", currency: i.currency })}
                    </span>
                  )}
                  <span>Issued {new Date(i.issued_at).toLocaleDateString()}</span>
                  {i.due_at && <span>Due {new Date(i.due_at).toLocaleDateString()}</span>}
                  {i.hosted_url && (
                    <a href={i.hosted_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" /> Open
                    </a>
                  )}
                </div>
              </div>
              <button
                onClick={() => confirm("Remove this invoice?") && del.mutate(i.id)}
                className="rounded-md p-1.5 text-destructive hover:bg-destructive/15"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const tone: Record<InvoiceStatus, string> = {
    draft: "bg-elevated text-muted-foreground ring-border",
    sent: "bg-primary/12 text-primary ring-primary/30",
    paid: "bg-success/15 text-success ring-success/30",
    overdue: "bg-warning/15 text-warning ring-warning/30",
    void: "bg-muted/20 text-muted-foreground ring-border",
  };
  return (
    <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1", tone[status])}>
      {status}
    </span>
  );
}

function InvoiceForm({ workspaceId, onDone }: { workspaceId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [number, setNumber] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [status, setStatus] = useState<InvoiceStatus>("sent");
  const [hostedUrl, setHostedUrl] = useState("");
  const [dueAt, setDueAt] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const cents = amount ? Math.round(parseFloat(amount) * 100) : null;
      const { error } = await supabase.from("client_invoices").insert({
        workspace_id: workspaceId,
        number: number.trim() || null,
        description: description.trim() || null,
        amount_cents: cents,
        currency: currency.trim().toUpperCase().slice(0, 3),
        status,
        hosted_url: hostedUrl.trim() || null,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        paid_at: status === "paid" ? new Date().toISOString() : null,
        created_by: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-invoices", workspaceId] });
      toast.success("Invoice added.");
      onDone();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
      className="space-y-3 rounded-lg border border-dashed border-border bg-surface/40 p-3"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Number"><input value={number} onChange={(e) => setNumber(e.target.value)} className={inputCls} placeholder="INV-2026-014" /></Field>
        <Field label="Amount"><input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} placeholder="1250.00" /></Field>
        <Field label="Currency"><input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} className={inputCls} /></Field>
      </div>
      <Field label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as InvoiceStatus)} className={inputCls}>
            {(["draft","sent","paid","overdue","void"] as InvoiceStatus[]).map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Due"><input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={inputCls} /></Field>
        <Field label="Hosted URL"><input type="url" value={hostedUrl} onChange={(e) => setHostedUrl(e.target.value)} className={inputCls} placeholder="https://…" /></Field>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-xs text-foreground hover:bg-elevated">Cancel</button>
        <button type="submit" disabled={create.isPending} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60">
          {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save
        </button>
      </div>
    </form>
  );
}

// ─── Invites tab ──────────────────────────────────────────────────────────

function InvitesTab({
  workspace, onNewInvite,
}: {
  workspace: ClientWorkspace;
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
    <div className="space-y-3">
      <InviteQuickForm workspace={workspace} onNewInvite={onNewInvite} />
      {invitesQ.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (invitesQ.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No invitations yet.</p>
      ) : (
        <ul className="space-y-2">
          {invitesQ.data!.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-surface/40 p-3">
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
                  <button onClick={() => inv.id && revoke.mutate(inv.id)}
                    className="rounded-md p-1.5 text-destructive hover:bg-destructive/15" title="Revoke">
                    <X className="h-4 w-4" />
                  </button>
                )}
                {(inv.status === "pending" || inv.status === "expired" || inv.status === "revoked") && (
                  <button onClick={() => inv.id && resend.mutate(inv.id)}
                    className="rounded-md p-1.5 text-primary hover:bg-primary/15" title="Regenerate & resend">
                    <RefreshCw className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InviteQuickForm({
  workspace, onNewInvite,
}: {
  workspace: ClientWorkspace;
  onNewInvite: (p: { link: string; email: string; workspace: string }) => void;
}) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "approver" | "viewer">("owner");
  const create = useMutation({
    mutationFn: async () => {
      const appRole =
        role === "owner" ? "client_owner"
        : role === "approver" ? "client_approver"
        : "client_viewer";
      const { data, error } = await supabase.rpc("create_invite", {
        _email: email.trim().toLowerCase(),
        _workspace_id: workspace.id,
        _workspace_role: role,
        _app_role: appRole,
        _expires_days: 14,
      });
      if (error) throw error;
      const token = (data as { raw_token: string }[] | null)?.[0]?.raw_token;
      if (!token) throw new Error("No token returned");
      return { link: `${window.location.origin}/accept-invite?token=${token}`, email: email.trim(), workspace: workspace.name };
    },
    onSuccess: (payload) => {
      qc.invalidateQueries({ queryKey: ["clients", "invites", workspace.id] });
      setEmail("");
      onNewInvite(payload);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed."),
  });
  const canSubmit = /@/.test(email);
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (canSubmit) create.mutate(); }}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border bg-surface/40 p-3"
    >
      <div className="flex-1 min-w-[200px]">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Invite email</label>
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="owner@client.com" />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Role</label>
        <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className={inputCls}>
          <option value="owner">Owner</option>
          <option value="approver">Approver</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>
      <button type="submit" disabled={!canSubmit || create.isPending} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60">
        {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Send invite
      </button>
    </form>
  );
}

// ─── Onboarding modal (new client) ────────────────────────────────────────

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
  const [tier, setTier] = useState<ClientAccessTier>("retainer_full");
  const [term, setTerm] = useState<AgreementTerm | "">("");
  const [expiresAt, setExpiresAt] = useState("");
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
          name: name.trim(),
          slug: finalSlug,
          industry: industry.trim() || null,
          timezone,
          created_by: uid,
          status: "onboarding",
          access_tier: tier,
          account_status: "pending",
          agreement_term: term || null,
          access_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          invited_at: new Date().toISOString(),
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
          Creates a Pending workspace at the chosen tier and generates a private,
          single-use invite link (14-day expiry). Access activates when the client
          signs in and accepts.
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
          <Field label="Access tier">
            <select value={tier} onChange={(e) => setTier(e.target.value as ClientAccessTier)} className={inputCls}>
              <option value="project_client">Project Client</option>
              <option value="growth_90">Growth (90 days)</option>
              <option value="retainer_full">Retainer</option>
            </select>
          </Field>
          <Field label="Agreement term">
            <select value={term} onChange={(e) => setTerm(e.target.value as AgreementTerm | "")} className={inputCls}>
              <option value="">—</option>
              <option value="one_time">One-time</option>
              <option value="90_day">90 days</option>
              <option value="6_month">6 months</option>
              <option value="12_month">12 months</option>
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Access expires (optional)">
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputCls} />
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function ModalShell({
  children, onClose, title, wide,
}: { children: ReactNode; onClose: () => void; title: string; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8" role="dialog">
      <div className="absolute inset-0 bg-background/70 backdrop-blur" onClick={onClose} />
      <div className={cn(
        "surface-card relative w-full overflow-hidden p-6 max-h-[90vh] overflow-y-auto",
        wide ? "max-w-2xl" : "max-w-lg",
      )}>
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
