import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  CheckCircle2,
  Copy,
  Loader2,
  MailPlus,
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
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const staffQ = useQuery({
    queryKey: ["admin", "staff"],
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("id,user_id,role,created_at")
        .in("role", ["dream_wave_owner", "dream_wave_team"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      const userIds = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,first_name,last_name")
        .in("id", userIds);
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      return (roles ?? []).map((r) => ({
        ...r,
        profile: byId.get(r.user_id) ?? null,
      }));
    },
  });

  const invitesQ = useQuery({
    queryKey: ["admin", "staff-invites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invites_admin")
        .select("id,email,status,expires_at,created_at,resend_count")
        .is("workspace_id", null)
        .eq("app_role", "dream_wave_team")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invite = useMutation({
    mutationFn: async (targetEmail: string) => {
      const clean = targetEmail.trim().toLowerCase();
      if (!clean) throw new Error("Enter an email.");
      // Generated types update after the accompanying migration is deployed.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("create_staff_invite", {
        _email: clean,
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
          Invite employees by email and manage Dream Wave Team access. Staff accounts are separate
          from client workspaces. The protected Owner role can never be granted through the app.
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
            invite.mutate(email);
          }}
          className="mt-3 flex gap-2"
        >
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="employee@dreamwavemedia.co"
            className="flex-1 rounded-lg border border-input bg-surface/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
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
                    {item.status} · expires{" "}
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
              <li key={s.id} className="flex items-center justify-between px-5 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {s.profile
                      ? `${s.profile.first_name ?? ""} ${s.profile.last_name ?? ""}`.trim() ||
                        s.user_id
                      : s.user_id}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-mono">{s.user_id}</span>
                  </div>
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
                    {s.role === "dream_wave_owner" ? "Owner" : "Team"}
                  </span>
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
