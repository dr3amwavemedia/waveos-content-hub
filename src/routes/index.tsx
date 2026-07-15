import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, CheckCircle2, Sparkles, TrendingUp } from "lucide-react";

import { WaveLogo } from "@/components/branding/wave-logo";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      {
        title:
          "WaveOS — Create. Approve. Schedule. Grow. | A Dream Wave Media platform",
      },
      {
        name: "description",
        content:
          "WaveOS is the private content operating system Dream Wave Media clients use to review, approve, schedule, and grow their social presence.",
      },
    ],
  }),
});

const highlights = [
  {
    icon: Sparkles,
    title: "Content, ready to review",
    body: "Everything Dream Wave Media creates for your brand — organized, previewed, and ready for one‑tap approval.",
  },
  {
    icon: CalendarDays,
    title: "A calendar you actually understand",
    body: "See what's going out next, on which platform, at what time — with a preview of every caption.",
  },
  {
    icon: CheckCircle2,
    title: "Approve in seconds",
    body: "Green‑light posts or request a change with a quick note. We handle scheduling and publishing.",
  },
  {
    icon: TrendingUp,
    title: "Performance in plain English",
    body: "Simple, honest metrics — reach, engagement, top posts — without the analytics headache.",
  },
];

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <WaveLogo />
        <div className="flex items-center gap-3">
          <Link
            to="/auth"
            className="rounded-full border border-border bg-surface/60 px-4 py-2 text-sm font-medium text-foreground/90 backdrop-blur transition-colors hover:bg-elevated"
          >
            Sign in
          </Link>
        </div>
      </nav>

      <main className="relative mx-auto max-w-6xl px-6 pt-16 pb-24 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px] shadow-primary/80" />
            A Dream Wave Media platform
          </span>
          <h1 className="mt-6 text-balance text-5xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-6xl md:text-7xl">
            Create. Approve.{" "}
            <span className="text-gradient-primary">Schedule. Grow.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
            WaveOS is the content operating system for Dream Wave Media clients. Your
            content, social accounts, analytics, and brand voice — organized in one
            calm, cinematic place.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/auth"
              className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all hover:brightness-110"
            >
              Sign in to your workspace
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="https://dreamwavemedia.co"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-6 py-3 text-sm font-medium text-foreground backdrop-blur transition-colors hover:bg-elevated"
            >
              Learn about Dream Wave Media
            </a>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            WaveOS is invite‑only. Contact Dream Wave Media to get access.
          </p>
        </div>

        <div className="mt-24 grid gap-4 sm:grid-cols-2">
          {highlights.map((h) => (
            <div
              key={h.title}
              className="surface-card p-6 transition-all hover:border-border-strong hover:shadow-[var(--shadow-glow)]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                <h.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                {h.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {h.body}
              </p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-border/60 bg-surface/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-xs text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <WaveLogo compact />
          </div>
          <p>
            © {new Date().getFullYear()} Dream Wave Media. Powered by WaveOS.
          </p>
        </div>
      </footer>
    </div>
  );
}
