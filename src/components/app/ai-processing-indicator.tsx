import { cn } from "@/lib/utils";

export function SurferWaveSpinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("relative inline-flex size-7 shrink-0 items-center justify-center", className)}
    >
      <span className="absolute inset-0 rounded-full border-2 border-cyan-300/25 border-t-cyan-300 motion-safe:animate-spin" />
      <span className="relative text-sm leading-none motion-safe:animate-bounce">🏄</span>
    </span>
  );
}

export function AiProcessingIndicator({
  label = "Catching the right wave…",
  detail,
  className,
}: {
  label?: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex w-fit items-center gap-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/[.06] px-4 py-3 text-cyan-50",
        className,
      )}
    >
      <SurferWaveSpinner className="size-9" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {detail ? <span className="mt-0.5 block text-xs text-cyan-100/70">{detail}</span> : null}
      </span>
    </div>
  );
}
