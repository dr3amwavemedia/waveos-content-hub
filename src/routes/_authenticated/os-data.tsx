import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Database, Gift, Loader2, Mail, PauseCircle, PlayCircle, Search, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

import { OsDataPanel } from "@/routes/_authenticated/clients";
import { supabase } from "@/integrations/supabase/client";
import { getOsOperationsStatus, inviteComplimentaryOsAccount, setGlobalPublishingPause } from "@/lib/os-accounts.functions";

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
  const inviteFn = useServerFn(inviteComplimentaryOsAccount);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [plan, setPlan] = useState<"standard" | "full" | "expanded">("standard");
  const invite = useMutation({
    mutationFn: () =>
      inviteFn({ data: { email, firstName, lastName, workspaceName, plan } }),
    onSuccess: (result) => {
      toast.success(`Complimentary ${result.plan === "standard" ? "Ripple" : result.plan === "full" ? "Current" : "Tidal"} invitation sent to ${result.email}.`);
      setEmail("");
      setFirstName("");
      setLastName("");
      setWorkspaceName("");
      setPlan("standard");
      setOpen(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Complimentary invite could not be sent."),
  });

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
            Invite a new user with a selected tier and no card requirement. Existing paid accounts are protected from this flow.
          </span>
        </span>
        <span className="shrink-0 rounded-full border border-emerald-400/30 px-3 py-1 text-[10px] font-bold uppercase text-emerald-300">
          Owner only
        </span>
      </button>
      {open && (
        <form
          className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!email.trim()) return;
            invite.mutate();
          }}
        >
          <label className="sm:col-span-2">
            <span className="text-xs font-medium text-muted-foreground">Email</span>
            <div className="relative mt-1">
              <Mail className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="person@company.com"
                className="min-h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
              />
            </div>
          </label>
          <label>
            <span className="text-xs font-medium text-muted-foreground">First name</span>
            <input value={firstName} onChange={(event)=>setFirstName(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" />
          </label>
          <label>
            <span className="text-xs font-medium text-muted-foreground">Last name</span>
            <input value={lastName} onChange={(event)=>setLastName(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" />
          </label>
          <label>
            <span className="text-xs font-medium text-muted-foreground">Workspace / business name</span>
            <input value={workspaceName} onChange={(event)=>setWorkspaceName(event.target.value)} placeholder="Optional" className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" />
          </label>
          <label>
            <span className="text-xs font-medium text-muted-foreground">Complimentary tier</span>
            <select value={plan} onChange={(event)=>setPlan(event.target.value as "standard"|"full"|"expanded")} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">
              <option value="standard">Ripple</option>
              <option value="full">Current</option>
              <option value="expanded">Tidal</option>
            </select>
          </label>
          <div className="sm:col-span-2 rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3 text-xs text-muted-foreground">
            <strong className="text-foreground">No credit card:</strong> this invitation uses WaveOS internal complimentary access and does not create a Stripe subscription. The user receives an email invite and sets their password/profile on their end.
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button type="button" onClick={()=>setOpen(false)} className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">Cancel</button>
            <button type="submit" disabled={invite.isPending || !email.trim()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 disabled:opacity-50">
              {invite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Send complimentary invite
            </button>
          </div>
        </form>
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
