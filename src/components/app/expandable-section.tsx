import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

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
  const element = useRef<HTMLDetailsElement>(null);
  const hash = useRouterState({ select: (state) => state.location.hash });
  useEffect(() => {
    const reveal = () => {
      if (window.location.hash === `#${id}` && element.current) element.current.open = true;
    };
    if (hash.replace(/^#/, "") === id && element.current) element.current.open = true;
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [hash, id]);
  return (
    <details ref={element} id={id} className={className} style={style}>
      <summary className="min-h-11 cursor-pointer font-serif text-xl">{title}</summary>
      {children}
    </details>
  );
}
