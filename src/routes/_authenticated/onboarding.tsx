import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Loader2, Sparkles, Upload, Users2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/components/app/workspace-context";
import { WaveLogo } from "@/components/branding/wave-logo";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: OnboardingPage,
  head: () => ({ meta: [{ title: "Welcome to WaveOS" }] }),
});

type Step = "welcome" | "details" | "done";

const INDUSTRIES = [
  "Agency", "E-commerce", "Restaurant / Food", "Real Estate", "Fitness / Wellness",
  "Beauty / Salon", "Professional Services", "Coach / Creator", "Nonprofit",
  "Healthcare", "SaaS / Tech", "Other",
];

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "America/Toronto",
  "America/Mexico_City", "America/Sao_Paulo", "Europe/London", "Europe/Paris",
  "Europe/Berlin", "Europe/Madrid", "Africa/Johannesburg", "Asia/Dubai",
  "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "UTC",
];

function OnboardingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { workspaces, setActiveWorkspaceId, isLoading } = useWorkspace();

  const [step, setStep] = useState<Step>("welcome");
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [timezone, setTimezone] = useState(
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"
      : "America/New_York",
  );
  const [language, setLanguage] = useState("en");
  const [serviceArea, setServiceArea] = useState("");
  const [audience, setAudience] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  // If the user already has workspaces AND didn't just create one, send them home.
  useEffect(() => {
    if (isLoading) return;
    if (workspaces.length > 0 && step === "welcome" && !createdId) {
      // fine to stay: user may be creating an additional workspace
    }
  }, [isLoading, workspaces.length, step, createdId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter a workspace name.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_brand_workspace", {
        _name: name.trim(),
        _business_name: businessName.trim() || undefined,
        _industry: industry || undefined,
        _website: website.trim() || undefined,
        _timezone: timezone,
        _primary_language: language,
        _service_area: serviceArea.trim() || undefined,
        _target_audience: audience.trim() || undefined,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const newId = row?.id as string | undefined;
      if (!newId) throw new Error("Workspace was created but no id returned.");
      await qc.invalidateQueries({ queryKey: ["waveos", "workspaces"] });
      setActiveWorkspaceId(newId);
      setCreatedId(newId);
      setStep("done");
      toast.success("Workspace created.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("workspace_limit_reached")) {
        toast.error("You've reached the limit for self-created workspaces.");
      } else if (msg.includes("workspace_name_too_short")) {
        toast.error("Workspace name must be at least 2 characters.");
      } else if (msg.includes("workspace_name_too_long")) {
        toast.error("Workspace name must be 80 characters or less.");
      } else if (msg.includes("not_authenticated")) {
        toast.error("Please sign in again.");
      } else {
        toast.error("Couldn't create workspace. Please try again.");
        console.error(err);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-2xl flex-col justify-center">
      <div className="mb-8 flex justify-center">
        <WaveLogo />
      </div>

      {step === "welcome" && (
        <div className="surface-card space-y-6 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/30">
            <Sparkles className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Welcome to WaveOS
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Create your own Brand Workspace in under a minute. You'll get a media library,
              content calendar, brand profile, and room for your team.
            </p>
          </div>
          <button
            onClick={() => setStep("details")}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110"
          >
            Create Brand Workspace <ArrowRight className="h-4 w-4" />
          </button>
          {workspaces.length > 0 && (
            <button
              onClick={() => navigate({ to: "/home" })}
              className="block w-full text-xs text-muted-foreground hover:text-foreground"
            >
              or return to your existing workspace
            </button>
          )}
        </div>
      )}

      {step === "details" && (
        <form onSubmit={handleCreate} className="surface-card space-y-5 p-8">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Tell us about your brand</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This becomes your workspace's identity. You can change any of it later.
            </p>
          </div>

          <Field label="Workspace name" required>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => !businessName && setBusinessName(name)}
              placeholder="e.g. Acme Coffee"
              maxLength={80}
              className={inputClass}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name">
              <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Legal / display name"
                maxLength={120}
                className={inputClass}
              />
            </Field>
            <Field label="Industry">
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className={inputClass}
              >
                <option value="">Select…</option>
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Website">
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              className={inputClass}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Timezone">
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputClass}>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </Field>
            <Field label="Primary language">
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className={inputClass}>
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="pt">Portuguese</option>
                <option value="de">German</option>
                <option value="it">Italian</option>
                <option value="nl">Dutch</option>
                <option value="ja">Japanese</option>
              </select>
            </Field>
          </div>

          <Field label="Service area (optional)">
            <input
              value={serviceArea}
              onChange={(e) => setServiceArea(e.target.value)}
              placeholder="e.g. Denver metro, USA, Global"
              className={inputClass}
            />
          </Field>

          <Field label="Target audience (optional)">
            <input
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="Who are you talking to?"
              className={inputClass}
            />
          </Field>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setStep("welcome")}
              className="rounded-lg border border-border bg-surface/60 px-4 py-2 text-sm text-foreground hover:bg-elevated"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Create workspace
            </button>
          </div>
        </form>
      )}

      {step === "done" && (
        <div className="surface-card space-y-6 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/30">
            <Check className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Your workspace is ready</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You're ready to start building your brand.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <button
              onClick={() => navigate({ to: "/content" })}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-elevated"
            >
              <Upload className="h-4 w-4" /> Upload media
            </button>
            <button
              onClick={() => navigate({ to: "/create" })}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-elevated"
            >
              <Sparkles className="h-4 w-4" /> Create post
            </button>
            <button
              onClick={() => navigate({ to: "/settings" })}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-elevated"
            >
              <Users2 className="h-4 w-4" /> Invite team
            </button>
          </div>
          <button
            onClick={() => navigate({ to: "/home" })}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110"
          >
            Go to dashboard <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-input bg-surface/60 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label} {required && <span className="text-primary">*</span>}
      </span>
      {children}
    </label>
  );
}
