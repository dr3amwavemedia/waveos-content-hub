import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ExternalLink, Loader2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { analyzeSeoGrowth } from "@/lib/seo-growth.functions";

type SeoResult = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof analyzeSeoGrowth>>>>;

export function SeoGrowthPanel({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const analyze = useServerFn(analyzeSeoGrowth);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function run() {
    if (!website.trim() || busy) return;
    setBusy(true);
    try {
      const next = await analyze({ data: { workspaceId, website } });
      setResult(next);
      setWebsite(next.website);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "SEO audit could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-4 sm:p-5">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="h-4 w-4" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em]">SEO Growth</p>
        </div>
        <h2 className="mt-2 text-xl font-semibold">Help {workspaceName} show up more clearly online</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the public business website. WaveOS checks accessible public signals and turns them into a short, prioritized action plan. No private Google data or ranking promises.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
            <input
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void run();
                }
              }}
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="yourbusiness.com"
              className="min-h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <Button onClick={() => void run()} disabled={!website.trim() || busy} className="min-h-11">
            {busy ? <Loader2 className="animate-spin" /> : <Search />}
            {busy ? "Checking…" : "Build SEO plan"}
          </Button>
        </div>
      </div>

      {result && (
        <div className="space-y-4">
          <div className="surface-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">What WaveOS found</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{result.summary}</p>
            {result.quickWins?.length > 0 && (
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {result.quickWins.slice(0, 3).map((win: string, index: number) => (
                  <div key={index} className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
                    {win}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            {result.actions.map((action: any, index: number) => (
              <details key={`${action.title}-${index}`} className="group rounded-xl border border-border bg-card">
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                    action.priority === "high"
                      ? "bg-destructive/12 text-destructive"
                      : action.priority === "medium"
                        ? "bg-warning/12 text-warning"
                        : "bg-primary/10 text-primary"
                  }`}>
                    {action.priority}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{action.title}</p>
                    <p className="text-[11px] text-muted-foreground">{action.category}</p>
                  </div>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
                </summary>
                <div className="border-t border-border px-4 py-4">
                  <p className="text-sm text-muted-foreground">{action.why}</p>
                  <ol className="mt-3 space-y-2">
                    {action.steps.map((step: string, stepIndex: number) => (
                      <li key={stepIndex} className="flex gap-2 text-sm">
                        <span className="font-semibold text-primary">{stepIndex + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {action.sources.map((url: string, sourceIndex: number) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
                      >
                        Source {sourceIndex + 1} <ExternalLink className="h-3 w-3" />
                      </a>
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer font-semibold">Methodology & limits</summary>
            <p className="mt-2">{result.methodology}</p>
            {result.limitations?.map((item: string, index: number) => (
              <p className="mt-1" key={index}>{item}</p>
            ))}
          </details>
        </div>
      )}
    </section>
  );
}
