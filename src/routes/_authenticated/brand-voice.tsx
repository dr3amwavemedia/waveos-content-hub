import { RequireFeature } from "@/components/app/require-feature";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/components/app/workspace-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/brand-voice")({
  component: () => (
    <RequireFeature feature="can_manage_brand_voice" title="Brand voice isn't included in your plan">
      <BrandVoicePage />
    </RequireFeature>
  ),
  head: () => ({ meta: [{ title: "Brand voice — WaveOS" }] }),
});

const TONE_OPTIONS = [
  "Professional", "Friendly", "Educational", "Energetic",
  "Luxury", "Casual", "Bold", "Humorous", "Community-focused",
];

const EMOJI_OPTIONS = [
  { v: "none", l: "None" },
  { v: "sparing", l: "Sparing" },
  { v: "balanced", l: "Balanced" },
  { v: "frequent", l: "Frequent" },
];

const LENGTH_OPTIONS = [
  { v: "short", l: "Short (1–2 sentences)" },
  { v: "medium", l: "Medium (paragraph)" },
  { v: "long", l: "Long (multiple paragraphs)" },
];

type Draft = {
  business_name: string;
  website: string;
  industry: string;
  primary_services: string;
  service_area: string;
  target_audience: string;
  brand_summary: string;
  tone_traits: string[];
  preferred_phrases: string;
  words_to_avoid: string;
  default_ctas_text: string;
  default_hashtags_text: string;
  emoji_preference: string;
  preferred_caption_length: string;
  primary_language: "en" | "es";
  secondary_language: "" | "en" | "es";
  timezone: string;
};

const EMPTY: Draft = {
  business_name: "", website: "", industry: "",
  primary_services: "", service_area: "", target_audience: "",
  brand_summary: "", tone_traits: [], preferred_phrases: "",
  words_to_avoid: "", default_ctas_text: "", default_hashtags_text: "",
  emoji_preference: "balanced", preferred_caption_length: "medium",
  primary_language: "en", secondary_language: "", timezone: "",
};

function BrandVoicePage() {
  const { activeWorkspace } = useWorkspace();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const wsId = activeWorkspace?.id;

  const profileQ = useQuery({
    queryKey: ["brand-profile", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_profiles")
        .select("*")
        .eq("workspace_id", wsId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const p = profileQ.data;
    if (!p) {
      setDraft({ ...EMPTY, timezone: activeWorkspace?.timezone ?? "" });
      return;
    }
    setDraft({
      business_name: p.business_name ?? "",
      website: p.website ?? "",
      industry: p.industry ?? "",
      primary_services: p.primary_services ?? "",
      service_area: p.service_area ?? "",
      target_audience: p.target_audience ?? "",
      brand_summary: p.brand_summary ?? "",
      tone_traits: p.tone_traits ?? [],
      preferred_phrases: p.preferred_phrases ?? "",
      words_to_avoid: p.words_to_avoid ?? "",
      default_ctas_text: (p.default_ctas ?? []).join("\n"),
      default_hashtags_text: (p.default_hashtags ?? []).join(" "),
      emoji_preference: p.emoji_preference ?? "balanced",
      preferred_caption_length: p.preferred_caption_length ?? "medium",
      primary_language: (p.primary_language as "en" | "es") ?? "en",
      secondary_language: (p.secondary_language as "" | "en" | "es") ?? "",
      timezone: p.timezone ?? activeWorkspace?.timezone ?? "",
    });
  }, [profileQ.data, activeWorkspace?.timezone]);

  const save = useMutation({
    mutationFn: async (markComplete: boolean) => {
      if (!wsId) throw new Error("No workspace");
      const payload = {
        workspace_id: wsId,
        business_name: draft.business_name || null,
        website: draft.website || null,
        industry: draft.industry || null,
        primary_services: draft.primary_services || null,
        service_area: draft.service_area || null,
        target_audience: draft.target_audience || null,
        brand_summary: draft.brand_summary || null,
        tone_traits: draft.tone_traits,
        preferred_phrases: draft.preferred_phrases || null,
        words_to_avoid: draft.words_to_avoid || null,
        default_ctas: draft.default_ctas_text.split("\n").map((s) => s.trim()).filter(Boolean),
        default_hashtags: draft.default_hashtags_text.split(/\s+/).map((s) => s.trim().replace(/^#/, "")).filter(Boolean).map((h) => `#${h}`),
        emoji_preference: draft.emoji_preference,
        preferred_caption_length: draft.preferred_caption_length,
        primary_language: draft.primary_language,
        secondary_language: draft.secondary_language || null,
        timezone: draft.timezone || null,
        onboarding_status: markComplete ? "complete" : (profileQ.data?.onboarding_status ?? "in_progress"),
      };
      const { error } = await supabase.from("brand_profiles").upsert(payload, {
        onConflict: "workspace_id",
      });
      if (error) throw error;
    },
    onSuccess: (_, markComplete) => {
      qc.invalidateQueries({ queryKey: ["brand-profile", wsId] });
      toast.success(markComplete ? "Brand profile complete." : "Saved.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to save."),
  });

  if (!wsId) return null;

  const complete = profileQ.data?.onboarding_status === "complete";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
            Brand voice
          </p>
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Teach WaveOS how your brand sounds.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          These details power caption drafts, hashtag suggestions, and tone
          consistency across every post.
        </p>
        {complete && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-success/15 px-2.5 py-1 text-xs font-medium text-success ring-1 ring-success/30">
            <Check className="h-3.5 w-3.5" /> Brand profile complete
          </div>
        )}
      </header>

      <Stepper step={step} onStep={setStep} />

      <div className="surface-card space-y-5 p-6">
        {step === 1 && (
          <>
            <StepTitle n={1} title="Business basics" />
            <TwoCol>
              <Field label="Business name">
                <input className={input} value={draft.business_name}
                  onChange={(e) => setDraft({ ...draft, business_name: e.target.value })} />
              </Field>
              <Field label="Website">
                <input className={input} value={draft.website} placeholder="https://…"
                  onChange={(e) => setDraft({ ...draft, website: e.target.value })} />
              </Field>
            </TwoCol>
            <TwoCol>
              <Field label="Industry">
                <input className={input} value={draft.industry}
                  onChange={(e) => setDraft({ ...draft, industry: e.target.value })} />
              </Field>
              <Field label="Service area">
                <input className={input} value={draft.service_area} placeholder="Miami, FL · Nationwide · Global"
                  onChange={(e) => setDraft({ ...draft, service_area: e.target.value })} />
              </Field>
            </TwoCol>
            <Field label="Primary services or products">
              <textarea className={textarea} rows={3} value={draft.primary_services}
                onChange={(e) => setDraft({ ...draft, primary_services: e.target.value })} />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <StepTitle n={2} title="Audience & goals" />
            <Field label="Target audience">
              <textarea className={textarea} rows={3} value={draft.target_audience}
                placeholder="Who are you speaking to? Demographics, interests, pain points."
                onChange={(e) => setDraft({ ...draft, target_audience: e.target.value })} />
            </Field>
            <Field label="Brand summary — 1 to 3 sentences">
              <textarea className={textarea} rows={3} value={draft.brand_summary}
                placeholder="What you do, who you help, what makes you different."
                onChange={(e) => setDraft({ ...draft, brand_summary: e.target.value })} />
            </Field>
          </>
        )}

        {step === 3 && (
          <>
            <StepTitle n={3} title="Brand voice" />
            <Field label="Tone traits — pick as many as fit">
              <div className="flex flex-wrap gap-2">
                {TONE_OPTIONS.map((t) => {
                  const on = draft.tone_traits.includes(t);
                  return (
                    <button key={t} type="button"
                      onClick={() => setDraft({
                        ...draft,
                        tone_traits: on
                          ? draft.tone_traits.filter((x) => x !== t)
                          : [...draft.tone_traits, t],
                      })}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                        on
                          ? "border-primary/50 bg-primary/15 text-foreground ring-1 ring-primary/40"
                          : "border-border bg-surface/60 text-muted-foreground hover:text-foreground",
                      )}>
                      {t}
                    </button>
                  );
                })}
              </div>
            </Field>
            <TwoCol>
              <Field label="Preferred phrases">
                <textarea className={textarea} rows={3} value={draft.preferred_phrases}
                  onChange={(e) => setDraft({ ...draft, preferred_phrases: e.target.value })} />
              </Field>
              <Field label="Words to avoid">
                <textarea className={textarea} rows={3} value={draft.words_to_avoid}
                  onChange={(e) => setDraft({ ...draft, words_to_avoid: e.target.value })} />
              </Field>
            </TwoCol>
          </>
        )}

        {step === 4 && (
          <>
            <StepTitle n={4} title="Content preferences" />
            <Field label="Default CTAs — one per line">
              <textarea className={textarea} rows={4} value={draft.default_ctas_text}
                placeholder={"Book a call\nShop now\nSubscribe"}
                onChange={(e) => setDraft({ ...draft, default_ctas_text: e.target.value })} />
            </Field>
            <Field label="Default hashtags">
              <textarea className={textarea} rows={2} value={draft.default_hashtags_text}
                placeholder="#brand #industry #location"
                onChange={(e) => setDraft({ ...draft, default_hashtags_text: e.target.value })} />
            </Field>
            <TwoCol>
              <Field label="Emoji usage">
                <div className="grid grid-cols-4 gap-1.5">
                  {EMOJI_OPTIONS.map((o) => (
                    <button key={o.v} type="button" onClick={() => setDraft({ ...draft, emoji_preference: o.v })}
                      className={cn("rounded-lg border px-2 py-2 text-xs font-medium capitalize",
                        draft.emoji_preference === o.v
                          ? "border-primary/50 bg-primary/15 text-foreground"
                          : "border-border bg-surface/60 text-muted-foreground")}>
                      {o.l}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Caption length">
                <select className={input} value={draft.preferred_caption_length}
                  onChange={(e) => setDraft({ ...draft, preferred_caption_length: e.target.value })}>
                  {LENGTH_OPTIONS.map((o) => (<option key={o.v} value={o.v}>{o.l}</option>))}
                </select>
              </Field>
            </TwoCol>
            <TwoCol>
              <Field label="Primary language">
                <select className={input} value={draft.primary_language}
                  onChange={(e) => setDraft({ ...draft, primary_language: e.target.value as "en" | "es" })}>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              </Field>
              <Field label="Secondary language (optional)">
                <select className={input} value={draft.secondary_language}
                  onChange={(e) => setDraft({ ...draft, secondary_language: e.target.value as "" | "en" | "es" })}>
                  <option value="">None</option>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              </Field>
            </TwoCol>
          </>
        )}

        {step === 5 && (
          <>
            <StepTitle n={5} title="Review & finish" />
            <p className="text-sm text-muted-foreground">
              You can update this anytime. When you're ready, mark the brand
              profile complete so your Dream Wave Media team can generate captions
              in your voice.
            </p>
            <div className="rounded-lg border border-primary/30 bg-primary/8 p-4 text-sm">
              <div className="font-medium text-foreground">Social account connection</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Social account connection will be completed from the Social Accounts page.
              </p>
            </div>
          </>
        )}

        <div className="flex items-center justify-between pt-3">
          <button
            type="button"
            disabled={step === 1}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="rounded-lg border border-border bg-surface/60 px-3 py-2 text-sm text-foreground disabled:opacity-40"
          >
            Back
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => save.mutate(false)}
              disabled={save.isPending}
              className="rounded-lg border border-border bg-surface/60 px-3 py-2 text-sm text-foreground hover:bg-elevated disabled:opacity-60"
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </button>
            {step < 5 ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(5, s + 1))}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={() => save.mutate(true)}
                disabled={save.isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-60"
              >
                Mark complete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stepper({ step, onStep }: { step: number; onStep: (n: number) => void }) {
  const labels = ["Basics", "Audience", "Voice", "Content", "Review"];
  return (
    <ol className="grid grid-cols-5 gap-2">
      {labels.map((l, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <li key={l}>
            <button onClick={() => onStep(n)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium",
                active ? "border-primary/50 bg-primary/15 text-foreground"
                       : done ? "border-border bg-elevated text-foreground"
                              : "border-border bg-surface/60 text-muted-foreground",
              )}>
              <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                active ? "bg-primary text-primary-foreground"
                       : done ? "bg-success text-success-foreground"
                              : "bg-elevated text-muted-foreground")}>
                {done ? <Check className="h-3 w-3" /> : n}
              </span>
              <span className="truncate">{l}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">Step {n}</div>
      <h2 className="mt-1 text-lg font-semibold text-foreground">{title}</h2>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function TwoCol({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

const input =
  "w-full rounded-lg border border-input bg-surface/60 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40";
const textarea = input + " resize-none";
