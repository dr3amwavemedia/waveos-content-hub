import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  CheckCircle2,
  Copy,
  Eye,
  Loader2,
  MailPlus,
  KeyRound,
  History,
  Pencil,
  RefreshCw,
  Save,
  ShieldCheck,
  UserMinus,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/app/empty-state";
import { useActingStaff } from "@/hooks/use-acting-staff";
import { getIntegrationStatus } from "@/lib/ayrshare.functions";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];
type StaffType = "sales" | "media_manager" | "crew";
type StaffPosition = StaffType | "admin";

const STAFF_TYPE_LABEL: Record<StaffType, string> = {
  sales: "Sales",
  media_manager: "Social Manager",
  crew: "Crew",
};

const db = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: Array<Record<string, unknown>> | null; error: Error | null }>;
};

interface StaffDirectoryRow {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: AppRole;
  staff_type: StaffType | null;
  created_at: string;
}

interface AuditRow {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string | null;
  safe_metadata: Record<string, unknown>;
  created_at: string;
}

export const Route = createFileRoute("/_authenticated/admin")({
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
  component: AdminPage,
  head: () => ({
    meta: [{ title: "Staff — WaveOS" }, { name: "robots", content: "noindex" }],
  }),
});

function AdminPage() {
  const qc = useQueryClient();
  const acting = useActingStaff();
  const [email, setEmail] = useState("");
  const [staffType, setStaffType] = useState<StaffType>("sales");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [editingStaff, setEditingStaff] = useState<StaffDirectoryRow | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");

  const staffQ = useQuery({
    queryKey: ["admin", "staff"],
    queryFn: async () => {
      const { data, error } = await db.rpc("get_staff_directory");
      if (error) throw error;
      return (data ?? []) as unknown as StaffDirectoryRow[];
    },
  });

  const invitesQ = useQuery({
    queryKey: ["admin", "staff-invites"],
    queryFn: async () => {
      const { data, error } = await db
        .from("invites_admin")
        .select("id,email,status,staff_type,expires_at,created_at,resend_count")
        .is("workspace_id", null)
        .eq("app_role", "dream_wave_team")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        email: string;
        status: string;
        staff_type: StaffType | null;
        expires_at: string | null;
        created_at: string;
        resend_count: number;
      }>;
    },
  });

  const auditQ = useQuery({
    queryKey: ["admin", "audit-log"],
    queryFn: async () => {
      const { data, error } = await db
        .from("activity_logs")
        .select("id,actor_user_id,action,entity_type,safe_metadata,created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const invite = useMutation({
    mutationFn: async ({ targetEmail, type }: { targetEmail: string; type: StaffType }) => {
      const clean = targetEmail.trim().toLowerCase();
      if (!clean) throw new Error("Enter an email.");
      const { data, error } = await db.rpc("create_staff_invite", {
        _email: clean,
        _staff_type: type,
        _expires_days: 14,
      });
      if (error) throw error;
      const token = data?.[0]?.raw_token as string | undefined;
      if (!token) throw new Error("The staff invite was created without a link.");
      return `${window.location.origin}/accept-invite?token=${encodeURIComponent(token)}`;
    },
    onSuccess: (link) => {
      setEmail("");
      setInviteLink(link);
      qc.invalidateQueries({ queryKey: ["admin", "staff-invites"] });
      toast.success("Staff invitation created.");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not create staff invitation."),
  });

  const resend = useMutation({
    mutationFn: async (inviteId: string) => {
      const { data, error } = await supabase.rpc("resend_invite", {
        _invite_id: inviteId,
        _extend_days: 14,
      });
      if (error) throw error;
      const token = data?.[0]?.raw_token;
      if (!token) throw new Error("Could not create a refreshed invitation link.");
      return `${window.location.origin}/accept-invite?token=${encodeURIComponent(token)}`;
    },
    onSuccess: (link) => {
      setInviteLink(link);
      qc.invalidateQueries({ queryKey: ["admin", "staff-invites"] });
      toast.success("Staff invitation refreshed.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not resend."),
  });

  const revokeInvite = useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.rpc("revoke_invite", { _invite_id: inviteId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "staff-invites"] });
      toast.success("Staff invitation revoked.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not revoke."),
  });

  const revoke = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase.rpc("revoke_staff_role", {
        _target_user: userId,
        _role: role,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "staff"] });
      toast.success("Role revoked.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  const changeStaffPosition = useMutation({
    mutationFn: async ({ userId, position }: { userId: string; position: StaffPosition }) => {
      const { error } = await db.rpc("set_staff_position", {
        _target_user: userId,
        _position: position,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "staff"] });
      toast.success("Staff position updated.");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not update staff position."),
  });

  const updateStaffInfo = useMutation({
    mutationFn: async () => {
      if (!editingStaff) return;
      const { error } = await db.rpc("admin_update_staff_name", {
        _target_user: editingStaff.user_id,
        _first_name: editFirstName,
        _last_name: editLastName || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingStaff(null);
      qc.invalidateQueries({ queryKey: ["admin", "staff"] });
      qc.invalidateQueries({ queryKey: ["crm", "staff"] });
      toast.success("Staff information updated.");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not update staff information."),
  });

  const viewAsStaff = async (member: StaffDirectoryRow) => {
    acting.enable({
      userId: member.user_id,
      email: member.email ?? "",
      firstName: member.first_name,
      lastName: member.last_name,
      staffType: member.staff_type ?? "sales",
    });
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["waveos", "current-user"] }),
      qc.invalidateQueries({ queryKey: ["waveos", "workspaces"] }),
    ]);
    window.location.assign("/home");
  };

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

  const statusFn = useServerFn(getIntegrationStatus);
  const statusQ = useQuery({
    queryKey: ["integration-status"],
    queryFn: () => statusFn(),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
            Dream Wave Media
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Staff
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Invite employees by email and manage Dream Wave Team access. After an invitation is
            accepted, an Admin can change that person between Admin, Sales, and Social Manager.
            WaveOS always protects the final remaining Admin.
          </p>
        </div>
      </header>

      <div className="surface-card p-5">
        <h2 className="text-sm font-semibold text-foreground">Invite a staff member</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Enter their work email. They will create or sign into their own staff account through a
          secure, single-use link.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate({ targetEmail: email, type: staffType });
          }}
          className="mt-3 flex flex-col gap-2 sm:flex-row"
        >
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="employee@dreamwavemedia.co"
            className="flex-1 rounded-lg border border-input bg-surface/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <select
            value={staffType}
            onChange={(e) => setStaffType(e.target.value as StaffType)}
            className="rounded-lg border border-input bg-surface/60 px-3 py-2 text-sm text-foreground"
          >
            <option value="sales">Sales</option>
            <option value="media_manager">Social Manager</option>
            <option value="crew">Crew — Production only</option>
          </select>
          <button
            type="submit"
            disabled={invite.isPending || !email.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-60"
          >
            {invite.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MailPlus className="h-4 w-4" />
            )}
            Create staff invite
          </button>
        </form>
        {inviteLink && (
          <div className="mt-4 rounded-lg border border-primary/30 bg-primary/10 p-3">
            <p className="text-xs font-medium text-foreground">Secure staff invite link</p>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{inviteLink}</p>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(inviteLink);
                toast.success("Invite link copied.");
              }}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 px-3 py-1.5 text-xs font-medium text-primary"
            >
              <Copy className="h-3.5 w-3.5" /> Copy link
            </button>
          </div>
        )}
      </div>

      <div className="surface-card overflow-hidden">
        <div className="border-b border-border/60 px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">Staff invitations</h2>
        </div>
        {(invitesQ.data ?? []).length === 0 ? (
          <div className="px-5 py-6 text-sm text-muted-foreground">No staff invitations yet.</div>
        ) : (
          <ul className="divide-y divide-border/60">
            {invitesQ.data!.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div>
                  <div className="text-sm font-medium text-foreground">{item.email}</div>
                  <div className="text-xs text-muted-foreground">
                    {STAFF_TYPE_LABEL[(item.staff_type ?? "sales") as StaffType]} · {item.status} ·
                    expires{" "}
                    {item.expires_at ? new Date(item.expires_at).toLocaleDateString() : "not set"}
                  </div>
                </div>
                {item.status === "pending" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => item.id && resend.mutate(item.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-elevated"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Refresh link
                    </button>
                    <button
                      onClick={() => item.id && revokeInvite.mutate(item.id)}
                      className="rounded-lg border border-destructive/30 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                    >
                      Revoke
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="surface-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
          <div>
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <History className="h-4 w-4 text-primary" /> Admin audit history
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Recent invitations, access changes, approvals, CRM conversions, and account actions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => auditQ.refetch()}
            className="min-h-10 min-w-10 rounded-lg border border-border p-2.5 text-muted-foreground hover:bg-elevated hover:text-foreground"
            aria-label="Refresh audit history"
          >
            <RefreshCw className={auditQ.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </button>
        </div>
        {auditQ.isLoading ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading history…
          </div>
        ) : auditQ.isError ? (
          <div className="px-5 py-5 text-sm text-muted-foreground">
            Audit history could not be loaded. Existing account tools are unaffected.
          </div>
        ) : !(auditQ.data ?? []).length ? (
          <div className="px-5 py-5 text-sm text-muted-foreground">
            No account activity recorded yet.
          </div>
        ) : (
          <ul className="max-h-[28rem] divide-y divide-border/60 overflow-y-auto">
            {auditQ.data!.map((entry) => {
              const actor = staffQ.data?.find((staff) => staff.user_id === entry.actor_user_id);
              const actorName = actor
                ? `${actor.first_name ?? ""} ${actor.last_name ?? ""}`.trim() || actor.email
                : null;
              return (
                <li key={entry.id} className="px-4 py-3 sm:px-5">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-foreground">
                        {entry.action.replaceAll("_", " ")}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {actorName ?? "System"}
                        {entry.entity_type ? ` · ${entry.entity_type}` : ""}
                      </p>
                    </div>
                    <time className="shrink-0 text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString()}
                    </time>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="surface-card overflow-hidden">
        <div className="border-b border-border/60 px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">Current staff</h2>
        </div>
        {staffQ.isLoading ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (staffQ.data ?? []).length === 0 ? (
          <div className="p-6">
            <EmptyState icon={ShieldCheck} title="No staff yet" body="Grant a team member above." />
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {staffQ.data!.map((s) => {
              const displayName =
                `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || s.email || "Staff member";
              const editing = editingStaff?.user_id === s.user_id;
              return (
                <li key={`${s.user_id}-${s.role}`} className="px-4 py-4 sm:px-5 sm:py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <div className="truncate text-sm font-medium text-foreground">
                          {displayName}
                        </div>
                        {s.role === "dream_wave_team" && (
                          <button
                            type="button"
                            onClick={() => void viewAsStaff(s)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            <Eye className="h-3.5 w-3.5" /> View
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingStaff(editing ? null : s);
                            setEditFirstName(s.first_name ?? "");
                            setEditLastName(s.last_name ?? "");
                          }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit info
                        </button>
                      </div>
                      {s.email && (
                        <div className="truncate text-xs text-muted-foreground">{s.email}</div>
                      )}
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end sm:gap-3">
                      <span
                        className={
                          "rounded-md px-2 py-0.5 text-xs font-medium ring-1 " +
                          (s.role === "dream_wave_owner"
                            ? "bg-primary/15 text-primary ring-primary/30"
                            : "bg-elevated text-foreground ring-border")
                        }
                      >
                        {s.role === "dream_wave_owner" ? "Admin" : "Team"}
                      </span>
                      <select
                        value={
                          s.role === "dream_wave_owner"
                            ? "admin"
                            : ((s.staff_type ?? "sales") as StaffType)
                        }
                        onChange={(e) =>
                          changeStaffPosition.mutate({
                            userId: s.user_id,
                            position: e.target.value as StaffPosition,
                          })
                        }
                        disabled={changeStaffPosition.isPending}
                        className="min-h-10 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground sm:min-h-0 sm:flex-none"
                        aria-label={`Staff position for ${s.email ?? s.user_id}`}
                      >
                        <option value="admin">Admin</option>
                        <option value="sales">Sales</option>
                        <option value="media_manager">Social Manager</option>
            <option value="crew">Crew — Production only</option>
                      </select>
                      {s.email && (
                        <button
                          onClick={() => sendPasswordReset.mutate(s.email!)}
                          disabled={sendPasswordReset.isPending}
                          className="min-h-10 min-w-10 rounded-md p-2 text-primary hover:bg-primary/15 disabled:opacity-50 sm:min-h-0 sm:min-w-0 sm:p-1.5"
                          title={`Send password reset to ${s.email}`}
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                      )}
                      {s.role === "dream_wave_team" && (
                        <button
                          onClick={() =>
                            revoke.mutate({ userId: s.user_id, role: "dream_wave_team" })
                          }
                          className="min-h-10 min-w-10 rounded-md p-2 text-destructive hover:bg-destructive/15 sm:min-h-0 sm:min-w-0 sm:p-1.5"
                          title="Revoke staff role"
                        >
                          <UserMinus className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  {editing && (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        updateStaffInfo.mutate();
                      }}
                      className="mt-3 grid gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 sm:grid-cols-[1fr_1fr_auto]"
                    >
                      <input
                        value={editFirstName}
                        onChange={(event) => setEditFirstName(event.target.value)}
                        placeholder="First name"
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      />
                      <input
                        value={editLastName}
                        onChange={(event) => setEditLastName(event.target.value)}
                        placeholder="Last name"
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      />
                      <button
                        disabled={!editFirstName.trim() || updateStaffInfo.isPending}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        {updateStaffInfo.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        Save
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="surface-card p-5">
        <h2 className="text-sm font-semibold text-foreground">Integration status</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Booleans only — actual secret values are never exposed to the UI.
        </p>
        {statusQ.isLoading ? (
          <div className="mt-4 flex items-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking…
          </div>
        ) : (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <StatusRow label="Ayrshare API key" ok={!!statusQ.data?.ayrshare.api_key} />
            <StatusRow label="Ayrshare white-label domain" ok={!!statusQ.data?.ayrshare.domain} />
            <StatusRow
              label="Ayrshare webhook secret"
              ok={!!statusQ.data?.ayrshare.webhook_secret}
            />
            <StatusRow
              label="Ayrshare private key (white-label)"
              ok={!!statusQ.data?.ayrshare.white_label_private_key}
            />
            <StatusRow label="App base URL" ok={!!statusQ.data?.app.base_url} />
            <StatusRow label="Lovable AI Gateway" ok={!!statusQ.data?.lovable.ai_gateway} />
          </div>
        )}
      </div>
    </div>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-elevated/40 px-3 py-2 text-sm">
      <span className="text-foreground">{label}</span>
      {ok ? (
        <span className="inline-flex items-center gap-1 text-emerald-300">
          <CheckCircle2 className="h-4 w-4" /> Configured
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <XCircle className="h-4 w-4" /> Missing
        </span>
      )}
    </div>
  );
}
