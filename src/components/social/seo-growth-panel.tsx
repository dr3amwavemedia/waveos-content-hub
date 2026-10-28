import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ChevronDown, ExternalLink, Loader2, Search, Sparkles, Target } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { analyzeSeoGrowth } from "@/lib/seo-growth.functions";

function compactText(value: string, max = 150) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const clipped = clean.slice(0, max);
  const sentence = clipped.match(/^(.+?[.!?])(?:\s|$)/);
  return (sentence?.[1] ?? clipped.replace(/\s+\S*$/, "")).trim() + "…";
}

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
    <section className="space-y-4 pb-4">
      <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-4 sm:p-5">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="h-4 w-4" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em]">SEO Growth</p>
        </div>
        <h2 className="mt-2 text-xl font-semibold">Find the next SEO moves</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Add a public website and WaveOS will turn what it can verify into a short action plan.
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
        <div className="space-y-3">
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">SEO snapshot</p>
                <h3 className="mt-1 text-base font-semibold">What WaveOS found</h3>
              </div>
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <Target className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-3 text-sm leading-5 text-muted-foreground">
              {compactText(result.summary, 185)}
            </p>
          </section>

          {result.quickWins?.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Top 3 quick wins</h3>
                <span className="text-[11px] text-muted-foreground">Start here</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {result.quickWins.slice(0, 3).map((win: string, index: number) => (
                  <div
                    key={index}
                    className="flex min-h-20 gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                      {index + 1}
                    </span>
                    <p className="text-sm leading-5 text-foreground">{compactText(win, 110)}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Priority actions</h3>
              <span className="text-[11px] text-muted-foreground">Tap for steps</span>
            </div>

            {result.actions.map((action: any, index: number) => (
              <details key={`${action.title}-${index}`} className="group overflow-hidden rounded-xl border border-border bg-card">
                <summary className="cursor-pointer list-none px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                      action.priority === "high"
                        ? "bg-destructive/12 text-destructive"
                        : action.priority === "medium"
                          ? "bg-warning/12 text-warning"
                          : "bg-primary/10 text-primary"
                    }`}>
                      {action.priority}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-5 text-foreground">{action.title}</p>
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        {compactText(action.why, 105)}
                      </p>
                    </div>

                    <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
                  </div>
                </summary>

                <div className="border-t border-border px-4 py-4">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-primary">
                    <span>{action.category}</span>
                    <ArrowRight className="h-3 w-3" />
                    <span>Next steps</span>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-muted-foreground">{action.why}</p>

                  <ol className="mt-4 space-y-3">
                    {action.steps.map((step: string, stepIndex: number) => (
                      <li key={stepIndex} className="flex gap-3 text-sm">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                          {stepIndex + 1}
                        </span>
                        <span className="leading-5">{step}</span>
                      </li>
                    ))}
                  </ol>

                  {action.sources?.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
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
                  )}
                </div>
              </details>
            ))}
          </section>

          <details className="rounded-xl border border-border/70 bg-card/60 px-4 py-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-semibold text-foreground">How this was checked</summary>
            <p className="mt-2 leading-5">{result.methodology}</p>
            {result.limitations?.map((item: string, index: number) => (
              <p className="mt-1 leading-5" key={index}>{item}</p>
            ))}
          </details>
        </div>
      )}
    </section>
  );
}
