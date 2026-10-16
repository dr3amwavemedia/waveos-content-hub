import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CheckCircle2,
  Eye,
  Loader2,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
  Sparkles,
  Target,
  ArrowRight,
  Globe2,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { RequireFeature } from "@/components/app/require-feature";
import { UnsavedChangesGuard } from "@/components/app/unsaved-changes-guard";
import { useWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkflowDraft } from "@/hooks/use-workflow-draft";
import { supabase } from "@/integrations/supabase/client";
import {
  scoreCompetitiveMetrics,
  type CompetitiveMetric,
  type MetricDirection,
} from "@/lib/phase-one-planning";
import { isValidHttpsUrl, normalizeHttpsUrl } from "@/lib/url-validation";

export const Route = createFileRoute("/_authenticated/competitive-intelligence")({
  component: () => (
    <RequireFeature
      feature="can_use_competitive_intelligence"
      title="Competitive Intelligence isn't included in this plan"
      description="Competitor research is available with Current, Tidal, Full Retainer, and Social Management access."
    >
      <CompetitiveIntelligencePage />
    </RequireFeature>
  ),
  head: () => ({
    meta: [
      { title: "Competitive Intelligence — WaveOS" },
      {
        name: "description",
        content:
          "Research competitors from a public website or social profile, with optional documented manual comparisons.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const db = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

interface CompetitorRow {
  id: string;
  name: string;
  website_url: string | null;
  social_handles: Record<string, unknown>;
  notes: string | null;
  created_at: string;
}

interface ReportRow {
  id: string;
  competitor_id: string;
  title: string;
  score: number | null;
  confidence: number | null;
  created_at: string;
}

interface CompetitiveDraft {
  selectedCompetitorId: string | null;
  competitorName: string;
  websiteUrl: string;
  observationLinks: string;
  notes: string;
  reportTitle: string;
  metrics: CompetitiveMetric[];
}

function blankMetric(label = ""): CompetitiveMetric {
  return {
    label,
    yourValue: null,
    competitorValue: null,
    unit: "",
    direction: "higher",
    sourceNote: "",
    observedAt: new Date().toISOString().slice(0, 10),
  };
}

const DEFAULT_DRAFT: CompetitiveDraft = {
  selectedCompetitorId: null,
  competitorName: "",
  websiteUrl: "",
  observationLinks: "",
  notes: "",
  reportTitle: "Manual comparison",
  metrics: [
    blankMetric("Posts per week"),
    blankMetric("Average engagement"),
    blankMetric("Response time"),
  ],
};

const METHOD =
  "WaveOS-defined manual comparison. For higher-is-better metrics, score = your value / (your value + competitor value) × 100. For lower-is-better metrics, the values are reversed. Available metric scores are equally weighted; two documented metrics are required. No platform scraping or inferred private data is used.";

function CompetitiveIntelligencePage() {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<CompetitiveDraft>(DEFAULT_DRAFT);
  const [dirty, setDirty] = useState(false);
  const [screen, setScreen] = useState<"overview" | "editor">("overview");
  const [researchInput, setResearchInput] = useState("");
  const [showManual, setShowManual] = useState(false);
  const workflowDraft = useWorkflowDraft<CompetitiveDraft>({
    workspaceId,
    workflowKey: "competitive-intelligence",
  });

  const competitors = useQuery({
    queryKey: ["competitors", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await db
        .from("competitors")
        .select("id,name,website_url,social_handles,notes,created_at")
        .eq("workspace_id", workspaceId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as CompetitorRow[];
    },
  });

  const reports = useQuery({
    queryKey: ["competitive-reports", workspaceId, draft.selectedCompetitorId],
    enabled: Boolean(workspaceId && draft.selectedCompetitorId),
    queryFn: async () => {
      const { data, error } = await db
        .from("competitive_reports")
        .select("id,competitor_id,title,score,confidence,created_at")
        .eq("workspace_id", workspaceId!)
        .eq("competitor_id", draft.selectedCompetitorId!)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as ReportRow[];
    },
  });

  const result = useMemo(() => scoreCompetitiveMetrics(draft.metrics), [draft.metrics]);

  const saveReport = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("Select a workspace first.");
      if (!draft.competitorName.trim()) throw new Error("Add a competitor name.");
      if (draft.websiteUrl.trim() && !isValidHttpsUrl(normalizeHttpsUrl(draft.websiteUrl))) {
        throw new Error("Use a valid HTTPS website URL or leave it blank.");
      }
      if (result.score === null) throw new Error("Add values for at least two comparable metrics.");
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw authError ?? new Error("Sign in to save this report.");

      let competitorId = draft.selectedCompetitorId;
      const competitorPayload = {
        name: draft.competitorName.trim(),
        website_url: draft.websiteUrl.trim() ? normalizeHttpsUrl(draft.websiteUrl) : null,
        social_handles: { observation_links: draft.observationLinks.trim() },
        notes: draft.notes.trim() || null,
      };
      if (competitorId) {
        const { error } = await db
          .from("competitors")
          .update(competitorPayload)
          .eq("id", competitorId)
          .eq("workspace_id", workspaceId);
        if (error) throw error;
      } else {
        const { data, error } = await db
          .from("competitors")
          .insert({
            workspace_id: workspaceId,
            created_by: auth.user.id,
            ...competitorPayload,
          })
          .select("id")
          .single();
        if (error) throw error;
        competitorId = data.id as string;
      }

      const confidence =
        result.confidence === "high"
          ? 0.9
          : result.confidence === "medium"
            ? 0.65
            : result.confidence === "low"
              ? 0.35
              : null;
      const { error: reportError } = await db.from("competitive_reports").insert({
        workspace_id: workspaceId,
        competitor_id: competitorId,
        created_by: auth.user.id,
        title: draft.reportTitle.trim() || "Manual comparison",
        metrics: draft.metrics,
        score: result.score,
        confidence,
        methodology: METHOD,
      });
      if (reportError) throw reportError;
      return competitorId!;
    },
    onSuccess: async (competitorId) => {
      setDraft((current) => ({ ...current, selectedCompetitorId: competitorId }));
      setDirty(false);
      await workflowDraft.discard.mutateAsync();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["competitors", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["competitive-reports", workspaceId] }),
      ]);
      toast.success("Manual comparison saved with its source notes.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Comparison could not be saved."),
  });

  function update<K extends keyof CompetitiveDraft>(key: K, value: CompetitiveDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  function updateMetric(index: number, patch: Partial<CompetitiveMetric>) {
    update(
      "metrics",
      draft.metrics.map((metric, metricIndex) =>
        metricIndex === index ? { ...metric, ...patch } : metric,
      ),
    );
  }

  function selectCompetitor(id: string) {
    const competitor = competitors.data?.find((item) => item.id === id);
    if (!competitor) return;
    setDraft({
      ...DEFAULT_DRAFT,
      selectedCompetitorId: competitor.id,
      competitorName: competitor.name,
      websiteUrl: competitor.website_url ?? "",
      observationLinks: String(competitor.social_handles?.observation_links ?? ""),
      notes: competitor.notes ?? "",
      reportTitle: `${competitor.name} manual comparison`,
      metrics: DEFAULT_DRAFT.metrics.map((metric) => ({ ...metric })),
    });
    setDirty(false);
  }

  async function saveServerDraft() {
    try {
      await workflowDraft.save.mutateAsync(draft);
      setDirty(false);
      toast.success("Private server draft saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Draft could not be saved.");
    }
  }

  if (!activeWorkspace) return null;

  if (screen === "overview") {
    const tracked = competitors.data ?? [];
    return (
      <div className="space-y-5 pb-10">
        <header className="flex items-start justify-between gap-4">
          <div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-intelligence"><Sparkles className="h-4 w-4" /> WaveOS Intelligence</div><h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Competitive Intelligence</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Track competitors, compare documented signals, and turn your research into clearer content opportunities.</p></div>
          <Button className="hidden sm:inline-flex" onClick={() => setScreen("editor")}><Plus /> Add observation</Button>
        </header>
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-background/60 p-1 text-xs sm:w-fit">
          <button className="min-h-10 rounded-lg bg-intelligence/15 px-3 font-semibold text-intelligence">Overview</button><button className="min-h-10 rounded-lg px-3 text-muted-foreground" onClick={() => document.getElementById("tracked-competitors")?.scrollIntoView({behavior:"smooth"})}>Competitors</button><button className="min-h-10 rounded-lg px-3 text-muted-foreground" onClick={() => document.getElementById("opportunities")?.scrollIntoView({behavior:"smooth"})}>Opportunities</button>
        </div>
        <section className="rounded-2xl border border-intelligence/30 bg-gradient-to-br from-intelligence/20 via-card to-primary/5 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-intelligence"><Sparkles className="h-4 w-4" /> WaveOS Intelligence</div>
          <h2 className="mt-3 text-xl font-semibold">{tracked.length ? "Your competitive workspace is ready" : "Start building your competitive picture"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{tracked.length ? `${tracked.length} competitor${tracked.length === 1 ? "" : "s"} tracked. Add documented comparisons to surface evidence-backed gaps and opportunities.` : "Add a competitor and record public observations. WaveOS will organize the evidence without scraping accounts or inventing metrics."}</p>
          <Button variant="outline" className="mt-4 border-intelligence/30" onClick={() => setScreen("editor")}>{tracked.length ? "Add observation" : "Add first competitor"} <ArrowRight /></Button>
        </section>
        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4"><div className="text-3xl font-bold text-primary">{tracked.length}</div><div className="mt-1 text-xs text-muted-foreground">Competitors tracked</div></div>
          <div className="rounded-2xl border border-intelligence/20 bg-intelligence/10 p-4"><div className="text-3xl font-bold text-intelligence">{tracked.filter((c) => c.notes || c.website_url).length}</div><div className="mt-1 text-xs text-muted-foreground">With documented context</div></div>
        </section>
        <section id="tracked-competitors" className="surface-card p-4 sm:p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Tracked competitors</p><h2 className="mt-1 text-lg font-semibold">Competitors</h2></div><Button size="sm" variant="outline" onClick={() => setScreen("editor")}><Plus /> Add</Button></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{tracked.map((competitor) => <button key={competitor.id} type="button" onClick={() => {selectCompetitor(competitor.id);setScreen("editor");}} className="rounded-xl border border-border bg-background/50 p-4 text-left hover:border-primary/40"><div className="font-semibold">{competitor.name}</div><div className="mt-1 truncate text-xs text-muted-foreground">{competitor.website_url || "No website added"}</div><div className="mt-3 text-xs text-primary">Open research →</div></button>)}{!competitors.isLoading && !tracked.length && <div className="col-span-full rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No competitors yet. Add your first public observation to begin.</div>}</div></section>
        <section id="opportunities" className="surface-card p-5"><div className="flex items-center gap-2 font-semibold"><Target className="h-4 w-4 text-campaign" /> Opportunities</div><p className="mt-2 text-sm text-muted-foreground">{tracked.length ? "WaveOS only surfaces opportunities from comparisons you document. Open a competitor to add metrics and source notes." : "Opportunities will appear after you document comparable competitor signals."}</p><Button variant="ghost" className="mt-2 px-0 text-intelligence" onClick={() => setScreen("editor")}>Document a comparison <ArrowRight /></Button></section>
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-xs text-muted-foreground">Competitive Intelligence uses only observations you enter and sources you cite. WaveOS does not scrape competitor accounts or fabricate performance data.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <UnsavedChangesGuard dirty={dirty} subject="this comparison" />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <button type="button" onClick={() => setScreen("overview")} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-intelligence"><ArrowRight className="h-4 w-4 rotate-180" /> Competitive overview</button>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Research a competitor</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Paste their website or public social profile and WaveOS will use it as the starting point for competitive research.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void saveServerDraft()}
          disabled={workflowDraft.save.isPending}
        >
          {workflowDraft.save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          Save draft
        </Button>
      </header>

      {workflowDraft.data?.payload && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold">A private server draft is available</div>
            <div className="text-xs text-muted-foreground">
              Last saved {new Date(workflowDraft.data.updated_at).toLocaleString()}.
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraft(workflowDraft.data!.payload);
                setDirty(false);
              }}
            >
              Restore
            </Button>
            <Button size="sm" variant="ghost" onClick={() => workflowDraft.discard.mutate()}>
              Discard
            </Button>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-intelligence/30 bg-gradient-to-br from-intelligence/15 via-card to-primary/5 p-5 sm:p-7">
        <div className="flex items-center gap-2 text-sm font-semibold text-intelligence"><Sparkles className="h-4 w-4" /> WaveOS Intelligence</div>
        <h2 className="mt-3 text-xl font-semibold sm:text-2xl">Find the useful signals without filling out a report</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Start with one public link. Website and social discovery, positioning, services, messaging, content signals, strengths, gaps, and opportunities are the target research outputs.</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <Globe2 className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              className="min-h-14 w-full rounded-xl border border-border bg-background pl-12 pr-4 text-base outline-none focus:border-intelligence focus:ring-2 focus:ring-intelligence/20"
              inputMode="url"
              placeholder="Website or social profile"
              value={researchInput}
              onChange={(event) => setResearchInput(event.target.value)}
            />
          </label>
          <Button
            className="min-h-14 rounded-xl px-6"
            disabled={!researchInput.trim()}
            onClick={() => {
              const value = researchInput.trim();
              const looksLikeWebsite = !value.includes("@") && !/instagram\.com|facebook\.com|tiktok\.com|linkedin\.com|youtube\.com|x\.com/i.test(value);
              if (looksLikeWebsite) update("websiteUrl", value);
              else update("observationLinks", value);
              toast.message("Competitor link captured", { description: "Automated public-source analysis will be connected in the next implementation step. You can add optional details now." });
            }}
          >
            <Search /> Analyze Competitor
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">One input is enough to start. If WaveOS cannot confidently determine something, it should show “Not found” instead of blocking the analysis.</p>
        <button type="button" onClick={() => setShowManual((value) => !value)} className="mt-4 min-h-10 text-sm font-semibold text-intelligence">
          {showManual ? "Hide manual details" : "Add details manually"}
        </button>
      </section>

      <div className={cn(showManual ? "grid" : "hidden", "gap-5 xl:grid-cols-[15rem_minmax(0,1fr)]")}>
        <aside className="surface-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Competitors</h2>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Add competitor"
              onClick={() => {
                setDraft({
                  ...DEFAULT_DRAFT,
                  metrics: DEFAULT_DRAFT.metrics.map((metric) => ({ ...metric })),
                });
                setDirty(false);
              }}
            >
              <Plus />
            </Button>
          </div>
          <div className="mt-3 space-y-1">
            {(competitors.data ?? []).map((competitor) => (
              <button
                key={competitor.id}
                type="button"
                onClick={() => selectCompetitor(competitor.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                  draft.selectedCompetitorId === competitor.id
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:bg-elevated"
                }`}
              >
                {competitor.name}
              </button>
            ))}
            {!competitors.isLoading && !competitors.data?.length && (
              <p className="px-2 py-4 text-xs text-muted-foreground">
                Add your first manual record.
              </p>
            )}
          </div>
        </aside>

        <div className="space-y-5">
          <section className="surface-card space-y-4 p-4 sm:p-6">
            <h2 className="font-semibold">Competitor record</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Competitor name">
                <input
                  className={inputClass}
                  value={draft.competitorName}
                  onChange={(event) => update("competitorName", event.target.value)}
                />
              </Field>
              <Field label="Public website (optional)">
                <input
                  className={inputClass}
                  inputMode="url"
                  placeholder="https://example.com"
                  value={draft.websiteUrl}
                  onChange={(event) => update("websiteUrl", event.target.value)}
                />
              </Field>
            </div>
            <Field
              label="Observation links or public handles"
              hint="One per line; WaveOS will not fetch them"
            >
              <textarea
                className={textareaClass}
                rows={3}
                value={draft.observationLinks}
                onChange={(event) => update("observationLinks", event.target.value)}
              />
            </Field>
            <Field label="Context and caveats">
              <textarea
                className={textareaClass}
                rows={3}
                value={draft.notes}
                onChange={(event) => update("notes", event.target.value)}
              />
            </Field>
          </section>

          <section className="surface-card overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
              <Field label="Report title">
                <input
                  className={inputClass}
                  value={draft.reportTitle}
                  onChange={(event) => update("reportTitle", event.target.value)}
                />
              </Field>
              <Button
                variant="outline"
                onClick={() => update("metrics", [...draft.metrics, blankMetric()])}
              >
                <Plus /> Add metric
              </Button>
            </div>
            <div className="divide-y divide-border">
              {draft.metrics.map((metric, index) => (
                <MetricEditor
                  key={index}
                  metric={metric}
                  onChange={(patch) => updateMetric(index, patch)}
                  onRemove={() =>
                    update(
                      "metrics",
                      draft.metrics.filter((_, metricIndex) => metricIndex !== index),
                    )
                  }
                />
              ))}
            </div>
          </section>

          <section className="grid gap-5 md:grid-cols-[16rem_minmax(0,1fr)]">
            <div className="surface-card p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="h-4 w-4 text-primary" /> WaveOS-defined score
              </div>
              <div className="mt-4 text-5xl font-bold">{result.score ?? "—"}</div>
              <div className="mt-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {result.confidence} confidence · {result.comparedMetrics} metrics
              </div>
              {result.score === null && (
                <p className="mt-3 text-xs text-warning">
                  Enter both values for at least two metrics.
                </p>
              )}
            </div>
            <div className="surface-card p-5">
              <div className="flex items-center gap-2 font-semibold">
                <Eye className="h-4 w-4 text-primary" /> Method and provenance
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{METHOD}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {result.metricScores.map((metric) => (
                  <span
                    key={metric.label}
                    className="rounded-full border border-border px-3 py-1 text-xs"
                  >
                    {metric.label}: {metric.score}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <div className="flex justify-end">
            <Button
              onClick={() => saveReport.mutate()}
              disabled={saveReport.isPending || result.score === null}
            >
              {saveReport.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Save documented report
            </Button>
          </div>

          {draft.selectedCompetitorId && (
            <section className="surface-card p-5">
              <h2 className="font-semibold">Report history</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {(reports.data ?? []).map((report) => (
                  <div key={report.id} className="rounded-lg border border-border p-3">
                    <div className="text-sm font-semibold">{report.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Score {report.score ?? "—"} ·{" "}
                      {new Date(report.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
                {!reports.isLoading && !reports.data?.length && (
                  <p className="text-sm text-muted-foreground">
                    No saved reports for this competitor.
                  </p>
                )}
              </div>
            </section>
          )}

          <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            Only enter observations you are permitted to use. Scores are directional planning aids,
            not verified market share, legal findings, or platform-provided benchmarks.
          </div>
        </div>
      </div>

      {!showManual && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {["Competitor Overview", "Brand & Messaging", "Website & SEO", "Opportunities"].map((label) => (
            <div key={label} className="rounded-2xl border border-border bg-surface/60 p-4">
              <div className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-intelligence" /> {label}</div>
              <p className="mt-2 text-xs text-muted-foreground">Results will populate here after public-source analysis is connected.</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function MetricEditor({
  metric,
  onChange,
  onRemove,
}: {
  metric: CompetitiveMetric;
  onChange: (patch: Partial<CompetitiveMetric>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const commonMetrics = ["Posts per week", "Engagement rate", "Followers", "Response time", "Average views"];
  return (
    <div className="p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_.7fr_.7fr_.7fr_auto]">
        <Field label="Metric">
          <input className={inputClass} list="competitive-metric-options" value={metric.label} onChange={(event) => onChange({ label: event.target.value })} />
          <datalist id="competitive-metric-options">{commonMetrics.map((option) => <option key={option} value={option} />)}</datalist>
        </Field>
        <Field label="Your value"><input className={inputClass} type="number" min={0} value={metric.yourValue ?? ""} onChange={(event) => onChange({ yourValue: event.target.value === "" ? null : Number(event.target.value) })} /></Field>
        <Field label="Competitor"><input className={inputClass} type="number" min={0} value={metric.competitorValue ?? ""} onChange={(event) => onChange({ competitorValue: event.target.value === "" ? null : Number(event.target.value) })} /></Field>
        <Field label="Better when"><select className={inputClass} value={metric.direction} onChange={(event) => onChange({ direction: event.target.value as MetricDirection })}><option value="higher">Higher</option><option value="lower">Lower</option></select></Field>
        <Button variant="ghost" size="icon" aria-label="Remove metric" className="self-end" onClick={onRemove}><Trash2 /></Button>
      </div>
      <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-3 min-h-10 text-xs font-semibold text-primary sm:hidden">
        {expanded ? "Hide source details" : "Source, unit & date"}
      </button>
      <div className={cn("mt-3 grid gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-5", expanded ? "grid" : "hidden")}>
        <Field label="Unit"><input className={inputClass} placeholder="%, posts, hours" value={metric.unit} onChange={(event) => onChange({ unit: event.target.value })} /></Field>
        <div className="sm:col-span-1 lg:col-span-3"><Field label="Source note"><input className={inputClass} placeholder="How and where was this observed?" value={metric.sourceNote} onChange={(event) => onChange({ sourceNote: event.target.value })} /></Field></div>
        <Field label="Observed"><input className={inputClass} type="date" value={metric.observedAt} onChange={(event) => onChange({ observedAt: event.target.value })} /></Field>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {hint && <span className="ml-2 text-[10px] text-muted-foreground">{hint}</span>}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

const inputClass =
  "min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
const textareaClass =
  "w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
