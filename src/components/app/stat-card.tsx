import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "primary" | "warning" | "success";
}) {
  const toneStyles = {
    default: "text-muted-foreground",
    primary: "text-primary",
    warning: "text-warning",
    success: "text-success",
  }[tone];

  return (
    <div className="surface-card group relative overflow-hidden p-4 transition-all hover:border-border-strong">
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-px opacity-0 transition-opacity group-hover:opacity-100",
          tone === "primary" && "bg-gradient-to-r from-transparent via-primary to-transparent",
        )}
      />
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <Icon className={cn("h-4 w-4", toneStyles)} />
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight text-foreground">
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}
