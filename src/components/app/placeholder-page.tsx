import type { LucideIcon } from "lucide-react";

export function PlaceholderPage({
  icon: Icon,
  title,
  subtitle,
  phase,
  bullets,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  phase: string;
  bullets: string[];
}) {
  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
          {phase}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {subtitle}
        </p>
      </header>
      <div className="surface-card p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-foreground">
              Coming in the next phase
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Dream Wave Media is building this out. Here's what will land here:
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {bullets.map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-2 rounded-lg border border-border bg-surface/50 px-3 py-2 text-sm text-foreground/90"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_8px] shadow-primary/70" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
