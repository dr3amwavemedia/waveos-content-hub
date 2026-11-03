import type { HTMLAttributes, ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export function OceanPage({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ocean-page space-y-6 sm:space-y-8", className)} {...props} />;
}

export function OceanHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="ocean-hero">
      <div className="relative z-[1] min-w-0">
        {eyebrow && <div className="ocean-eyebrow">{eyebrow}</div>}
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-foreground sm:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
            {description}
          </p>
        )}
      </div>
      {action && <div className="relative z-[1] shrink-0">{action}</div>}
    </header>
  );
}

export function OceanPanel({
  className,
  title,
  eyebrow,
  description,
  action,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={cn("ocean-panel p-4 sm:p-6", className)} {...props}>
      {(title || eyebrow || description || action) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow && <div className="ocean-eyebrow">{eyebrow}</div>}
            {title && (
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{title}</h2>
            )}
            {description && (
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function OceanDisclosure({
  summary,
  children,
  className,
  open,
  id,
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  open?: boolean;
  id?: string;
}) {
  return (
    <details id={id} open={open} className={cn("ocean-disclosure group", className)}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground marker:content-none sm:px-5">
        <span>{summary}</span>
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-primary transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-border/70 p-4 sm:p-5">{children}</div>
    </details>
  );
}

export function OceanStatus({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "warning";
}) {
  return <span className={cn("ocean-status", `ocean-status-${tone}`)}>{children}</span>;
}
