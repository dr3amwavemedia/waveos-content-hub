import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Check,
  Clock3,
  Loader2,
  Megaphone,
  Save,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { RequireFeature } from "@/components/app/require-feature";
import { UnsavedChangesGuard } from "@/components/app/unsaved-changes-guard";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/app/workspace-context";
import { useWorkflowDraft } from "@/hooks/use-workflow-draft";
import { supabase } from "@/integrations/supabase/client";
import {
  buildCampaignPlan,
  CAMPAIGN_GOALS,
  validateCampaignPlanningInput,
  type CampaignGoal,
  type CampaignPlanningInput,
  type CampaignPlanningItem,
} from "@/lib/phase-one-planning";
import { cn } from "@/lib/utils";
import { generateCampaignDirection } from "@/lib/campaign-ideas.functions";
import { MobileWorkflowSteps, MobileWorkflowSection, MobileWorkflowFooter } from "@/components/app/mobile-workflow";

export const Route = createFileRoute("/_authenticated/campaigns")({
  component: () => (
    <RequireFeature
      feature="can_use_campaign_manager"
      title="Campaign Manager is available with Current or Tidal"
      description="Upgrade your WaveOS plan to build and organize multi-post campaigns."
    >
      <CampaignManagerPage />
    </RequireFeature>
  ),
  head: () => ({
    meta: [
      { title: "Campaign Manager — WaveOS" },
      {
        name: "description",
        content: "Build reviewable internal social campaign plans without auto-publishing.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Campaign Manager — WaveOS" },
      { property: "og:description", content: "Build and review your next social campaign plan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const db = supabase as unknown as {
  // Phase 1 additive tables can land before regenerated client definitions.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

const PLATFORM_OPTIONS = ["instagram", "facebook", "linkedin", "tiktok", "youtube", "x"];
const DAY_OPTIONS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function dateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const DEFAULT_INPUT: CampaignPlanningInput = {
  name: "",
  goal: "awareness",
  startDate: dateOffset(1),
  endDate: dateOffset(30),
  platforms: ["instagram"],
  maxPosts: 8,
  postingHours: ["09:00", "15:00"],
  excludedDays: ["saturday", "sunday"],
  approvalRequired: true,
};

interface CampaignPlanRow {
  id: string;
  name: string;
  goal: CampaignGoal;
  start_date: string;
  end_date: string;
  platforms: string[];
  max_posts: number;
  status: string;
  created_at: string;
}

function CampaignManagerPage() {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;
  const queryClient = useQueryClient();
  const [input, setInput] = useState<CampaignPlanningInput>(DEFAULT_INPUT);
  const [preview, setPreview] = useState<CampaignPlanningItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [mobileStep, setMobileStep] = useState(0);
  const campaignDirectionFn = useServerFn(generateCampaignDirection);
  const [campaignDirection, setCampaignDirection] = useState<{
    angle:string;
    audienceInsight:string;
    pillars:Array<{name:string;purpose:string;examples:string[]}>;
    hooks:string[];
    notes:string[];
  } | null>(null);
  const [directionBusy, setDirectionBusy] = useState(false);
  const mobileSteps = ["Campaign name", "Your goal", "Platforms", "Posting frequency", "Planning schedule", "Review campaign"];
  const workflowDraft = useWorkflowDraft<CampaignPlanningInput>({
    workspaceId,
    workflowKey: "campaign-manager",
  });

  const campaigns = useQuery({
    queryKey: ["campaign-plans", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await db
        .from("campaign_plans")
        .select("id,name,goal,start_date,end_date,platforms,max_posts,status,created_at")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as CampaignPlanRow[];
    },
  });

  const errors = useMemo(() => validateCampaignPlanningInput(input), [input]);

  const savePlan = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("Select a workspace first.");
      if (errors.length) throw new Error(errors[0]);
      const plannedItems = preview.length ? preview : buildCampaignPlan(input);
      if (!plannedItems.length) {
        throw new Error("No planning slots remain after excluded days and times are applied.");
      }
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw authError ?? new Error("Sign in to save a campaign.");
      const { data: plan, error: planError } = await db
        .from("campaign_plans")
        .insert({
          workspace_id: workspaceId,
          created_by: auth.user.id,
          name: input.name.trim(),
          goal: input.goal,
          start_date: input.startDate,
          end_date: input.endDate,
          platforms: input.platforms,
          max_posts: input.maxPosts,
          posting_hours: input.postingHours,
          excluded_days: input.excludedDays,
          approval_required: input.approvalRequired,
          status: "draft",
        })
        .select("id")
        .single();
      if (planError) throw planError;
      const { error: itemsError } = await db.from("campaign_plan_items").insert(
        plannedItems.map((item) => ({
          workspace_id: workspaceId,
          campaign_plan_id: plan.id,
          position: item.sequence,
          planned_date: item.plannedDate,
          planned_time: item.localTime,
          platform: item.platform,
          content_pillar: item.pillar,
          working_title: item.workingTitle,
          copy_brief: item.copyBrief,
          approval_required: item.approvalRequired,
          status: "draft",
        })),
      );
      if (itemsError) {
        await db.from("campaign_plans").delete().eq("id", plan.id).eq("workspace_id", workspaceId);
        throw itemsError;
      }
      return plan.id as string;
    },
    onSuccess: async () => {
      await workflowDraft.discard.mutateAsync();
      setDirty(false);
      setPreview([]);
      setInput(DEFAULT_INPUT);
      await queryClient.invalidateQueries({ queryKey: ["campaign-plans", workspaceId] });
      toast.success("Campaign plan saved for internal review.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Campaign plan could not be saved."),
  });

  function update<K extends keyof CampaignPlanningInput>(key: K, value: CampaignPlanningInput[K]) {
    setInput((current) => ({ ...current, [key]: value }));
    setPreview([]);
    setDirty(true);
  }

  function toggleList(key: "platforms" | "excludedDays", value: string) {
    const values = input[key];
    update(
      key,
      values.includes(value) ? values.filter((item) => item !== value) : [...values, value],
    );
  }

  async function generateDirection() {
    if (!workspaceId || !input.platforms.length || directionBusy) return;
    setDirectionBusy(true);
    try {
      const direction = await campaignDirectionFn({
        data: {
          workspaceId,
          name: input.name,
          goal: input.goal,
          platforms: input.platforms,
        },
      });
      setCampaignDirection(direction);
      toast.success("Organic campaign direction is ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Campaign direction could not be generated.");
    } finally {
      setDirectionBusy(false);
    }
  }

  async function saveServerDraft() {
    try {
      await workflowDraft.save.mutateAsync(input);
      setDirty(false);
      toast.success("Private server draft saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Draft could not be saved.");
    }
  }

  function generatePlan() {
    if (errors.length) {
      toast.error(errors[0]);
      return;
    }
    const next = buildCampaignPlan(input);
    if (!next.length) {
      toast.error("No planning slots remain. Change the dates, excluded days, or times.");
      return;
    }
    setPreview(next);
    setDirty(true);
  }

  if (!activeWorkspace) return null;

  return (
    <div className="space-y-6">
      <UnsavedChangesGuard dirty={dirty} subject="this campaign plan" />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            <Megaphone className="h-4 w-4" /> Internal planning
          </div>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Campaign Manager</h1>
          <p className="mt-2 hidden max-w-3xl text-sm text-muted-foreground sm:block">
            Build a reviewable campaign outline from your own constraints. Nothing here schedules,
            publishes, spends money, or contacts an external platform.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void saveServerDraft()}
            disabled={workflowDraft.save.isPending}
          >
            {workflowDraft.save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Save draft
          </Button>
          <Button variant="outline" onClick={() => void generateDirection()} disabled={!input.platforms.length || directionBusy}>
            {directionBusy ? <Loader2 className="animate-spin" /> : <Sparkles />} AI direction
          </Button>
          <Button className="hidden sm:inline-flex" onClick={generatePlan} disabled={errors.length > 0}>
            <Sparkles /> Build plan
          </Button>
        </div>
      </header>

      {campaignDirection && (
        <details className="rounded-xl border border-primary/25 bg-primary/5 p-4" open>
          <summary className="cursor-pointer list-none">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-semibold">AI campaign direction</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{campaignDirection.angle}</p>
          </summary>
          <div className="mt-4 space-y-4 border-t border-border pt-4">
            <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Audience insight</p><p className="mt-1 text-sm">{campaignDirection.audienceInsight}</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {campaignDirection.pillars.map((pillar) => (
                <div key={pillar.name} className="rounded-xl border border-border bg-background/50 p-3">
                  <p className="font-semibold">{pillar.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{pillar.purpose}</p>
                  <ul className="mt-2 space-y-1 text-sm">{pillar.examples.map((example,index)=><li key={index}>• {example}</li>)}</ul>
                </div>
              ))}
            </div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hooks to explore</p><div className="mt-2 flex flex-wrap gap-2">{campaignDirection.hooks.map((hook,index)=><span key={index} className="rounded-full border border-border bg-background px-3 py-1.5 text-xs">{hook}</span>)}</div></div>
          </div>
        </details>
      )}

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
                const restored = workflowDraft.data?.payload;
                if (!restored) return;
                setInput(restored);
                setPreview([]);
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,.72fr)]">
        <section className="space-y-5 sm:surface-card sm:p-6">
          <MobileWorkflowSteps steps={mobileSteps} step={mobileStep} onChange={setMobileStep} />
          <div className="grid gap-4 sm:grid-cols-2">
            <MobileWorkflowSection active={mobileStep === 0}>
            <Field label="Campaign name">
              <input
                className={inputClass}
                value={input.name}
                maxLength={120}
                placeholder="Spring service launch"
                onChange={(event) => update("name", event.target.value)}
              />
            </Field>
            </MobileWorkflowSection>
            <MobileWorkflowSection active={mobileStep === 1}>
            <div className="grid grid-cols-2 gap-3 sm:hidden" aria-label="Campaign goal">
              {CAMPAIGN_GOALS.map((goal) => <Button key={goal} variant="outline" aria-pressed={input.goal === goal} className={cn("min-h-24 whitespace-normal rounded-xl", input.goal === goal && "border-primary bg-primary/10 text-primary")} onClick={() => update("goal", goal)}>{({ awareness: "Brand Awareness", engagement: "Increase Engagement", leads: "Generate Leads", launch: "Promote a Service", retention: "Keep Customers" })[goal]}</Button>)}
            </div>
            <div className="hidden sm:block">
            <Field label="Primary goal">
              <select
                className={inputClass}
                value={input.goal}
                onChange={(event) => update("goal", event.target.value as CampaignGoal)}
              >
                {CAMPAIGN_GOALS.map((goal) => (
                  <option key={goal} value={goal}>
                    {goal[0].toUpperCase() + goal.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
            </div>
            </MobileWorkflowSection>
            <MobileWorkflowSection active={mobileStep === 4}>
            <Field label="Start date">
              <input
                className={inputClass}
                type="date"
                value={input.startDate}
                onChange={(event) => update("startDate", event.target.value)}
              />
            </Field>
            </MobileWorkflowSection>
            <MobileWorkflowSection active={mobileStep === 4}>
            <Field label="End date">
              <input
                className={inputClass}
                type="date"
                value={input.endDate}
                onChange={(event) => update("endDate", event.target.value)}
              />
            </Field>
            </MobileWorkflowSection>
            <MobileWorkflowSection active={mobileStep === 3}>
            <Field label="Maximum posts">
              <input
                className={inputClass}
                type="number"
                min={1}
                max={60}
                value={input.maxPosts}
                onChange={(event) => update("maxPosts", Number(event.target.value))}
              />
            </Field>
            </MobileWorkflowSection>
            <MobileWorkflowSection active={mobileStep === 4}>
            <Field label="Planning times" hint="Local workspace times, comma separated">
              <input
                className={inputClass}
                value={input.postingHours.join(", ")}
                placeholder="09:00, 15:00"
                onChange={(event) =>
                  update(
                    "postingHours",
                    event.target.value
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  )
                }
              />
            </Field>
            </MobileWorkflowSection>
          </div>

          <MobileWorkflowSection active={mobileStep === 2}>
          <ChoiceGroup
            label="Platforms"
            values={PLATFORM_OPTIONS}
            selected={input.platforms}
            onToggle={(value) => toggleList("platforms", value)}
          />
          </MobileWorkflowSection>
          <MobileWorkflowSection active={mobileStep === 4}>
          <ChoiceGroup
            label="Days to exclude"
            values={DAY_OPTIONS}
            selected={input.excludedDays}
            onToggle={(value) => toggleList("excludedDays", value)}
          />
          </MobileWorkflowSection>

          <MobileWorkflowSection active={mobileStep === 5}>
          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface p-4 text-sm sm:hidden">
            <dt className="text-muted-foreground">Campaign</dt><dd className="break-words">{input.name || "Not named"}</dd>
            <dt className="text-muted-foreground">Goal</dt><dd className="capitalize">{input.goal}</dd>
            <dt className="text-muted-foreground">Platforms</dt><dd className="break-words capitalize">{input.platforms.join(", ") || "None"}</dd>
            <dt className="text-muted-foreground">Maximum posts</dt><dd>{input.maxPosts}</dd>
            <dt className="text-muted-foreground">Dates</dt><dd>{input.startDate} – {input.endDate}</dd>
          </dl>
          <label className="flex min-h-12 items-center justify-between gap-4 rounded-xl border border-border bg-background/40 px-4 py-3">
            <span>
              <span className="block text-sm font-semibold">Approval required</span>
              <span className="block text-xs text-muted-foreground">
                Mark every draft item as requiring review before any future scheduling step.
              </span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-primary"
              checked={input.approvalRequired}
              onChange={(event) => update("approvalRequired", event.target.checked)}
            />
          </label>
          </MobileWorkflowSection>

          {errors.length > 0 && (
            <ul className={cn("rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning", mobileStep !== 5 && "hidden sm:block")}>
              {errors.map((error) => (
                <li key={error}>• {error}</li>
              ))}
            </ul>
          )}
          <MobileWorkflowFooter step={mobileStep} total={mobileSteps.length} onChange={setMobileStep} canNext={mobileStep === 0 ? Boolean(input.name.trim()) : mobileStep === 2 ? input.platforms.length > 0 : mobileStep === 3 ? input.maxPosts > 0 && input.maxPosts <= 60 : true} final={<Button className="min-h-12" onClick={generatePlan} disabled={errors.length > 0}><Sparkles /> Build plan</Button>} />
        </section>

        <aside className="space-y-5">
          <section className="surface-card hidden p-5 sm:block">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" /> Guardrails
            </div>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>• Internal plan only; no automatic publishing.</li>
              <li>• Times are user-selected planning windows, not performance claims.</li>
              <li>• Approval status is preserved on every generated item.</li>
              <li>• AI suggestions are creative direction only; they never schedule or publish.</li>
            </ul>
          </section>

          <section className="surface-card p-5">
            <h2 className="font-semibold">Recent plans</h2>
            <div className="mt-3 space-y-2">
              {campaigns.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {(campaigns.data ?? []).map((campaign) => (
                <div key={campaign.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-semibold">{campaign.name}</span>
                    <span className="rounded-full bg-elevated px-2 py-1 text-[10px] uppercase">
                      {campaign.status}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {campaign.start_date} – {campaign.end_date} · {campaign.max_posts} max
                  </div>
                </div>
              ))}
              {!campaigns.isLoading && !campaigns.data?.length && (
                <p className="text-sm text-muted-foreground">No saved plans yet.</p>
              )}
            </div>
          </section>
        </aside>
      </div>

      {preview.length > 0 && (
        <section className="surface-card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <h2 className="font-semibold">Draft plan · {preview.length} items</h2>
              <p className="text-xs text-muted-foreground">
                Review every working title before saving.
              </p>
            </div>
            <Button onClick={() => savePlan.mutate()} disabled={savePlan.isPending}>
              {savePlan.isPending ? <Loader2 className="animate-spin" /> : <Check />}
              Save for review
            </Button>
          </div>
          <div className="divide-y divide-border">
            {preview.map((item) => (
              <article
                key={`${item.plannedDate}-${item.localTime}-${item.sequence}`}
                className="grid gap-3 p-4 sm:grid-cols-[6rem_8rem_minmax(0,1fr)] sm:p-5"
              >
                <div className="text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" /> {item.plannedDate}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Clock3 className="h-3.5 w-3.5" /> {item.localTime}
                  </div>
                </div>
                <div>
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase text-primary">
                    {item.platform}
                  </span>
                </div>
                <div>
                  <div className="text-sm font-semibold">{item.workingTitle}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{item.copyBrief}</div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="ml-2 text-[11px] text-muted-foreground">{hint}</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

function ChoiceGroup({
  label,
  values,
  selected,
  onToggle,
}: {
  label: string;
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => {
          const active = selected.includes(value);
          return (
            <Button variant="outline"
              key={value}
              type="button"
              onClick={() => onToggle(value)}
              className={cn(
                "min-h-10 rounded-full border px-3 text-xs font-semibold capitalize",
                active
                  ? "border-primary/50 bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:bg-elevated",
              )}
            >
              {active && <Check className="mr-1 inline h-3.5 w-3.5" />}
              {value}
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
}

const inputClass =
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
