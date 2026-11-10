import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Copy,
  Database,
  Gift,
  Loader2,
  PauseCircle,
  PlayCircle,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { OsDataPanel } from "@/routes/_authenticated/clients";
import { supabase } from "@/integrations/supabase/client";
import {
  createComplimentaryAccessCode,
  getOsOperationsStatus,
  listComplimentaryAccessCodes,
  revokeComplimentaryAccessGrant,
  setComplimentaryAccessCodeActive,
  setGlobalPublishingPause,
  type ComplimentaryPlan,
} from "@/lib/os-accounts.functions";

export const Route = createFileRoute("/_authenticated/os-data")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const isOwner = (roles ?? []).some((role) => role.role === "dream_wave_owner");
    if (!isOwner) throw redirect({ to: "/home" });
  },
  component: OsDataPage,
  head: () => ({
    meta: [{ title: "OS Data — WaveOS" }, { name: "robots", content: "noindex" }],
  }),
});

function OsDataPage() {
  const [search, setSearch] = useState("");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-violet-300">
            WaveOS public app
          </p>
          <h1 className="mt-1 flex items-center gap-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            <Database className="h-8 w-8 text-violet-300" /> OS Data
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Manage public sign-up users, account information, password resets, plan and payment
            access, and promotional codes without mixing them into Dream Wave Media clients.
          </p>
        </div>
        <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-200">
          Owner access only
        </span>
      </header>

      <div className="relative max-w-xl">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search OS users by name or email…"
          aria-label="Search OS users"
          className="h-11 w-full rounded-xl border border-border bg-surface pl-11 pr-10 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Clear OS user search"
            className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-elevated hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <ComplimentaryAccessPanel />
      <OperationsSafetyPanel />

      <OsDataPanel search={search} />
    </div>
  );
}

function ComplimentaryAccessPanel() {
  const listCodes = useServerFn(listComplimentaryAccessCodes);
  const createCode = useServerFn(createComplimentaryAccessCode);
  const setCodeActive = useServerFn(setComplimentaryAccessCodeActive);
  const revokeGrant = useServerFn(revokeComplimentaryAccessGrant);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [plan, setPlan] = useState<ComplimentaryPlan>("standard");
  const [maxRedemptions, setMaxRedemptions] = useState(1);
  const [expiresAt, setExpiresAt] = useState("");
  const [accessEndsAt, setAccessEndsAt] = useState("");
  const [eligibleEmail, setEligibleEmail] = useState("");
  const [eligibleDomain, setEligibleDomain] = useState("");
  const [newCode, setNewCode] = useState<string | null>(null);
  const codes = useQuery({
    queryKey: ["complimentary-access-codes"],
    queryFn: () => listCodes({ data: {} }),
    enabled: open,
  });
  const create = useMutation({
    mutationFn: () =>
      createCode({
        data: {
          label,
          plan,
          maxRedemptions,
          expiresAt: expiresAt || null,
          accessEndsAt: accessEndsAt || null,
          eligibleEmail: eligibleEmail || null,
          eligibleEmailDomain: eligibleDomain || null,
        },
      }),
    onSuccess: (result) => {
      setNewCode(result.code);
      setLabel("");
      setPlan("standard");
      setMaxRedemptions(1);
      setExpiresAt("");
      setAccessEndsAt("");
      setEligibleEmail("");
      setEligibleDomain("");
      void codes.refetch();
      toast.success("Complimentary access code created. Copy it now—it is shown once.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Complimentary code could not be created.",
      ),
  });
  const toggle = useMutation({
    mutationFn: (input: { codeId: string; active: boolean }) => setCodeActive({ data: input }),
    onSuccess: () => void codes.refetch(),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Code update failed."),
  });
  const revoke = useMutation({
    mutationFn: (grantId: string) =>
      revokeGrant({ data: { grantId, reason: "Revoked by owner from OS Data." } }),
    onSuccess: () => {
      void codes.refetch();
      toast.success("Complimentary access revoked. The workspace data remains saved.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Grant revocation failed."),
  });

  const planLabel = (value: ComplimentaryPlan) =>
    value === "standard" ? "Ripple" : value === "full" ? "Current" : "Tidal";

  return (
    <section className="rounded-2xl border border-emerald-400/25 bg-emerald-500/5 p-4 sm:p-5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 text-left"
        aria-expanded={open}
      >
        <span>
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Gift className="h-4 w-4 text-emerald-300" /> Complimentary WaveOS access
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            Create secure payment-waiver codes, control future use, and review every grant. This is
            not a trial or Stripe coupon.
          </span>
        </span>
        <span className="shrink-0 rounded-full border border-emerald-400/30 px-3 py-1 text-[10px] font-bold uppercase text-emerald-300">
          Owner only
        </span>
      </button>
      {open && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          {newCode && (
            <div className="rounded-xl border border-emerald-400/35 bg-emerald-500/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">
                Copy this code now — it will not be shown again
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="flex-1 break-all rounded-lg bg-background px-3 py-2 text-sm text-foreground">
                  {newCode}
                </code>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(newCode);
                    toast.success("Code copied.");
                  }}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-400/30 px-4 text-sm font-semibold"
                >
                  <Copy className="h-4 w-4" /> Copy
                </button>
                <button
                  type="button"
                  onClick={() => setNewCode(null)}
                  className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold"
                >
                  Done
                </button>
              </div>
            </div>
          )}
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (label.trim()) create.mutate();
            }}
          >
            <label className="sm:col-span-2">
              <span className="text-xs font-medium text-muted-foreground">Internal label</span>
              <input
                required
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Creator partner access"
                className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </label>
            <label>
              <span className="text-xs font-medium text-muted-foreground">WaveOS tier</span>
              <select
                value={plan}
                onChange={(event) => setPlan(event.target.value as ComplimentaryPlan)}
                className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              >
                <option value="standard">Ripple</option>
                <option value="full">Current</option>
                <option value="expanded">Tidal</option>
              </select>
            </label>
            <label>
              <span className="text-xs font-medium text-muted-foreground">Maximum redemptions</span>
              <input
                type="number"
                min={1}
                max={100000}
                value={maxRedemptions}
                onChange={(event) => setMaxRedemptions(Number(event.target.value))}
                className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </label>
            <label>
              <span className="text-xs font-medium text-muted-foreground">
                Code expires (optional)
              </span>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </label>
            <label>
              <span className="text-xs font-medium text-muted-foreground">
                Access ends (optional)
              </span>
              <input
                type="datetime-local"
                value={accessEndsAt}
                onChange={(event) => setAccessEndsAt(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </label>
            <label>
              <span className="text-xs font-medium text-muted-foreground">
                Eligible email (optional)
              </span>
              <input
                type="email"
                value={eligibleEmail}
                onChange={(event) => setEligibleEmail(event.target.value)}
                disabled={Boolean(eligibleDomain)}
                placeholder="person@company.com"
                className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm disabled:opacity-50"
              />
            </label>
            <label>
              <span className="text-xs font-medium text-muted-foreground">
                Eligible domain (optional)
              </span>
              <input
                value={eligibleDomain}
                onChange={(event) => setEligibleDomain(event.target.value)}
                disabled={Boolean(eligibleEmail)}
                placeholder="company.com"
                className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm disabled:opacity-50"
              />
            </label>
            <div className="flex items-center justify-between gap-3 sm:col-span-2">
              <p className="text-xs text-muted-foreground">
                Codes are securely generated and stored only as a hash.
              </p>
              <button
                type="submit"
                disabled={create.isPending || !label.trim()}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 disabled:opacity-50"
              >
                {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create code
              </button>
            </div>
          </form>

          <div className="space-y-3 border-t border-border pt-4">
            {codes.isLoading ? (
              <p className="text-xs text-muted-foreground">Loading complimentary codes…</p>
            ) : (codes.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No complimentary codes created yet.</p>
            ) : (
              codes.data!.map((code) => (
                <article
                  key={code.id}
                  className="rounded-xl border border-border bg-background/60 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{code.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {planLabel(code.plan)} · ends in …{code.code_hint} · {code.redemption_count}
                        /{code.max_redemptions} used
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate({ codeId: code.id, active: !code.is_active })}
                      className="min-h-9 rounded-lg border border-border px-3 text-xs font-semibold"
                    >
                      {code.is_active ? "Pause future use" : "Resume code"}
                    </button>
                  </div>
                  {code.grants.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      {code.grants.map((grant) => (
                        <div
                          key={grant.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <span className="text-muted-foreground">
                            <strong className="text-foreground">{grant.email}</strong> ·{" "}
                            {grant.status} · {new Date(grant.granted_at).toLocaleDateString()}
                          </span>
                          {grant.status === "active" && (
                            <button
                              type="button"
                              disabled={revoke.isPending}
                              onClick={() => revoke.mutate(grant.id)}
                              className="min-h-9 rounded-lg border border-rose-400/30 px-3 font-semibold text-rose-200"
                            >
                              Revoke access
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function OperationsSafetyPanel() {
  const getStatus = useServerFn(getOsOperationsStatus);
  const setPause = useServerFn(setGlobalPublishingPause);
  const status = useQuery({
    queryKey: ["os-operations-status"],
    queryFn: () => getStatus({ data: {} }),
    refetchInterval: 60_000,
  });
  const pause = useMutation({
    mutationFn: (paused: boolean) =>
      setPause({
        data: {
          paused,
          reason: paused
            ? "Publishing was paused from OS Data by the Dream Wave owner."
            : undefined,
        },
      }),
    onSuccess: async (result) => {
      await status.refetch();
      toast.success(result.paused ? "Publishing paused globally." : "Publishing resumed.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Control update failed."),
  });
  const paused = status.data?.globalPause?.paused === true;
  const lifecycle = status.data?.lifecycle ?? {};
  return (
    <section className="rounded-2xl border border-violet-400/20 bg-violet-500/5 p-4 sm:p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-violet-300" /> Publishing safety & lifecycle
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {status.data?.stalePublishingAttempts ?? 0} stale publishes · {lifecycle.grace ?? 0} in
            grace · {lifecycle.retention ?? 0} retained · {lifecycle.error ?? 0} errors
          </p>
        </div>
        <button
          type="button"
          disabled={pause.isPending || status.isLoading}
          onClick={() => pause.mutate(!paused)}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50 ${paused ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400" : "border border-amber-400/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20"}`}
        >
          {paused ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
          {paused ? "Resume all publishing" : "Emergency pause"}
        </button>
      </div>
    </section>
  );
}
