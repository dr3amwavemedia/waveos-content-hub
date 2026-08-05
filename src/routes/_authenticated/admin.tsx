import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  CheckCircle2,
  Copy,
  Loader2,
  MailPlus,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  UserMinus,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/app/empty-state";
import { getIntegrationStatus } from "@/lib/ayrshare.functions";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];
type StaffType = "sales" | "media_manager";
type StaffPosition = StaffType | "admin";

const STAFF_TYPE_LABEL: Record<StaffType, string> = {
  sales: "Sales",
  media_manager: "Media Manager",
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
  const [email, setEmail] = useState("");
  const [staffType, setStaffType] = useState<StaffType>("sales");
  const [inviteLink, setInviteLink] = useState<string | null>(null);

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
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
          Dream Wave Media
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Staff
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Invite employees by email and manage Dream Wave Team access. After an invitation is
          accepted, an Admin can change that person between Admin, Sales, and Media Manager. WaveOS
          always protects the final remaining Admin.
        </p>
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
            <option value="media_manager">Media Manager</option>
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
            {staffQ.data!.map((s) => (
              <li
                key={`${s.user_id}-${s.role}`}
                className="flex items-center justify-between px-5 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {`${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() ||
                      s.email ||
                      "Staff member"}
                  </div>
                  {s.email && (
                    <div className="truncate text-xs text-muted-foreground">{s.email}</div>
                  )}
                </div>
                <div className="flex items-center gap-3">
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
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                    aria-label={`Staff position for ${s.email ?? s.user_id}`}
                  >
                    <option value="admin">Admin</option>
                    <option value="sales">Sales</option>
                    <option value="media_manager">Media Manager</option>
                  </select>
                  {s.email && (
                    <button
                      onClick={() => sendPasswordReset.mutate(s.email!)}
                      disabled={sendPasswordReset.isPending}
                      className="rounded-md p-1.5 text-primary hover:bg-primary/15 disabled:opacity-50"
                      title={`Send password reset to ${s.email}`}
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                  )}
                  {s.role === "dream_wave_team" && (
                    <button
                      onClick={() => revoke.mutate({ userId: s.user_id, role: "dream_wave_team" })}
                      className="rounded-md p-1.5 text-destructive hover:bg-destructive/15"
                      title="Revoke staff role"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
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
