import { AlertCircle, CheckCircle2, CircleDot, ShieldAlert } from "lucide-react";
import type { CampaignReadinessCheck } from "@/lib/campaign-readiness";

const stateMeta = {
  ready: { label: "Ready", icon: CheckCircle2, tone: "text-emerald-300" },
  limited: { label: "Limited", icon: CircleDot, tone: "text-amber-200" },
  action_needed: { label: "Action needed", icon: AlertCircle, tone: "text-amber-300" },
  admin_required: { label: "Admin required", icon: ShieldAlert, tone: "text-rose-300" },
} as const;

export function CampaignReadinessPanel({ checks }: { checks: CampaignReadinessCheck[] }) {
  const ready = checks.filter((check) => check.state === "ready").length;
  return (
    <section className="rounded-2xl border border-primary/20 bg-background/50 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Campaign readiness
          </p>
          <h2 className="mt-1 text-lg font-semibold">
            Know what WaveOS can verify before building
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {ready}/{checks.length} sources ready. Limited evidence is labeled and never treated as
            zero or current.
          </p>
        </div>
        <a
          href="/my-agent?fix=campaign-readiness"
          className="inline-flex min-h-10 items-center rounded-xl border border-primary/30 px-3 text-xs font-semibold text-primary"
        >
          Fix with My Agent
        </a>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {checks.map((check) => {
          const meta = stateMeta[check.state];
          const Icon = meta.icon;
          return (
            <article key={check.key} className="rounded-xl border border-border bg-elevated/45 p-3">
              <div className={`flex items-center gap-2 text-xs font-semibold ${meta.tone}`}>
                <Icon className="h-4 w-4" /> {meta.label}
              </div>
              <h3 className="mt-2 text-sm font-semibold">{check.label}</h3>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{check.detail}</p>
              {check.lastSuccessAt && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Last success: {new Date(check.lastSuccessAt).toLocaleString()}
                </p>
              )}
              {check.actionLabel && check.actionHref && (
                <a
                  href={check.actionHref}
                  className="mt-2 inline-block text-xs font-semibold text-primary"
                >
                  {check.actionLabel} →
                </a>
              )}
              {check.actionLabel && !check.actionHref && (
                <p className="mt-2 text-xs font-semibold text-amber-200">{check.actionLabel}</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
