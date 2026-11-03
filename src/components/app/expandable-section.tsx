import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/** Keep existing document deep links useful when their lists are collapsed. */
export function ExpandableSection({
  id,
  title,
  children,
  className,
  style,
}: {
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const element = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const hash = useRouterState({ select: (state) => state.location.hash });
  useEffect(() => {
    const reveal = () => {
      if (window.location.hash === `#${id}`) setOpen(true);
    };
    if (hash.replace(/^#/, "") === id) setOpen(true);
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [hash, id]);
  return (
    <section ref={element} id={id} className={className} style={style}>
      <button
        type="button"
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/10 px-4 text-left transition-colors hover:bg-primary/15"
        aria-expanded={open}
        aria-controls={`${id}-content`}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <span className="block text-sm font-semibold text-foreground">{title}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {open ? "Hide section" : "Open section"}
          </span>
        </span>
        <ChevronDown
          className={cn("size-5 text-primary transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div id={`${id}-content`} className="mt-4">
          {children}
        </div>
      )}
    </section>
  );
}
