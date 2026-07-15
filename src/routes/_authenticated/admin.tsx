import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, UserMinus, UserPlus, XCircle } from "lucide-react";
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
      .from("user_roles").select("role").eq("user_id", data.user.id);
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

  const grant = useMutation({
    mutationFn: async (targetEmail: string) => {
      // Look up user via profiles/auth is not directly possible; require the
      // person to already have a profile (i.e. signed up once).
      const clean = targetEmail.trim().toLowerCase();
      if (!clean) throw new Error("Enter an email.");
      // Use RPC to resolve — we don't expose auth.users to authenticated. So the
      // owner is expected to paste the user's UUID for now; email → uuid resolution
      // requires an admin serverFn we'll add in Phase 3.
      // For the MVP we accept either email OR uuid, but only uuid works client-side.
      // If not a uuid, guide the owner.
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);
      if (!isUuid) {
        throw new Error(
          "Paste the user's UUID (from their profile). Email→UUID lookup will be added when the admin server function ships.",
        );
      }
      const { error } = await supabase.rpc("grant_staff_role", {
        _target_user: clean,
        _role: "dream_wave_team" as AppRole,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setEmail("");
      qc.invalidateQueries({ queryKey: ["admin", "staff"] });
      toast.success("Staff role granted.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  const revoke = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase.rpc("revoke_staff_role", {
        _target_user: userId, _role: role,
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
          Staff & permissions
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Only Dream Wave Owners can promote team members. The Owner role can never
          be granted through the app — it's reserved for the original founder and
          protected against demotion.
        </p>
      </header>

      <div className="surface-card p-5">
        <h2 className="text-sm font-semibold text-foreground">Promote a user to Dream Wave Team</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          The user must sign in at least once before you can promote them.
        </p>
        <form
          onSubmit={(e) => { e.preventDefault(); grant.mutate(email); }}
          className="mt-3 flex gap-2"
        >
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="User UUID (from their profile)"
            className="flex-1 rounded-lg border border-input bg-surface/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <button
            type="submit"
            disabled={grant.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-60"
          >
            {grant.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Grant staff role
          </button>
        </form>
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
                      ? `${s.profile.first_name ?? ""} ${s.profile.last_name ?? ""}`.trim() || s.user_id
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
            <StatusRow label="Ayrshare webhook secret" ok={!!statusQ.data?.ayrshare.webhook_secret} />
            <StatusRow label="Ayrshare private key (white-label)" ok={!!statusQ.data?.ayrshare.white_label_private_key} />
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
