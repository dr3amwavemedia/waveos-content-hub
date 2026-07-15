import { cn } from "@/lib/utils";

interface WaveLogoProps {
  compact?: boolean;
  className?: string;
}

/**
 * WaveOS wordmark. Uses only WaveOS + Dream Wave Media branding — never
 * references any third-party publishing infrastructure.
 */
export function WaveLogo({ compact, className }: WaveLogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary-glow shadow-[0_0_24px_-4px_var(--color-primary)]">
        <svg
          viewBox="0 0 32 32"
          className="h-5 w-5 text-primary-foreground"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 18c3-4 6-4 9 0s6 4 9 0 6-4 8 0" />
          <path d="M3 12c3-4 6-4 9 0s6 4 9 0 6-4 8 0" opacity="0.6" />
        </svg>
      </span>
      <div className="flex flex-col leading-none">
        <span className="text-sm font-bold tracking-tight text-foreground">
          WaveOS
        </span>
        {!compact && (
          <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            by Dream Wave Media
          </span>
        )}
      </div>
    </div>
  );
}
