import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Cloud,
  Eye,
  ImagePlus,
  PenSquare,
  Share2,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { useCurrentUser } from "@/hooks/use-waveos";
import { useWorkspace } from "@/components/app/workspace-context";
import { Section } from "@/components/app/section";
import { EmptyState } from "@/components/app/empty-state";
import { StatCard } from "@/components/app/stat-card";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomeDashboard,
  head: () => ({ meta: [{ title: "Home — WaveOS" }] }),
});

function HomeDashboard() {
  const { data: user } = useCurrentUser();
  const { activeWorkspace } = useWorkspace();
  const greeting = getGreeting();
  const firstName = user?.firstName?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {activeWorkspace?.name ?? "WaveOS"}
          </p>
          <h1 className="mt-2 truncate text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {greeting}, {firstName}.
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here's what's happening with your content.
          </p>
        </div>
        <Link
          to="/create"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all hover:brightness-110"
        >
          <PenSquare className="h-4 w-4" />
          Create post
        </Link>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard icon={CalendarDays} label="Scheduled" value="0" tone="primary" />
        <StatCard icon={CheckCircle2} label="Awaiting approval" value="0" tone="warning" />
        <StatCard icon={Cloud} label="Published this month" value="0" />
        <StatCard icon={Eye} label="Reach (30d)" value="—" />
        <StatCard icon={Share2} label="Accounts connected" value="0" />
      </div>

      {/* Upcoming content */}
      <Section
        title="Upcoming content"
        subtitle="The next few posts scheduled for your brand."
      >
        <EmptyState
          icon={CalendarDays}
          title="Your calendar is clear."
          body="Once Dream Wave Media prepares your next batch, it will show up here for review and scheduling."
          action={{ label: "Open calendar", to: "/calendar" }}
        />
      </Section>

      {/* Two columns */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section
            title="Needs your attention"
            subtitle="Posts awaiting approval, failed publishes, or accounts that need reconnecting."
          >
            <EmptyState
              icon={CheckCircle2}
              title="All caught up."
              body="Nothing needs your review right now."
            />
          </Section>
        </div>

        <Section
          title="Recent performance"
          subtitle="A quick pulse on how your content is doing."
        >
          <EmptyState
            icon={TrendingUp}
            title="No data yet."
            body="Analytics will appear after your first posts begin receiving activity."
          />
        </Section>
      </div>

      {/* Quick actions */}
      <Section title="Quick actions" subtitle="Common things you can do right now.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <QuickAction
            to="/content"
            label="Upload content"
            icon={ImagePlus}
            description="Add photos or videos to your library."
          />
          <QuickAction
            to="/create"
            label="Create a post"
            icon={PenSquare}
            description="Build a post with per‑platform captions."
          />
          <QuickAction
            to="/calendar"
            label="View calendar"
            icon={CalendarDays}
            description="See what's coming up next."
          />
          <QuickAction
            to="/social-accounts"
            label="Connect account"
            icon={Share2}
            description="Link Instagram, Facebook, and more."
          />
          <QuickAction
            to="/brand-voice"
            label="Refine brand voice"
            icon={Sparkles}
            description="Teach WaveOS how your brand sounds."
          />
        </div>
      </Section>
    </div>
  );
}

function QuickAction({
  to,
  label,
  icon: Icon,
  description,
}: {
  to: string;
  label: string;
  icon: typeof PenSquare;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="group surface-card flex flex-col gap-2 p-4 transition-all hover:border-border-strong hover:shadow-[var(--shadow-glow)]"
    >
      <div className="flex items-center justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/20">
          <Icon className="h-4 w-4" />
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
      <div className="text-sm font-semibold text-foreground">{label}</div>
      <div className="text-xs text-muted-foreground">{description}</div>
    </Link>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
