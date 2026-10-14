import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Eye,
  PenSquare,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { WaveLogo } from "@/components/branding/wave-logo";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      {
        title: "WaveOS",
      },
      {
        name: "description",
        content:
          "Create, manage, and understand your social content in one calm workspace with WaveOS.",
      },
    ],
  }),
});

const workflow = [
  {
    icon: PenSquare,
    eyebrow: "Create",
    title: "Make content in one place",
    body: "Draft posts, keep your media organized, and use your saved Brand Voice while you work.",
  },
  {
    icon: CalendarDays,
    eyebrow: "Manage",
    title: "Know what is going out next",
    body: "Review the calendar, prepare each social channel, and keep the next task easy to find.",
  },
  {
    icon: TrendingUp,
    eyebrow: "Understand",
    title: "See results without the jargon",
    body: "WaveOS shows the performance data your connected accounts actually make available.",
  },
  {
    icon: Sparkles,
    eyebrow: "Improve",
    title: "Turn real signals into next steps",
    body: "Get simple suggestions based on the information in your workspace—not invented benchmarks.",
  },
];

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.auth.getUser();

      if (!cancelled && !error && data.user) {
        navigate({ to: "/home", replace: true });
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        // The protected route reads the user; wait until the auth event ends.
        window.setTimeout(() => {
          if (!cancelled) navigate({ to: "/home", replace: true });
        }, 0);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[36rem] bg-[radial-gradient(65%_55%_at_50%_0%,color-mix(in_oklab,var(--primary)_20%,transparent),transparent_75%)]" />
      <nav className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pb-6 sm:pt-6">
        <WaveLogo />
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all hover:brightness-110"
          >
            Sign up
          </Link>
          <Link
            to="/auth"
            search={{}}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-surface/60 px-4 py-2 text-sm font-medium text-foreground/90 backdrop-blur transition-colors hover:bg-elevated"
          >
            Sign in
          </Link>
        </div>
      </nav>

      <main className="relative mx-auto max-w-6xl px-4 pb-24 pt-14 sm:px-6 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px] shadow-primary/80" />
            Your online presence, in one place
          </span>
          <h1 className="mt-6 text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-6xl md:text-7xl">
            Create with confidence.{" "}
            <span className="text-gradient-primary">Know what to do next.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
            WaveOS gives small businesses one calm workspace to create content, manage connected
            social accounts, understand real performance, and make the next decision easier.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="group inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all hover:brightness-110"
            >
              Start with WaveOS
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/auth"
              search={{}}
              className="inline-flex min-h-12 items-center gap-2 rounded-full border border-border bg-surface/60 px-6 py-3 text-sm font-medium text-foreground backdrop-blur transition-colors hover:bg-elevated"
            >
              Sign in to your workspace
            </Link>
          </div>
        </div>

        <section className="mt-20 sm:mt-24" aria-labelledby="workflow-heading">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              A simple flow
            </p>
            <h2
              id="workflow-heading"
              className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            >
              Create, manage, understand, improve.
            </h2>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {workflow.map((item) => (
              <div
                key={item.title}
                className="surface-card p-6 transition-all hover:border-border-strong hover:shadow-[var(--shadow-glow)]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <item.icon className="h-5 w-5" />
                </div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  {item.eyebrow}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 grid gap-4 rounded-3xl border border-border bg-surface/45 p-5 sm:grid-cols-[auto_1fr] sm:items-start sm:p-7">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/25">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Clear about your data</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Your content and connected-account information stay tied to your workspace. When a
              platform does not provide a metric, WaveOS says it is unavailable instead of filling
              the space with a made-up number.
            </p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" /> Workspace-based access
              </span>
              <span className="inline-flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" /> Plain-English data status
              </span>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 bg-surface/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-6 text-xs text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <WaveLogo compact />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:justify-end">
            <Link to="/privacy" className="min-h-11 py-3 hover:text-foreground">
              Privacy
            </Link>
            <Link to="/terms" className="min-h-11 py-3 hover:text-foreground">
              Terms
            </Link>
            <p>© {new Date().getFullYear()} Dream Wave Media. Powered by WaveOS.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
