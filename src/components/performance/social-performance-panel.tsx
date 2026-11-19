import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { OceanDisclosure, OceanPanel, OceanStatus } from "@/components/app/ocean-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSocialConnections } from "@/hooks/use-content";
import { formatAnalyticsPlatform } from "@/lib/analytics-transparency";
import { livePlatformLabel, toProviderPlatform } from "@/lib/live-posts";
import { SOCIAL_ANALYTICS_RANGES, type SocialAnalyticsRangeDays } from "@/lib/social-metrics-contract";
import { ENGAGEMENT_COMPONENTS, type CopyPerformance } from "@/lib/social-performance";
import { confirmSocialLead, listSocialLeads } from "@/lib/social-performance.functions";
import { formatFreshness, METRIC_LABELS, MetricValue, RollupTile } from "./metric-value";
import { useSocialPerformance } from "./use-social-performance";

const CONTENT_FILTERS = [
  { value: "", label: "All content" },
  { value: "post", label: "Posts" },
  { value: "carousel", label: "Carousels" },
  { value: "stories_reels", label: "Stories & Reels" },
  { value: "story", label: "Stories" },
  { value: "reel", label: "Reels" },
  { value: "video", label: "Videos" },
] as const;

const selectClass = "min-h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground";

export function RangeSelector({ value, onChange }: { value: SocialAnalyticsRangeDays; onChange: (d: SocialAnalyticsRangeDays) => void }) {
  return (
    <div role="group" aria-label="Time range" className="grid grid-cols-5 gap-1 rounded-xl border border-border/70 p-1 sm:w-fit">
      {SOCIAL_ANALYTICS_RANGES.map((d) => (
        <Button key={d} type="button" size="sm" variant={value === d ? "secondary" : "ghost"} className="min-h-10" aria-pressed={value === d} onClick={() => onChange(d)}>
          {d === 365 ? "1y" : `${d}d`}
        </Button>
      ))}
    </div>
  );
}

function CopyRow({ copy, metric }: { copy: CopyPerformance; metric: string | null }) {
  const m = metric ? copy.metrics[metric as keyof CopyPerformance["metrics"]] : null;
  return (
    <li className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm">
      <span className="min-w-0 truncate">
        {livePlatformLabel(copy.platform)} {copy.contentType} · {copy.publishedOn}
      </span>
      {m && <MetricValue value={m.value} availability={m.availability} className="text-sm" />}
    </li>
  );
}

export function SocialPerformancePanel({ workspaceId }: { workspaceId: string }) {
  const [days, setDays] = useState<SocialAnalyticsRangeDays>(30);
  const [account, setAccount] = useState("");
  const [contentType, setContentType] = useState("");
  const connections = useSocialConnections(workspaceId);
  const [platform, accountId] = account ? account.split("::") : [null, null];
  const perf = useSocialPerformance({
    workspaceId,
    days,
    platform,
    accountId,
    contentType: (contentType || null) as never,
  });
  const accounts = useMemo(
    () =>
      (connections.data ?? [])
        .filter((c) => c.provider === "zernio" && c.provider_account_id)
        .map((c) => ({
          key: `${toProviderPlatform(c.platform)}::${c.provider_account_id}`,
          label: `${formatAnalyticsPlatform(c.platform)} · ${c.display_name || c.username || "account"}`,
        })),
    [connections.data],
  );
  const p = perf.data?.current;

  return (
    <OceanPanel
      eyebrow="Stored post performance"
      title="Post, Story & Reel performance"
      description="Provider-reported numbers stored per published copy. Cross-posted copies are counted separately and never twice."
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <RangeSelector value={days} onChange={setDays} />
        <select aria-label="Connected account" className={selectClass} value={account} onChange={(e) => setAccount(e.target.value)}>
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.key} value={a.key}>{a.label}</option>
          ))}
        </select>
        <select aria-label="Content type" className={selectClass} value={contentType} onChange={(e) => setContentType(e.target.value)}>
          {CONTENT_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {perf.isPending && <p className="mt-4 text-sm text-muted-foreground">Loading stored performance…</p>}
      {perf.error && <p className="mt-4 text-sm text-muted-foreground">Stored performance couldn't be loaded. The live view above is still current.</p>}
      {p && (
        <div className="mt-4 space-y-5">
          <p className="text-xs text-muted-foreground">
            {p.period.start} – {p.period.end} · Source: {p.sourceReferences.join(", ") || "none yet"} · Last sync {formatFreshness(p.freshestCapture)} · {p.copyCount} post copies
          </p>
          {!perf.data?.storageReady || !p.hasStoredData ? (
            <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">No stored post history for this period yet.</p>
              <p className="mt-1">
                Numbers are saved each time Published Posts loads from your connected accounts. Until then, the live provider view above stays the source.
              </p>
              <Link to="/social" className="mt-3 inline-flex min-h-11 items-center font-semibold text-primary">Open Published Posts</Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {(["views", "reach", "impressions", "saves", "shares"] as const).map((k) => (
                  <RollupTile key={k} label={METRIC_LABELS[k]!} rollup={p.metrics[k]!} />
                ))}
              </div>
              <div className="rounded-xl border border-border/70 p-3">
                <p className="text-xs font-medium text-muted-foreground">Engagement ({p.engagement.components.join(" + ") || ENGAGEMENT_COMPONENTS.join(" + ")})</p>
                <MetricValue value={p.engagement.value} availability={p.engagement.availability} className="mt-1 block" />
              </div>

              <section aria-label="Lead actions" className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Lead actions</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <RollupTile label="Link clicks" rollup={p.leadActions.clicks} />
                  <RollupTile label="DM / message starts" rollup={p.leadActions.messages} />
                  <div className="rounded-xl border border-border/70 bg-card/40 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Combined interactions</p>
                    <MetricValue value={p.leadActions.combined} availability={p.leadActions.clicks.availability} className="mt-1 block" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{p.leadActions.note}</p>
              </section>

              {(p.best.length > 0 || p.evidenceGaps.length > 0) && (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Best-performing by {p.rankingMetric ?? "—"}</h3>
                    {p.best.length ? (
                      <ul className="mt-2 space-y-1">{p.best.map((c) => <CopyRow key={c.copyKey} copy={c} metric={p.rankingMetric} />)}</ul>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">{p.evidenceGaps[0]}</p>
                    )}
                  </div>
                  {p.needsAttention.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Needs attention</h3>
                      <p className="text-xs text-muted-foreground">Lowest {p.rankingMetric} among comparable copies; this doesn't explain why.</p>
                      <ul className="mt-2 space-y-1">{p.needsAttention.map((c) => <CopyRow key={c.copyKey} copy={c} metric={p.rankingMetric} />)}</ul>
                    </div>
                  )}
                </div>
              )}
              {p.recommendations.map((r) => (
                <p key={r} className="rounded-xl border border-border/70 p-3 text-sm text-foreground">{r}</p>
              ))}
            </>
          )}

          <ConfirmedLeads workspaceId={workspaceId} count={p.confirmedLeads.count} note={p.confirmedLeads.note} />

          <OceanDisclosure summary={`History & sync health${p.backfill.problems.length ? ` · ${p.backfill.problems.length} need attention` : ""}`}>
            <p className="text-sm text-muted-foreground">
              Up to 365 days of provider-supported history. Available from {p.backfill.availableRangeStart ?? "—"} · last success {formatFreshness(p.backfill.lastSuccessAt)}.
            </p>
            <ul className="mt-3 space-y-2">
              {p.backfill.accounts.map((run) => (
                <li key={`${run.platform}:${run.provider_account_id}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{livePlatformLabel(run.platform)}</span>
                  <OceanStatus tone={run.status === "complete" ? "positive" : run.status === "partial" ? "neutral" : "warning"}>{run.status}</OceanStatus>
                  {run.safe_message && <span className="w-full text-xs text-muted-foreground">{run.safe_message}</span>}
                </li>
              ))}
              {!p.backfill.accounts.length && <li className="text-sm text-muted-foreground">No history has been loaded yet.</li>}
            </ul>
            {p.backfill.problems.length > 0 && (
              <Link to="/social-accounts" className="mt-3 inline-flex min-h-11 items-center font-semibold text-primary">Reconnect accounts</Link>
            )}
          </OceanDisclosure>
        </div>
      )}
    </OceanPanel>
  );
}

function ConfirmedLeads({ workspaceId, count, note }: { workspaceId: string; count: number; note: string }) {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listSocialLeads);
  const confirmFn = useServerFn(confirmSocialLead);
  const leads = useQuery({ queryKey: ["social-leads", workspaceId], queryFn: () => listFn({ data: { workspaceId } }) });
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const save = useMutation({
    mutationFn: () => confirmFn({ data: { workspaceId, name: form.name || undefined, email: form.email || undefined, phone: form.phone || undefined } }),
    onSuccess: (r) => {
      toast.success(r.duplicate ? "This person was already confirmed — counted once." : "Lead confirmed.");
      setForm({ name: "", email: "", phone: "" });
      void queryClient.invalidateQueries({ queryKey: ["social-leads", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["social-performance", workspaceId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't confirm this lead."),
  });
  return (
    <OceanDisclosure summary={`Confirmed leads · ${count} in this period`}>
      <p className="text-sm text-muted-foreground">{note} Workspace managers can add one when a real person becomes a lead.</p>
      <form
        className="mt-3 grid gap-2 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Input aria-label="Lead name" placeholder="Name (optional)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="min-h-11" />
        <Input aria-label="Lead email" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="min-h-11" />
        <Input aria-label="Lead phone" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="min-h-11" />
        <Button type="submit" className="min-h-11" disabled={save.isPending || (!form.email && !form.phone)}>Confirm lead</Button>
      </form>
      <ul className="mt-3 space-y-1 text-sm">
        {(leads.data?.leads ?? []).slice(0, 10).map((l) => (
          <li key={l.id} className="flex justify-between gap-2 text-muted-foreground">
            <span>{l.metadata?.name || "Confirmed lead"}{l.platform ? ` · ${livePlatformLabel(l.platform)}` : ""}</span>
            <span>{new Date(l.confirmed_at).toLocaleDateString()}</span>
          </li>
        ))}
        {leads.data && !leads.data.storageReady && <li className="text-muted-foreground">Lead storage isn't set up yet.</li>}
      </ul>
    </OceanDisclosure>
  );
}
