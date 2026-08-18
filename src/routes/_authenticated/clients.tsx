import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import {
  Archive,
  BellRing,
  Check,
  Copy,
  Eye,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Pause,
  Pencil,
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
import { syncFrameioWorkspaceShare } from "@/hooks/use-frameio";
import { ClientBrandingEditor } from "@/components/branding/client-branding-editor";
import { sendInviteEmail, sendWorkspaceEmail, tryEmail } from "@/lib/transactional-email";

type ClientAccessTier = Database["public"]["Enums"]["client_access_tier"];
type AccountStatus = Database["public"]["Enums"]["account_status"];
type AgreementTerm = Database["public"]["Enums"]["agreement_term"];
type DeliveryKind = Database["public"]["Enums"]["delivery_kind"];
type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];
type ContractStatus = "draft" | "sent" | "viewed" | "signed" | "declined" | "expired" | "void";
type ContractRow = {
  id: string;
  title: string;
  description: string | null;
  provider: "bloom" | "other";
  hosted_url: string;
  status: ContractStatus;
  sent_at: string | null;
  signed_at: string | null;
  expires_at: string | null;
};
type InvoiceListItem = Pick<
  Database["public"]["Tables"]["client_invoices"]["Row"],
  | "id"
  | "number"
  | "description"
  | "amount_cents"
  | "currency"
  | "status"
  | "hosted_url"
  | "issued_at"
  | "due_at"
  | "paid_at"
>;
type CrmAccountRow = Database["public"]["Tables"]["crm_accounts"]["Row"];
type CrmContactRow = Pick<
  Database["public"]["Tables"]["crm_contacts"]["Row"],
  | "id"
  | "first_name"
  | "last_name"
  | "job_title"
  | "email"
  | "phone"
  | "preferred_contact_method"
  | "is_primary"
>;
type ClientCrmRecord = CrmAccountRow & { crm_contacts: CrmContactRow[] };
type WorkspaceStatusLegacy = "onboarding" | "active" | "paused" | "archived";
const SOCIAL_MANAGEMENT_FLAG = "social_management_access";

function effectiveTier(
  storedTier: ClientAccessTier,
  overrides: Record<string, boolean> | null | undefined,
): ClientAccessTier {
  return overrides?.[SOCIAL_MANAGEMENT_FLAG] === true ? "social_management" : storedTier;
}

function tierStorage(tier: ClientAccessTier, current: Record<string, boolean> = {}) {
  return {
    access_tier: tier === "social_management" ? ("retainer_full" as const) : tier,
    feature_overrides: {
      ...current,
      [SOCIAL_MANAGEMENT_FLAG]: tier === "social_management",
    },
  };
}

export const Route = createFileRoute("/_authenticated/clients")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const isOwner = (roles ?? []).some((r) => r.role === "dream_wave_owner");
    if (!isOwner) throw redirect({ to: "/home" });
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
  wedding_display_name: string | null;
  wedding_theme: string;
  member_count: number;
  invite_count: number;
  media_count: number;
}

const TIER_LABEL: Record<ClientAccessTier, string> = {
  project_client: "Project Client",
  growth_90: "Growth (90 days)",
  retainer_full: "Retainer",
  social_management: "Social Management",
  wedding_client: "Wedding Client",
};
const STATUS_TONE: Record<AccountStatus, string> = {
  active: "bg-success/15 text-success ring-success/30",
  pending: "bg-primary/15 text-primary ring-primary/30",
  suspended: "bg-warning/15 text-warning ring-warning/30",
  expired: "bg-warning/15 text-warning ring-warning/30",
  archived: "bg-muted/20 text-muted-foreground ring-border",
};

// The delete RPC is added by this package's migration, before generated types refresh.
const db = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: Error | null }>;
};

function ClientsPage() {
  const [open, setOpen] = useState(false);
  const [newInviteLink, setNewInviteLink] = useState<{
    link: string;
    email: string;
    workspace: string;
  } | null>(null);
  const [selectedWs, setSelectedWs] = useState<ClientWorkspace | null>(null);

  const qc = useQueryClient();

  const ownerQ = useQuery({
    queryKey: ["clients", "current-owner"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return false;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", auth.user.id)
        .eq("role", "dream_wave_owner")
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
  });

  const [weddingColumnsMissing, setWeddingColumnsMissing] = useState(false);

  const workspacesQ = useQuery({
    queryKey: ["clients", "workspaces"],
    queryFn: async () => {
      const BASE_COLS =
        "id,name,slug,industry,timezone,is_demo,status,access_tier,account_status,agreement_term,access_starts_at,access_expires_at,feature_overrides,last_activity_at,created_at";
      // Wedding columns are optional: if the Layer 5 migration has not reached
      // this environment yet, the client list must still load.
      let missing = false;
      let ws: Record<string, unknown>[] | null = null;
      const first = await supabase
        .from("workspaces")
        .select(`${BASE_COLS},wedding_display_name,wedding_theme`)
        .order("created_at", { ascending: false });
      if (first.error) {
        const fallback = await supabase
          .from("workspaces")
          .select(BASE_COLS)
          .order("created_at", { ascending: false });
        if (fallback.error) throw fallback.error;
        missing = true;
        ws = (fallback.data ?? []) as unknown as Record<string, unknown>[];
      } else {
        ws = (first.data ?? []) as unknown as Record<string, unknown>[];
      }
      setWeddingColumnsMissing(missing);

      const [{ data: members }, { data: invites }, { data: media }] = await Promise.all([
        supabase.from("workspace_members").select("workspace_id"),
        supabase.from("invites_admin").select("workspace_id").eq("status", "pending"),
        supabase.from("media_assets").select("workspace_id").is("archived_at", null),
      ]);
      const bump = (m: Map<string, number>, k: string | null) => {
        if (!k) return;
        m.set(k, (m.get(k) ?? 0) + 1);
      };
      const mCount = new Map<string, number>();
      (members ?? []).forEach((m) => bump(mCount, m.workspace_id));
      const iCount = new Map<string, number>();
      (invites ?? []).forEach((i) => bump(iCount, i.workspace_id));
      const mediaCount = new Map<string, number>();
      (media ?? []).forEach((m) => bump(mediaCount, m.workspace_id));
      return (ws ?? []).map<ClientWorkspace>((w) => {
        const featureOverrides = (w.feature_overrides ?? {}) as Record<string, boolean>;
        return {
          ...w,
          access_tier: effectiveTier(w.access_tier, featureOverrides),
          feature_overrides: featureOverrides,
          member_count: mCount.get(w.id) ?? 0,
          invite_count: iCount.get(w.id) ?? 0,
          media_count: mediaCount.get(w.id) ?? 0,
        };
      });
    },
  });

  const setLegacyStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: WorkspaceStatusLegacy }) => {
      const { error } = await supabase
        .from("workspaces")
        .update({
          status,
          is_archived: status === "archived",
        })
        .eq("id", id);
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
            Provision a workspace, choose the tier, and send a single-use invite. Access is granted
            only after the client accepts.
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
          <>
            <div className="divide-y divide-border/60 md:hidden">
              {(workspacesQ.data ?? []).map((w) => (
                <article key={w.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-foreground">{w.name}</h3>
                      <p className="truncate text-xs text-muted-foreground">
                        /{w.slug} · {w.industry ?? "Industry not set"}
                      </p>
                      <button
                        onClick={() => setSelectedWs(w)}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit info
                      </button>
                    </div>
                    <button
                      onClick={() => setSelectedWs(w)}
                      className="min-h-10 min-w-10 rounded-lg border border-border p-2.5 text-muted-foreground"
                      aria-label={`Manage ${w.name}`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <TierBadge tier={w.access_tier} />
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 text-xs font-medium capitalize ring-1",
                        STATUS_TONE[w.account_status],
                      )}
                    >
                      {w.account_status}
                    </span>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Members</dt>
                      <dd className="mt-1 font-medium">{w.member_count}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Invites</dt>
                      <dd className="mt-1 font-medium">{w.invite_count}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Ends</dt>
                      <dd className="mt-1 truncate font-medium">
                        {w.access_expires_at
                          ? new Date(w.access_expires_at).toLocaleDateString()
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
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
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-semibold text-foreground">{w.name}</div>
                          <button
                            onClick={() => setSelectedWs(w)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            <Pencil className="h-3 w-3" /> Edit info
                          </button>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          /{w.slug} · {w.industry ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <TierBadge tier={w.access_tier} />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-xs font-medium capitalize ring-1",
                            STATUS_TONE[w.account_status],
                          )}
                        >
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
                          aria-label={`Open ${w.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
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
          isOwner={ownerQ.data ?? false}
          onDeleted={() => {
            setSelectedWs(null);
            qc.invalidateQueries({ queryKey: ["clients", "workspaces"] });
            qc.invalidateQueries({ queryKey: ["waveos", "workspaces"] });
          }}
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
    social_management: "bg-primary/15 text-primary ring-primary/30",
    wedding_client: "bg-[#667843]/15 text-[#9daf70] ring-[#667843]/30",
  };
  return (
    <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium ring-1", tone[tier])}>
      {TIER_LABEL[tier]}
    </span>
  );
}

// ─── Drawer with tabs ─────────────────────────────────────────────────────

type DrawerTab = "info" | "branding" | "access" | "media" | "deliveries" | "contracts" | "invoices" | "invites";

function WorkspaceDrawer({
  workspace,
  onClose,
  onLegacyStatus,
  onNewInvite,
  onRefresh,
  onDeleted,
  isOwner,
}: {
  workspace: ClientWorkspace;
  onClose: () => void;
  onLegacyStatus: (s: WorkspaceStatusLegacy) => void;
  onNewInvite: (p: { link: string; email: string; workspace: string }) => void;
  onRefresh: () => void;
  onDeleted: () => void;
  isOwner: boolean;
}) {
  const [tab, setTab] = useState<DrawerTab>("info");
  const impersonate = useImpersonateClient();

  function exportSummary() {
    const rows = [
      ["Client", workspace.name],
      ["Workspace", workspace.slug],
      ["Industry", workspace.industry ?? ""],
      ["Tier", TIER_LABEL[workspace.access_tier]],
      ["Account status", workspace.account_status],
      ["Agreement", workspace.agreement_term ?? ""],
      ["Access starts", workspace.access_starts_at ?? ""],
      ["Access expires", workspace.access_expires_at ?? ""],
      ["Members", String(workspace.member_count)],
      ["Pending invites", String(workspace.invite_count)],
      ["Media items", String(workspace.media_count)],
      ["Last activity", workspace.last_activity_at ?? ""],
    ];
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = href;
    link.download = `${workspace.slug}-account-summary.csv`;
    link.click();
    URL.revokeObjectURL(href);
  }

  return (
    <ModalShell title={workspace.name} onClose={onClose} wide>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTab("info")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit info
        </button>
        <TierBadge tier={workspace.access_tier} />
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-xs font-medium capitalize ring-1",
            STATUS_TONE[workspace.account_status],
          )}
        >
          {workspace.account_status}
        </span>
        <span className="text-xs text-muted-foreground">Timezone: {workspace.timezone}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportSummary}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-xs text-foreground hover:bg-elevated"
          >
            Export summary
          </button>
          <Link
            to="/home"
            onClick={() => {
              try {
                localStorage.setItem("waveos.active-workspace", workspace.id);
                impersonate.enable(workspace.access_tier);
              } catch {
                /* noop */
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
          >
            <Eye className="h-3.5 w-3.5" /> View as client
          </Link>
        </div>
      </div>

      <div className="mb-4 flex gap-1 border-b border-border">
        {(["info", "branding", "access", "media", "deliveries", "contracts", "invoices", "invites"] as const).map((t) => (
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
            {t === "info" ? "Client info" : t}
          </button>
        ))}
      </div>

      {tab === "info" && <ClientInfoTab workspace={workspace} onRefresh={onRefresh} />}
      {tab === "branding" && <ClientBrandingEditor workspaceId={workspace.id} workspaceName={workspace.name} />}
      {tab === "access" && (
        <AccessTab
          workspace={workspace}
          onLegacyStatus={onLegacyStatus}
          onRefresh={onRefresh}
          onDeleted={onDeleted}
          isOwner={isOwner}
        />
      )}
      {tab === "media" && <WorkspaceMediaSourcesTab workspaceId={workspace.id} />}
      {tab === "deliveries" && <DeliveriesTab workspaceId={workspace.id} />}
      {tab === "contracts" && <ContractsTab workspaceId={workspace.id} />}
      {tab === "invoices" && <InvoicesTab workspaceId={workspace.id} />}
      {tab === "invites" && <InvitesTab workspace={workspace} onNewInvite={onNewInvite} />}
    </ModalShell>
  );
}

function WorkspaceMediaSourcesTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [shareUrl, setShareUrl] = useState("");
  const [label, setLabel] = useState("Frame.io media");
  const sourceQ = useQuery({
    queryKey: ["workspace-frameio-source", workspaceId],
    queryFn: async () => {
      const { data, error } = await db
        .from("workspace_frameio_sources")
        .select("share_url,label,sync_status,sync_error,updated_at")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw error;
      return data as {
        share_url: string;
        label: string;
        sync_status: "pending" | "ready" | "error";
        sync_error: string | null;
        updated_at: string;
      } | null;
    },
  });

  useEffect(() => {
    setShareUrl(sourceQ.data?.share_url ?? "");
    setLabel(sourceQ.data?.label ?? "Frame.io media");
  }, [sourceQ.data?.share_url, sourceQ.data?.label, workspaceId]);

  const save = useMutation({
    mutationFn: async () => {
      const url = normalizeFrameIoShareUrl(shareUrl);
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await db.from("workspace_frameio_sources").upsert({
        workspace_id: workspaceId,
        share_url: url,
        label: label.trim() || "Frame.io media",
        sync_status: "pending",
        sync_error: null,
        frameio_account_id: null,
        frameio_project_id: null,
        frameio_share_id: null,
        assigned_by: auth.user?.id ?? null,
      });
      if (error) throw error;
      await syncFrameioWorkspaceShare(workspaceId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["workspace-frameio-source", workspaceId] });
      toast.success("Frame.io Share assigned and ready for this client.");
    },
    onError: (error) =>
      toast.error(frameioAssignmentMessage(error)),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from("workspace_frameio_sources")
        .delete()
        .eq("workspace_id", workspaceId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["workspace-frameio-source", workspaceId] });
      toast.success("Frame.io Share removed.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not remove Frame.io Share."),
  });

  if (sourceQ.isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <h3 className="text-sm font-semibold text-foreground">Curated Frame.io media</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Paste the Share link approved for this client. They will not be able to connect a
          Frame.io account or replace this source.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Gallery name">
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={120}
            className={inputCls}
            placeholder="Latest campaign media"
          />
        </Field>
        <Field label="Frame.io Share link">
          <input
            value={shareUrl}
            onChange={(event) => setShareUrl(event.target.value)}
            className={inputCls}
            placeholder="https://f.io/..."
            inputMode="url"
          />
        </Field>
      </div>
      {sourceQ.data && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border bg-elevated px-2.5 py-1 capitalize">
            {sourceQ.data.sync_status === "pending" ? "Awaiting Frame.io sync" : sourceQ.data.sync_status}
          </span>
          {sourceQ.data.sync_error && <span className="text-destructive">{sourceQ.data.sync_error}</span>}
          <a
            href={sourceQ.data.share_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Open Share
          </a>
        </div>
      )}
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending || !shareUrl.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Assign Frame.io Share
        </button>
        {sourceQ.data && (
          <button
            type="button"
            onClick={() => confirm("Remove this client's Frame.io source?") && remove.mutate()}
            disabled={remove.isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> Remove
          </button>
        )}
      </div>
    </div>
  );
}

function frameioAssignmentMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("frameio_not_connected"))
    return "Connect the Dream Wave Frame.io account in Settings first.";
  if (message.includes("frameio_share_downloads_required"))
    return "Turn on Downloads for this Frame.io Share, then try again.";
  if (message.includes("frameio_share_not_found"))
    return "WaveOS could not find that Share. Confirm the link belongs to the connected Frame.io account.";
  if (message.includes("workspace_frameio_sources"))
    return "The Frame.io database update has not deployed yet. Redeploy the latest main branch.";
  return message || "Could not assign Frame.io Share.";
}

function normalizeFrameIoShareUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Paste a valid Frame.io Share link.");
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (url.protocol !== "https:" || !["f.io", "frame.io", "next.frame.io"].includes(host))
    throw new Error("Use an HTTPS link from Frame.io or f.io.");
  url.hash = "";
  return url.toString();
}

// ─── Client information ──────────────────────────────────────────────────

function ClientInfoTab({
  workspace,
  onRefresh,
}: {
  workspace: ClientWorkspace;
  onRefresh: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: workspace.name,
    industry: workspace.industry ?? "",
    timezone: workspace.timezone,
    email: "",
    phone: "",
    website: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "US",
    leadSource: "",
    referralName: "",
    services: "",
    preferredContact: "",
    priority: "normal",
    estimatedValue: "",
    nextFollowUp: "",
    contactFirst: "",
    contactLast: "",
    contactTitle: "",
    contactEmail: "",
    contactPhone: "",
    contactPreference: "",
  });

  const crmQ = useQuery({
    queryKey: ["client-crm-record", workspace.id],
    queryFn: async (): Promise<ClientCrmRecord | null> => {
      const { data, error } = await db
        .from("crm_accounts")
        .select(
          "*,crm_contacts(id,first_name,last_name,job_title,email,phone,preferred_contact_method,is_primary)",
        )
        .eq("linked_workspace_id", workspace.id)
        .maybeSingle();
      if (error) throw error;
      return (data as ClientCrmRecord | null) ?? null;
    },
  });

  useEffect(() => {
    const account = crmQ.data;
    if (!account) return;
    const contact =
      account.crm_contacts?.find((item) => item.is_primary) ?? account.crm_contacts?.[0];
    setForm({
      name: account.business_name,
      industry: account.industry ?? workspace.industry ?? "",
      timezone: workspace.timezone,
      email: account.email ?? "",
      phone: account.phone ?? "",
      website: account.website ?? "",
      address1: account.address_line1 ?? "",
      address2: account.address_line2 ?? "",
      city: account.city ?? "",
      state: account.state ?? "",
      postalCode: account.postal_code ?? "",
      country: account.country ?? "US",
      leadSource: account.lead_source ?? "",
      referralName: account.referral_name ?? "",
      services: account.interested_services?.join(", ") ?? "",
      preferredContact: account.preferred_contact_method ?? "",
      priority: account.priority,
      estimatedValue:
        account.estimated_value_cents == null ? "" : String(account.estimated_value_cents / 100),
      nextFollowUp: account.next_follow_up_at?.slice(0, 16) ?? "",
      contactFirst: contact?.first_name ?? "",
      contactLast: contact?.last_name ?? "",
      contactTitle: contact?.job_title ?? "",
      contactEmail: contact?.email ?? "",
      contactPhone: contact?.phone ?? "",
      contactPreference: contact?.preferred_contact_method ?? "",
    });
  }, [crmQ.data, workspace.industry, workspace.name, workspace.timezone]);

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      if (!name) throw new Error("Client name is required.");

      const { error: nameError } = await db.rpc("admin_update_workspace_name", {
        _workspace_id: workspace.id,
        _name: name,
      });
      if (nameError) throw nameError;

      const { error: workspaceError } = await supabase
        .from("workspaces")
        .update({
          industry: form.industry.trim() || null,
          timezone: form.timezone,
        })
        .eq("id", workspace.id);
      if (workspaceError) throw workspaceError;

      const account = crmQ.data;
      if (!account) return;
      const { data: auth } = await supabase.auth.getUser();
      const { error: crmError } = await db
        .from("crm_accounts")
        .update({
          business_name: name,
          industry: form.industry.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          website: form.website.trim() || null,
          address_line1: form.address1.trim() || null,
          address_line2: form.address2.trim() || null,
          city: form.city.trim() || null,
          state: form.state.trim() || null,
          postal_code: form.postalCode.trim() || null,
          country: form.country.trim() || "US",
          lead_source: form.leadSource.trim() || null,
          referral_name: form.referralName.trim() || null,
          interested_services: form.services
            .split(",")
            .map((service) => service.trim())
            .filter(Boolean),
          preferred_contact_method: form.preferredContact.trim() || null,
          priority: form.priority,
          estimated_value_cents: form.estimatedValue
            ? Math.round(Number(form.estimatedValue) * 100)
            : null,
          next_follow_up_at: form.nextFollowUp ? new Date(form.nextFollowUp).toISOString() : null,
          updated_by: auth.user?.id ?? null,
        })
        .eq("id", account.id);
      if (crmError) throw crmError;

      const primary =
        account.crm_contacts?.find((item) => item.is_primary) ?? account.crm_contacts?.[0];
      if (primary) {
        const { error } = await db
          .from("crm_contacts")
          .update({
            first_name: form.contactFirst.trim() || primary.first_name,
            last_name: form.contactLast.trim() || null,
            job_title: form.contactTitle.trim() || null,
            email: form.contactEmail.trim() || null,
            phone: form.contactPhone.trim() || null,
            preferred_contact_method: form.contactPreference.trim() || null,
          })
          .eq("id", primary.id);
        if (error) throw error;
      } else if (form.contactFirst.trim()) {
        const { error } = await db.from("crm_contacts").insert({
          account_id: account.id,
          first_name: form.contactFirst.trim(),
          last_name: form.contactLast.trim() || null,
          job_title: form.contactTitle.trim() || null,
          email: form.contactEmail.trim() || null,
          phone: form.contactPhone.trim() || null,
          preferred_contact_method: form.contactPreference.trim() || null,
          is_primary: true,
          created_by: auth.user?.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["client-crm-record", workspace.id] }),
        qc.invalidateQueries({ queryKey: ["clients", "workspaces"] }),
        qc.invalidateQueries({ queryKey: ["crm", "accounts"] }),
        qc.invalidateQueries({ queryKey: ["waveos", "workspaces"] }),
      ]);
      onRefresh();
      toast.success("Client information updated.");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not update client information."),
  });

  if (crmQ.isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading client information…
      </div>
    );
  }

  const primaryContactId = crmQ.data
    ? (crmQ.data.crm_contacts.find((contact) => contact.is_primary) ?? crmQ.data.crm_contacts[0])
        ?.id
    : null;

  return (
    <div className="space-y-5">
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Client profile</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            The account name and workspace details used throughout WaveOS.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client / business name">
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Industry">
            <input
              value={form.industry}
              onChange={(e) => set("industry", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Timezone">
            <input
              value={form.timezone}
              onChange={(e) => set("timezone", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Workspace URL">
            <input value={`/${workspace.slug}`} readOnly className={cn(inputCls, "opacity-70")} />
          </Field>
        </div>
      </section>

      {crmQ.data ? (
        <>
          <section className="space-y-4 border-t border-border pt-5">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Lead information</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                This is the original CRM record linked during client conversion. Changes stay in
                sync with the CRM.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business email">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Business phone">
                <input
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Website">
                <input
                  value={form.website}
                  onChange={(e) => set("website", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Preferred contact method">
                <input
                  value={form.preferredContact}
                  onChange={(e) => set("preferredContact", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Address">
                <input
                  value={form.address1}
                  onChange={(e) => set("address1", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Address line 2">
                <input
                  value={form.address2}
                  onChange={(e) => set("address2", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="City">
                <input
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="State">
                <input
                  value={form.state}
                  onChange={(e) => set("state", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Postal code">
                <input
                  value={form.postalCode}
                  onChange={(e) => set("postalCode", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Country">
                <input
                  value={form.country}
                  onChange={(e) => set("country", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Lead source">
                <input
                  value={form.leadSource}
                  onChange={(e) => set("leadSource", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Referral name">
                <input
                  value={form.referralName}
                  onChange={(e) => set("referralName", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Interested services">
                <input
                  value={form.services}
                  onChange={(e) => set("services", e.target.value)}
                  className={inputCls}
                  placeholder="Brand story, reels, photography"
                />
              </Field>
              <Field label="Estimated value ($)">
                <input
                  type="number"
                  min="0"
                  value={form.estimatedValue}
                  onChange={(e) => set("estimatedValue", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Priority">
                <select
                  value={form.priority}
                  onChange={(e) => set("priority", e.target.value)}
                  className={inputCls}
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </Field>
              <Field label="Next follow-up">
                <input
                  type="datetime-local"
                  value={form.nextFollowUp}
                  onChange={(e) => set("nextFollowUp", e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
            <div className="grid gap-2 rounded-lg border border-border/70 bg-background/30 p-3 text-xs sm:grid-cols-3">
              <span>
                <strong className="text-foreground">CRM stage:</strong>{" "}
                {crmQ.data.stage.replaceAll("_", " ")}
              </span>
              <span>
                <strong className="text-foreground">Added:</strong>{" "}
                {new Date(crmQ.data.created_at).toLocaleDateString()}
              </span>
              <span>
                <strong className="text-foreground">Last contacted:</strong>{" "}
                {crmQ.data.last_contacted_at
                  ? new Date(crmQ.data.last_contacted_at).toLocaleString()
                  : "—"}
              </span>
            </div>
            {crmQ.data.social_links &&
              typeof crmQ.data.social_links === "object" &&
              !Array.isArray(crmQ.data.social_links) &&
              Object.keys(crmQ.data.social_links).length > 0 && (
                <div className="rounded-lg border border-border/70 bg-background/30 p-3 text-xs">
                  <strong className="text-foreground">Social links</strong>
                  <div className="mt-2 grid gap-1 sm:grid-cols-2">
                    {Object.entries(crmQ.data.social_links).map(([platform, value]) => (
                      <span key={platform} className="break-all text-muted-foreground">
                        <span className="capitalize text-foreground">{platform}:</span>{" "}
                        {typeof value === "string" ? value : JSON.stringify(value)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
          </section>

          <section className="space-y-4 border-t border-border pt-5">
            <h3 className="text-sm font-semibold text-foreground">Primary contact</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name">
                <input
                  value={form.contactFirst}
                  onChange={(e) => set("contactFirst", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Last name">
                <input
                  value={form.contactLast}
                  onChange={(e) => set("contactLast", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Job title">
                <input
                  value={form.contactTitle}
                  onChange={(e) => set("contactTitle", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Contact preference">
                <input
                  value={form.contactPreference}
                  onChange={(e) => set("contactPreference", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => set("contactEmail", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Phone">
                <input
                  value={form.contactPhone}
                  onChange={(e) => set("contactPhone", e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
            {crmQ.data.crm_contacts.filter((contact) => contact.id !== primaryContactId).length >
              0 && (
              <div className="rounded-lg border border-border/70 bg-background/30 p-3">
                <p className="text-xs font-semibold text-foreground">Additional contacts</p>
                <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                  {crmQ.data.crm_contacts
                    .filter((contact) => contact.id !== primaryContactId)
                    .map((contact) => (
                      <li key={contact.id}>
                        <span className="font-medium text-foreground">
                          {contact.first_name} {contact.last_name ?? ""}
                        </span>
                        {contact.job_title ? ` · ${contact.job_title}` : ""}
                        {contact.email ? ` · ${contact.email}` : ""}
                        {contact.phone ? ` · ${contact.phone}` : ""}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="rounded-lg border border-border bg-background/30 p-4 text-sm text-muted-foreground">
          No CRM lead is linked to this client. Workspace information can still be edited here.
        </div>
      )}

      <div className="flex justify-end border-t border-border pt-4">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending || !form.name.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save client info
        </button>
      </div>
    </div>
  );
}

// ─── Access tab ───────────────────────────────────────────────────────────

function AccessTab({
  workspace,
  onLegacyStatus,
  onRefresh,
  onDeleted,
  isOwner,
}: {
  workspace: ClientWorkspace;
  onLegacyStatus: (s: WorkspaceStatusLegacy) => void;
  onRefresh: () => void;
  onDeleted: () => void;
  isOwner: boolean;
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
  const [weddingDisplayName, setWeddingDisplayName] = useState(workspace.wedding_display_name ?? workspace.name);
  const [weddingTheme, setWeddingTheme] = useState(workspace.wedding_theme === "gold" ? "gold" : "olive");
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
          ...tierStorage(tier, workspace.feature_overrides),
          account_status: status,
          agreement_term: term || null,
          access_starts_at: startsAt ? new Date(startsAt).toISOString() : null,
          access_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          wedding_display_name: tier === "wedding_client" ? weddingDisplayName.trim() || workspace.name : workspace.wedding_display_name,
          wedding_theme: tier === "wedding_client" ? weddingTheme : workspace.wedding_theme,
        })
        .eq("id", workspace.id);
      if (error) throw error;
      const { data: auth } = await supabase.auth.getUser();
      const { error: nerr } = await supabase.from("workspace_internal_notes").upsert({
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

  const toggleWeddingPortal = useMutation({
    mutationFn: async () => {
      const nextStatus: AccountStatus = status === "active" ? "suspended" : "active";
      const { error } = await supabase.from("workspaces").update({
        account_status: nextStatus,
        activated_at: nextStatus === "active" ? new Date().toISOString() : null,
        wedding_display_name: weddingDisplayName.trim() || workspace.name,
        wedding_theme: weddingTheme,
      }).eq("id", workspace.id);
      if (error) throw error;
      return nextStatus;
    },
    onSuccess: async (nextStatus) => {
      setStatus(nextStatus);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["clients", "workspaces"] }),
        qc.invalidateQueries({ queryKey: ["workspace-access", workspace.id] }),
        qc.invalidateQueries({ queryKey: ["wedding", "workspace", workspace.id] }),
      ]);
      toast.success(nextStatus === "active" ? "Deposit accepted — wedding portal is live." : "Wedding portal deactivated.");
      onRefresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not update the wedding portal."),
  });

  const deleteWorkspace = useMutation({
    mutationFn: async () => {
      const confirmation = window.prompt(
        `Permanently delete ${workspace.name}?\n\nThis removes the client workspace, access, content, approvals, invoices, deliveries, and related records. The person's login account is not deleted. Type ${workspace.name} to confirm.`,
      );
      if (confirmation === null) return false;
      if (confirmation !== workspace.name) throw new Error("Workspace name did not match.");

      const { data: media, error: mediaError } = await supabase
        .from("media_assets")
        .select("storage_path")
        .eq("workspace_id", workspace.id);
      if (mediaError) throw mediaError;

      const mediaPaths = (media ?? [])
        .map((asset) => asset.storage_path)
        .filter((path): path is string => Boolean(path));
      if (mediaPaths.length > 0) {
        const { error: storageError } = await supabase.storage.from("media").remove(mediaPaths);
        if (storageError) throw storageError;
      }

      const { error } = await db.rpc("delete_client_workspace", {
        _workspace_id: workspace.id,
        _confirmation: confirmation,
      });
      if (error) throw error;
      return true;
    },
    onSuccess: (deleted) => {
      if (!deleted) return;
      toast.success("Client permanently deleted.");
      onDeleted();
    },
    onError: (e: unknown) => {
      const message = e instanceof Error ? e.message : "Could not delete client.";
      toast.error(clientDeleteMessage(message));
    },
  });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Access tier">
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as ClientAccessTier)}
            className={inputCls}
          >
            <option value="project_client">Project Client — profile + invoices only</option>
            <option value="growth_90">Growth (90 days) — review + brand voice</option>
            <option value="retainer_full">Tier 3 — Full access, client managed</option>
            <option value="social_management">Tier 4 — Full access + Social Manager</option>
            <option value="wedding_client">Layer 5 — Wedding portal only</option>
          </select>
        </Field>
        <Field label="Account status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as AccountStatus)}
            className={inputCls}
          >
            <option value="pending">Pending — awaiting activation</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended — read-only</option>
            <option value="expired">Expired — falls back to project tier</option>
            <option value="archived">Archived</option>
          </select>
        </Field>
      </div>

      {tier === "wedding_client" && (
        <div className="space-y-4 rounded-2xl border border-primary/25 bg-primary/[0.06] p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Wedding portal</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Activate only after the deposit is accepted. Activation reveals the Creative Strategy Meeting, contracts, and payments.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Couple / client display name">
              <input value={weddingDisplayName} onChange={(e) => setWeddingDisplayName(e.target.value)} placeholder="Jean & Alex" className={inputCls} />
            </Field>
            <Field label="Wedding theme">
              <select value={weddingTheme} onChange={(e) => setWeddingTheme(e.target.value)} className={inputCls}>
                <option value="olive">Olive green & white</option>
                <option value="gold">Gold & white</option>
              </select>
            </Field>
          </div>
          <button type="button" disabled={toggleWeddingPortal.isPending} onClick={() => toggleWeddingPortal.mutate()} className={cn("inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold disabled:opacity-60", status === "active" ? "bg-success/15 text-success ring-1 ring-success/30" : "bg-primary text-primary-foreground")}>
            {status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {status === "active" ? "Deactivate wedding portal" : "Accept deposit & activate portal"}
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Agreement term">
          <select
            value={term}
            onChange={(e) => setTerm(e.target.value as AgreementTerm | "")}
            className={inputCls}
          >
            <option value="">—</option>
            <option value="one_time">One-time</option>
            <option value="90_day">90 days</option>
            <option value="6_month">6 months</option>
            <option value="12_month">12 months</option>
          </select>
        </Field>
        <Field label="Starts">
          <input
            type="date"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Expires">
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className={inputCls}
          />
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
        {isOwner && (
          <button
            onClick={() => deleteWorkspace.mutate()}
            disabled={deleteWorkspace.isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/20 disabled:opacity-60"
          >
            {deleteWorkspace.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Delete client
          </button>
        )}
      </div>
    </div>
  );
}

function clientDeleteMessage(message: string) {
  if (message.includes("owner_required"))
    return "Only the WaveOS owner can permanently delete clients.";
  if (message.includes("confirmation_name_mismatch")) return "Client name did not match.";
  if (message.includes("client_not_found")) return "This client no longer exists.";
  return message;
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
      qc.invalidateQueries({ queryKey: ["your-content", workspaceId] });
      qc.invalidateQueries({ queryKey: ["layer1", "deliveries", workspaceId] });
      toast.success("Delivery removed.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  const notifyRevisions = useMutation({
    mutationFn: async (deliveryId: string) => {
      const { data, error } = await db.rpc("notify_delivery_revisions_updated", {
        _delivery_id: deliveryId,
      });
      if (error) throw error;
      const delivery = q.data?.find((item) => item.id === deliveryId);
      const email = await tryEmail(() => sendWorkspaceEmail({
        workspaceId,
        event: "revisions_updated",
        title: delivery?.title ?? "Your content",
        url: delivery?.url,
      }));
      return { inApp: typeof data === "number" ? data : 0, email };
    },
    onSuccess: ({ inApp: recipientCount, email }) =>
      toast.success(
        email.sent
          ? `Revision update emailed to ${email.sent} client member${email.sent === 1 ? "" : "s"}.`
          : recipientCount === 1
          ? "Revision notification sent to 1 client member."
          : `Revision notification sent to ${recipientCount} client members.`,
      ),
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not notify the client."),
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
      {showForm && <DeliveryForm workspaceId={workspaceId} onDone={() => setShowForm(false)} />}
      {q.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (q.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No deliveries yet.</p>
      ) : (
        <ul className="space-y-2">
          {q.data!.map((d) => (
            <li
              key={d.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-surface/40 p-3"
            >
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
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => notifyRevisions.mutate(d.id)}
                  disabled={notifyRevisions.isPending}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-primary/30 px-2.5 py-1.5 text-xs text-primary hover:bg-primary/10 disabled:opacity-50"
                  title="Notify this client that revisions are updated"
                >
                  <BellRing className="h-3.5 w-3.5" /> Revisions updated
                </button>
                <button
                  onClick={() => confirm("Remove this delivery?") && del.mutate(d.id)}
                  className="rounded-md p-1.5 text-destructive hover:bg-destructive/15"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
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
      const trimmed = url.trim();
      if (!isValidHttpsUrl(trimmed)) throw new Error(URL_VALIDATION_MESSAGE);
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("client_deliveries").insert({
        workspace_id: workspaceId,
        title: title.trim(),
        url: trimmed,
        description: description.trim() || null,
        kind,
        created_by: auth.user?.id ?? null,
      }).select("id").single();
      if (error) {
        if (error.message.includes("client_deliveries_url_https")) {
          throw new Error(URL_VALIDATION_MESSAGE);
        }
        throw error;
      }
      await tryEmail(() => sendWorkspaceEmail({
        workspaceId,
        event: "content_added",
        title: title.trim(),
        url: trimmed,
      }));
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-deliveries", workspaceId] });
      qc.invalidateQueries({ queryKey: ["your-content", workspaceId] });
      qc.invalidateQueries({ queryKey: ["layer1", "deliveries", workspaceId] });
      toast.success("Delivery added.");
      onDone();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  const urlValid = isValidHttpsUrl(url);
  const canSubmit = title.trim().length > 0 && urlValid;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) create.mutate();
      }}
      className="space-y-3 rounded-lg border border-dashed border-border bg-surface/40 p-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
            placeholder="July Photo Shoot"
          />
        </Field>
        <Field label="Kind">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as DeliveryKind)}
            className={inputCls}
          >
            {(
              [
                "photos",
                "videos",
                "reels",
                "graphics",
                "documents",
                "link",
                "other",
              ] as DeliveryKind[]
            ).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="URL">
        <input
          required
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className={inputCls}
          placeholder="https://drive.google.com/…"
        />
        {url.trim() && !urlValid && (
          <p className="mt-1 text-xs text-destructive">{URL_VALIDATION_MESSAGE}</p>
        )}
      </Field>
      <Field label="Description (optional)">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className={inputCls}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-xs text-foreground hover:bg-elevated"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit || create.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save
        </button>
      </div>
    </form>
  );
}

// ─── External contracts tab ───────────────────────────────────────────────

function ContractsTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hostedUrl, setHostedUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["client-contracts", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["layer1", "contracts", workspaceId] }),
    ]);
  const q = useQuery({
    queryKey: ["client-contracts", workspaceId],
    queryFn: async (): Promise<ContractRow[]> => {
      const { data, error } = await db
        .from("client_contracts")
        .select("id,title,description,provider,hosted_url,status,sent_at,signed_at,expires_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      const url = hostedUrl.trim();
      if (!isValidHttpsUrl(url)) throw new Error(URL_VALIDATION_MESSAGE);
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await db.from("client_contracts").insert({
        workspace_id: workspaceId,
        title: title.trim(),
        description: description.trim() || null,
        provider: url.includes("bloom.io") ? "bloom" : "other",
        hosted_url: url,
        status: "sent",
        sent_at: new Date().toISOString(),
        expires_at: dateInputToIso(expiresAt),
        created_by: auth.user?.id,
      }).select("id").single();
      if (error) throw error;
      await tryEmail(() => sendWorkspaceEmail({
        workspaceId,
        event: "contract_ready",
        title: title.trim(),
        status: "sent",
        url,
      }));
      return data;
    },
    onSuccess: async () => {
      setTitle(""); setDescription(""); setHostedUrl(""); setExpiresAt(""); setShowForm(false);
      await refresh();
      toast.success("Contract link added.");
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not add contract."),
  });
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ContractStatus }) => {
      const { error } = await db.from("client_contracts").update({
        status,
        signed_at: status === "signed" ? new Date().toISOString() : null,
      }).eq("id", id).eq("workspace_id", workspaceId);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("client_contracts").delete().eq("id", id).eq("workspace_id", workspaceId);
      if (error) throw error;
    },
    onSuccess: async () => { await refresh(); toast.success("Contract removed."); },
  });
  const inputCls = "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";

  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">Connect a Bloom.io or other secure signing link.</p>
      <button onClick={() => setShowForm((value) => !value)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground">
        {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}{showForm ? "Cancel" : "Add contract"}
      </button>
    </div>
    {showForm && <form onSubmit={(event) => { event.preventDefault(); create.mutate(); }} className="grid gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:grid-cols-2">
      <Field label="Contract title"><input required minLength={2} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Media services agreement" className={inputCls} /></Field>
      <Field label="Bloom contract link"><input required type="url" value={hostedUrl} onChange={(event) => setHostedUrl(event.target.value)} placeholder="https://...bloom.io/..." className={inputCls} /></Field>
      <Field label="Description"><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional client note" className={inputCls} /></Field>
      <Field label="Expires"><input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className={inputCls} /></Field>
      <button disabled={create.isPending || title.trim().length < 2 || !isValidHttpsUrl(hostedUrl)} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:col-span-2">
        {create.isPending ? "Adding…" : "Add contract link"}
      </button>
    </form>}
    {q.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (q.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No contracts yet.</p> :
      <ul className="space-y-2">{q.data?.map((contract) => <li key={contract.id} className="flex flex-col gap-3 rounded-xl border border-border/60 bg-surface/40 p-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{contract.title}</p>{contract.description && <p className="mt-1 text-xs text-muted-foreground">{contract.description}</p>}
          <a href={contract.hosted_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-primary"><ExternalLink className="h-3.5 w-3.5" />Open {contract.provider === "bloom" ? "in Bloom" : "contract"}</a></div>
        <div className="flex items-center gap-2"><select value={contract.status} onChange={(event) => updateStatus.mutate({ id: contract.id, status: event.target.value as ContractStatus })} className="min-h-10 rounded-lg border border-border bg-background px-2 text-xs capitalize">
          {(["draft","sent","viewed","signed","declined","expired","void"] as ContractStatus[]).map((status) => <option key={status} value={status}>{status}</option>)}</select>
          <button onClick={() => confirm("Remove this contract link?") && remove.mutate(contract.id)} className="flex h-10 w-10 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button></div>
      </li>)}</ul>}
  </div>;
}

// ─── Invoices tab ─────────────────────────────────────────────────────────

function InvoicesTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceListItem | null>(null);
  const closeForm = () => {
    setShowForm(false);
    setEditingInvoice(null);
  };
  const refreshInvoices = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["client-invoices", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["layer1", "invoices", workspaceId] }),
    ]);
  const q = useQuery({
    queryKey: ["client-invoices", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_invoices")
        .select(
          "id,number,description,amount_cents,currency,status,hosted_url,issued_at,due_at,paid_at",
        )
        .eq("workspace_id", workspaceId)
        .order("issued_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InvoiceListItem[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_, id) => {
      if (editingInvoice?.id === id) closeForm();
      await refreshInvoices();
      toast.success("Invoice removed.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: InvoiceStatus }) => {
      const { error } = await supabase
        .from("client_invoices")
        .update({
          status,
          paid_at: status === "paid" ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
      const invoice = q.data?.find((item) => item.id === id);
      await tryEmail(() => sendWorkspaceEmail({
        workspaceId,
        event: "invoice_updated",
        title: invoice?.number || "Invoice",
        status,
        url: invoice?.hosted_url,
      }));
    },
    onSuccess: async () => {
      await refreshInvoices();
      toast.success("Invoice status updated.");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not update invoice."),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => {
            if (showForm && !editingInvoice) {
              closeForm();
              return;
            }
            setEditingInvoice(null);
            setShowForm(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:brightness-110"
        >
          {showForm && !editingInvoice ? (
            <>
              <X className="h-3.5 w-3.5" /> Cancel new invoice
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" /> Add invoice
            </>
          )}
        </button>
      </div>
      {showForm && (
        <InvoiceForm
          key={editingInvoice?.id ?? "new-invoice"}
          workspaceId={workspaceId}
          invoice={editingInvoice}
          onDone={closeForm}
        />
      )}
      {q.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (q.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No invoices yet.</p>
      ) : (
        <ul className="space-y-2">
          {q.data!.map((i) => (
            <li
              key={i.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-surface/40 p-3"
            >
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
                      {(i.amount_cents / 100).toLocaleString("en-US", {
                        style: "currency",
                        currency: i.currency,
                      })}
                    </span>
                  )}
                  <span>Issued {new Date(i.issued_at).toLocaleDateString()}</span>
                  {i.due_at && <span>Due {new Date(i.due_at).toLocaleDateString()}</span>}
                  {i.hosted_url && (
                    <a
                      href={i.hosted_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> Open
                    </a>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditingInvoice(i);
                    setShowForm(true);
                  }}
                  className="rounded-md p-1.5 text-primary hover:bg-primary/15"
                  aria-label={`Edit ${i.number || "invoice"}`}
                  title="Edit invoice"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <select
                  value={i.status}
                  onChange={(event) =>
                    updateStatus.mutate({
                      id: i.id,
                      status: event.target.value as InvoiceStatus,
                    })
                  }
                  disabled={updateStatus.isPending}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground disabled:opacity-50"
                  aria-label={`Invoice status for ${i.number || "invoice"}`}
                >
                  <option value="deposit">Deposit</option>
                  <option value="paid">Paid</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="overdue">Overdue</option>
                  <option value="void">Void</option>
                </select>
                <button
                  onClick={() => confirm("Remove this invoice?") && del.mutate(i.id)}
                  className="rounded-md p-1.5 text-destructive hover:bg-destructive/15"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
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
    deposit: "bg-primary/15 text-primary ring-primary/30",
    unpaid: "bg-warning/15 text-warning ring-warning/30",
  };
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1",
        tone[status],
      )}
    >
      {status}
    </span>
  );
}

function dateInputToIso(value: string): string | null {
  return value ? `${value}T12:00:00.000Z` : null;
}

function InvoiceForm({
  workspaceId,
  invoice,
  onDone,
}: {
  workspaceId: string;
  invoice: InvoiceListItem | null;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [number, setNumber] = useState(invoice?.number ?? "");
  const [description, setDescription] = useState(invoice?.description ?? "");
  const [amount, setAmount] = useState(
    invoice?.amount_cents === null || invoice?.amount_cents === undefined
      ? ""
      : (invoice.amount_cents / 100).toFixed(2),
  );
  const [currency, setCurrency] = useState(invoice?.currency ?? "USD");
  const [status, setStatus] = useState<InvoiceStatus>(invoice?.status ?? "unpaid");
  const [hostedUrl, setHostedUrl] = useState(invoice?.hosted_url ?? "");
  const [issuedAt, setIssuedAt] = useState(
    invoice?.issued_at.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  );
  const [dueAt, setDueAt] = useState(invoice?.due_at?.slice(0, 10) ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const trimmedUrl = hostedUrl.trim();
      if (trimmedUrl && !isValidHttpsUrl(trimmedUrl)) {
        throw new Error(URL_VALIDATION_MESSAGE);
      }
      const cents = amount ? Math.round(parseFloat(amount) * 100) : null;
      const values = {
        number: number.trim() || null,
        description: description.trim() || null,
        amount_cents: cents,
        currency: currency.trim().toUpperCase(),
        status,
        hosted_url: trimmedUrl || null,
        issued_at: dateInputToIso(issuedAt)!,
        due_at: dateInputToIso(dueAt),
        paid_at: status === "paid" ? (invoice?.paid_at ?? new Date().toISOString()) : null,
      };

      let result: { data: { id: string } | null; error: { message: string } | null };
      if (invoice) {
        result = await supabase
          .from("client_invoices")
          .update(values)
          .eq("id", invoice.id)
          .eq("workspace_id", workspaceId)
          .select("id")
          .single();
      } else {
        const { data: auth } = await supabase.auth.getUser();
        result = await supabase
          .from("client_invoices")
          .insert({
            workspace_id: workspaceId,
            ...values,
            created_by: auth.user?.id ?? null,
          })
          .select("id")
          .single();
      }
      const { data, error } = result;
      if (error) {
        if (error.message.includes("client_invoices_hosted_url_https")) {
          throw new Error(URL_VALIDATION_MESSAGE);
        }
        throw error;
      }
      if (!data?.id) throw new Error("The invoice changes were not saved. Please try again.");
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["client-invoices", workspaceId] }),
        qc.invalidateQueries({ queryKey: ["layer1", "invoices", workspaceId] }),
      ]);
      toast.success(invoice ? "Invoice updated." : "Invoice added.");
      onDone();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  const hostedUrlValid = !hostedUrl.trim() || isValidHttpsUrl(hostedUrl);
  const currencyValid = /^[A-Za-z]{3}$/.test(currency.trim());
  const amountValid = !amount || (Number.isFinite(Number(amount)) && Number(amount) >= 0);
  const canSave = hostedUrlValid && currencyValid && amountValid && Boolean(issuedAt);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) save.mutate();
      }}
      className="space-y-3 rounded-lg border border-dashed border-border bg-surface/40 p-3"
    >
      <div>
        <p className="text-sm font-semibold text-foreground">
          {invoice ? `Edit ${invoice.number || "invoice"}` : "New invoice"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {invoice
            ? "Update the invoice details below. Clients will see the changes immediately."
            : "Add an invoice to this client's account."}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Number">
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className={inputCls}
            placeholder="INV-2026-014"
          />
        </Field>
        <Field label="Amount">
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputCls}
            placeholder="1250.00"
          />
        </Field>
        <Field label="Currency">
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            maxLength={3}
            className={inputCls}
          />
          {!currencyValid && (
            <p className="mt-1 text-xs text-destructive">Use a three-letter currency code.</p>
          )}
        </Field>
      </div>
      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className={inputCls}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
            className={inputCls}
          >
            {(
              ["deposit", "paid", "unpaid", "draft", "sent", "overdue", "void"] as InvoiceStatus[]
            ).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Issued">
          <input
            type="date"
            value={issuedAt}
            onChange={(e) => setIssuedAt(e.target.value)}
            className={inputCls}
            required
          />
        </Field>
        <Field label="Due">
          <input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="Hosted URL">
        <input
          type="url"
          value={hostedUrl}
          onChange={(e) => setHostedUrl(e.target.value)}
          className={inputCls}
          placeholder="https://…"
        />
        {!hostedUrlValid && (
          <p className="mt-1 text-xs text-destructive">{URL_VALIDATION_MESSAGE}</p>
        )}
      </Field>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-xs text-foreground hover:bg-elevated"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSave || save.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {invoice ? "Save changes" : "Add invoice"}
        </button>
      </div>
    </form>
  );
}

// ─── Invites tab ──────────────────────────────────────────────────────────

function InvitesTab({
  workspace,
  onNewInvite,
}: {
  workspace: ClientWorkspace;
  onNewInvite: (p: { link: string; email: string; workspace: string }) => void;
}) {
  const qc = useQueryClient();
  const membersQ = useQuery({
    queryKey: ["clients", "members", workspace.id],
    queryFn: async () => {
      const { data, error } = await db.rpc("get_client_member_directory", {
        _workspace_id: workspace.id,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        user_id: string;
        email: string | null;
        first_name: string | null;
        last_name: string | null;
        workspace_role: string;
      }>;
    },
  });
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
      const { data, error } = await supabase.rpc("resend_invite", {
        _invite_id: id,
        _extend_days: 14,
      });
      if (error) throw error;
      const token = (data as { raw_token: string }[] | null)?.[0]?.raw_token ?? "";
      const link = `${window.location.origin}/accept-invite?token=${encodeURIComponent(token)}`;
      const delivery = await tryEmail(() => sendInviteEmail(id, link));
      return { token, delivery };
    },
    onSuccess: ({ token, delivery }, id) => {
      qc.invalidateQueries({ queryKey: ["clients", "invites", workspace.id] });
      const row = invitesQ.data?.find((i) => i.id === id);
      onNewInvite({
        link: `${window.location.origin}/accept-invite?token=${encodeURIComponent(token)}`,
        email: row?.email ?? "",
        workspace: workspace.name,
      });
      toast.success(delivery.sent ? "Client invitation emailed." : "Invite refreshed. Copy the link to send it manually.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  const sendPasswordReset = useMutation({
    mutationFn: async (targetEmail: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      return targetEmail;
    },
    onSuccess: (targetEmail) => toast.success(`Password reset sent to ${targetEmail}.`),
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not send password reset."),
  });

  return (
    <div className="space-y-3">
      <InviteQuickForm workspace={workspace} onNewInvite={onNewInvite} />
      {(membersQ.data ?? []).length > 0 && (
        <div className="rounded-lg border border-border/60 bg-surface/40 p-3">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Current client members
          </p>
          <ul className="space-y-2">
            {membersQ.data!.map((member) => {
              const name = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim();
              return (
                <li key={member.user_id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">
                      {name || member.email || "Client member"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {member.email} · {member.workspace_role}
                    </p>
                  </div>
                  {member.email && (
                    <button
                      onClick={() => sendPasswordReset.mutate(member.email!)}
                      disabled={sendPasswordReset.isPending}
                      className="whitespace-nowrap rounded-lg border border-primary/30 px-3 py-1.5 text-xs text-primary hover:bg-primary/10 disabled:opacity-50"
                    >
                      Send password reset
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
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
                  {inv.status === "pending" &&
                    inv.expires_at &&
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
                {(inv.status === "pending" ||
                  inv.status === "expired" ||
                  inv.status === "revoked") && (
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
  );
}

function InviteQuickForm({
  workspace,
  onNewInvite,
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
        role === "owner"
          ? "client_owner"
          : role === "approver"
            ? "client_approver"
            : "client_viewer";
      const { data, error } = await supabase.rpc("create_invite", {
        _email: email.trim().toLowerCase(),
        _workspace_id: workspace.id,
        _workspace_role: role,
        _app_role: appRole,
        _expires_days: 14,
      });
      if (error) throw error;
      const row = (data as { invite_id: string; raw_token: string }[] | null)?.[0];
      if (!row?.raw_token || !row.invite_id) throw new Error("No token returned");
      const link = `${window.location.origin}/accept-invite?token=${encodeURIComponent(row.raw_token)}`;
      const delivery = await tryEmail(() => sendInviteEmail(row.invite_id, link));
      return {
        link,
        email: email.trim(),
        workspace: workspace.name,
        delivery,
      };
    },
    onSuccess: (payload) => {
      qc.invalidateQueries({ queryKey: ["clients", "invites", workspace.id] });
      setEmail("");
      onNewInvite(payload);
      toast.success(payload.delivery.sent ? "Client invitation emailed." : "Invite created. Copy the link to send it manually.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed."),
  });
  const canSubmit = /@/.test(email);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) create.mutate();
      }}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border bg-surface/40 p-3"
    >
      <div className="flex-1 min-w-[200px]">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Invite email
        </label>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputCls}
          placeholder="owner@client.com"
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Role
        </label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as typeof role)}
          className={inputCls}
        >
          <option value="owner">Owner</option>
          <option value="approver">Approver</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={!canSubmit || create.isPending}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
      >
        {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Send invite
      </button>
    </form>
  );
}

// ─── Onboarding modal (new client) ────────────────────────────────────────

function OnboardingModal({
  onClose,
  onCreated,
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
  const [weddingDisplayName, setWeddingDisplayName] = useState("");
  const [weddingTheme, setWeddingTheme] = useState("olive");

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
          ...tierStorage(tier),
          account_status: "pending",
          agreement_term: term || null,
          access_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          invited_at: new Date().toISOString(),
          wedding_display_name: tier === "wedding_client" ? weddingDisplayName.trim() || name.trim() : null,
          wedding_theme: tier === "wedding_client" ? weddingTheme : "olive",
        })
        .select()
        .single();
      if (wsErr) throw wsErr;

      const appRole =
        role === "owner"
          ? "client_owner"
          : role === "approver"
            ? "client_approver"
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
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) create.mutate();
        }}
        className="space-y-4"
      >
        <p className="text-xs text-muted-foreground">
          Creates a Pending workspace at the chosen tier and generates a private, single-use invite
          link (14-day expiry). Access activates when the client signs in and accepts.
        </p>

        <Field label="Client / brand name">
          <input
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Coffee Co."
            className={inputCls}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="URL slug (optional)">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="acme-coffee"
              className={inputCls}
            />
          </Field>
          <Field label="Industry">
            <input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="Coffee shop"
              className={inputCls}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Access tier">
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as ClientAccessTier)}
              className={inputCls}
            >
              <option value="project_client">Project Client</option>
              <option value="growth_90">Growth (90 days)</option>
              <option value="retainer_full">Tier 3 — Full access, client managed</option>
              <option value="social_management">Tier 4 — Full access + Social Manager</option>
              <option value="wedding_client">Layer 5 — Wedding portal</option>
            </select>
          </Field>
          <Field label="Agreement term">
            <select
              value={term}
              onChange={(e) => setTerm(e.target.value as AgreementTerm | "")}
              className={inputCls}
            >
              <option value="">—</option>
              <option value="one_time">One-time</option>
              <option value="90_day">90 days</option>
              <option value="6_month">6 months</option>
              <option value="12_month">12 months</option>
            </select>
          </Field>
        </div>

        {tier === "wedding_client" && (
          <div className="grid gap-4 rounded-2xl border border-primary/25 bg-primary/[0.06] p-4 sm:grid-cols-2">
            <Field label="Couple / client display name">
              <input value={weddingDisplayName} onChange={(e) => setWeddingDisplayName(e.target.value)} placeholder="Jean & Alex" className={inputCls} />
            </Field>
            <Field label="Wedding theme">
              <select value={weddingTheme} onChange={(e) => setWeddingTheme(e.target.value)} className={inputCls}>
                <option value="olive">Olive green & white</option>
                <option value="gold">Gold & white</option>
              </select>
            </Field>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Access expires (optional)">
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Timezone">
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className={inputCls}
            >
              {[
                "America/New_York",
                "America/Chicago",
                "America/Denver",
                "America/Los_Angeles",
                "Europe/London",
                "Europe/Paris",
                "Asia/Dubai",
                "Asia/Tokyo",
                "Australia/Sydney",
              ].map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="my-2 h-px bg-border" />

        <Field label="Client contact email">
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@acmecoffee.com"
            className={inputCls}
          />
        </Field>

        <Field label="Role in this workspace">
          <div className="grid grid-cols-3 gap-2">
            {(["owner", "approver", "viewer"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs font-medium capitalize transition-all",
                  role === r
                    ? "border-primary/50 bg-primary/15 text-foreground ring-1 ring-primary/40"
                    : "border-border bg-surface/60 text-muted-foreground hover:text-foreground",
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-surface/60 px-3 py-2 text-sm text-foreground hover:bg-elevated"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit || create.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-60"
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create workspace & invite
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function InviteLinkModal({
  link,
  email,
  workspace,
  onClose,
}: {
  link: string;
  email: string;
  workspace: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <ModalShell title="Invite ready" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">
          <Check className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <div className="font-medium text-foreground">{workspace} is ready.</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Send this private link to <span className="text-foreground">{email}</span>. It's
              single-use, expires in 14 days, and can only be redeemed by that email. We won't show
              this link again.
            </p>
          </div>
        </div>
        <div className="flex items-stretch gap-2">
          <input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className={cn(inputCls, "font-mono text-xs")}
          />
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
          <button
            onClick={onClose}
            className="rounded-lg border border-border bg-surface/60 px-3 py-2 text-sm text-foreground hover:bg-elevated"
          >
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
  children,
  onClose,
  title,
  wide,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:px-4 sm:py-8"
      role="dialog"
    >
      <div className="absolute inset-0 bg-background/70 backdrop-blur" onClick={onClose} />
      <div
        className={cn(
          "surface-card relative h-[100dvh] w-full overflow-y-auto rounded-none p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:h-auto sm:max-h-[90vh] sm:rounded-xl sm:p-6",
          wide ? "max-w-2xl" : "max-w-lg",
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-elevated hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
