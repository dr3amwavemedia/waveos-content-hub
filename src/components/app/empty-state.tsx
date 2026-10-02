import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: { label: string; to: string };
  tone?: string;
}) {
  const panelStyle = tone
    ? ({
        borderColor: `color-mix(in oklab, ${tone} 28%, transparent)`,
        background: `linear-gradient(145deg, color-mix(in oklab, ${tone} 10%, var(--card)), var(--card) 62%)`,
      } satisfies CSSProperties)
    : undefined;
  const iconStyle = tone
    ? ({
        color: tone,
        backgroundColor: `color-mix(in oklab, ${tone} 13%, transparent)`,
        borderColor: `color-mix(in oklab, ${tone} 28%, transparent)`,
      } satisfies CSSProperties)
    : undefined;
  return (
    <div
      className="surface-card flex flex-col items-center justify-center gap-3 p-10 text-center"
      style={panelStyle}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary"
        style={iconStyle}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-base font-semibold text-foreground">{title}</div>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      </div>
      {action && (
        <Link
          to={action.to}
          className="mt-2 rounded-full border border-border bg-elevated px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-surface-2"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
