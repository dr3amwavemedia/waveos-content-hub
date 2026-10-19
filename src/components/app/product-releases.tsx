import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  safeReleaseLink,
  useProductReleases,
  type ApplicableRelease,
} from "@/hooks/use-product-releases";

type ProductReleaseContextValue = ReturnType<typeof useProductReleases> & {
  openRelease: (releaseId: string) => void;
};

const ProductReleaseContext = createContext<ProductReleaseContextValue | null>(null);

export function ProductReleaseProvider({
  children,
  autoOpen = true,
}: {
  children: ReactNode;
  autoOpen?: boolean;
}) {
  const center = useProductReleases();
  const navigate = useNavigate();
  const [openReleaseId, setOpenReleaseId] = useState<string | null>(null);
  const autoOpened = useRef(new Set<string>());
  const release = center.releases.find((item) => item.id === openReleaseId) ?? null;
  const publicPlan = center.audience?.publicPlan ?? null;
  const displayBody = release ? releaseBodyForPlan(release.body, publicPlan) : "";

  useEffect(() => {
    if (!autoOpen || !center.popupRelease) return;
    if (autoOpened.current.has(center.popupRelease.id)) return;
    const nextRelease = center.popupRelease;
    autoOpened.current.add(nextRelease.id);
    setOpenReleaseId(nextRelease.id);
    // Viewing once is enough to prevent the same announcement from auto-opening
    // on a later login. Close/minimize can still record dismissal for history.
    // Persist immediately on display so a refresh, another device or a later login
    // can never auto-show this exact release again; closing then records dismissal.
    void center.markState({ release: nextRelease, action: "view" }).catch(() => {
      // The announcement remains usable even if the view receipt cannot be saved.
    });
  }, [autoOpen, center.popupRelease]);

  const value = useMemo<ProductReleaseContextValue>(
    () => ({ ...center, openRelease: setOpenReleaseId }),
    [center],
  );

  const dismiss = async () => {
    const current = release;
    setOpenReleaseId(null);
    if (!current || current.state?.dismissed_at || current.state?.acknowledged_at) return;
    try {
      await center.markState({
        release: { ...current, state: current.state ?? null },
        action: "dismiss",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "This update could not be dismissed.");
    }
  };

  const acknowledge = async () => {
    if (!release) return;
    try {
      await center.markState({ release, action: "acknowledge" });
      setOpenReleaseId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "This update could not be saved.");
    }
  };

  const openHistory = async () => {
    if (release && !release.state?.dismissed_at && !release.state?.acknowledged_at) {
      try {
        await center.markState({ release, action: "dismiss" });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "This update could not be saved.");
        return;
      }
    }
    setOpenReleaseId(null);
    await navigate({ to: "/updates" });
  };

  return (
    <ProductReleaseContext.Provider value={value}>
      {children}
      <Dialog
        open={Boolean(release)}
        onOpenChange={(open) => {
          if (!open) void dismiss();
        }}
      >
        {release && (
          <DialogContent data-waveos-product-release className="max-h-[min(42rem,calc(100dvh-2rem))] w-[calc(100%-1.5rem)] max-w-xl overflow-y-auto rounded-2xl border-border p-5 sm:p-6">
            <DialogHeader className="pr-9 text-left">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                  <Sparkles className="h-3.5 w-3.5" /> New update
                </span>
                <span className="text-xs text-muted-foreground">Version {release.version}</span>
                {publicPlan && (
                  <span className="rounded-full border border-border bg-elevated px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                    Your plan: {publicPlanName(publicPlan)}
                  </span>
                )}
              </div>
              <DialogTitle className="text-2xl leading-tight">{release.title}</DialogTitle>
              <DialogDescription className="pt-1 text-sm leading-6">
                {release.summary}
              </DialogDescription>
            </DialogHeader>

            {displayBody.trim() && (
              <div className="max-h-40 overflow-hidden whitespace-pre-line rounded-xl border border-border bg-surface/55 p-4 text-sm leading-6 text-foreground/90 sm:max-h-none">
                {displayBody}
              </div>
            )}
            {(publicPlan === "standard" || publicPlan === "trial") && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
                <span className="font-semibold text-foreground">Also available on Current & Tidal:</span>{" "}
                Creative Studio, Campaign Manager and Trending Now.
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Published {formatReleaseDate(release.published_at)}
            </p>

            <DialogFooter className="gap-2 sm:space-x-0">
              {safeReleaseLink(release.link_url) && (
                <a
                  href={safeReleaseLink(release.link_url)!}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-elevated"
                >
                  Learn more <ExternalLink className="h-4 w-4" />
                </a>
              )}
              <button
                type="button"
                onClick={() => void openHistory()}
                disabled={center.statePending}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary hover:bg-primary/15 disabled:opacity-60"
              >
                See what&apos;s new <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void acknowledge()}
                disabled={center.statePending}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {center.statePending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Got it
              </button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </ProductReleaseContext.Provider>
  );
}

export function useProductReleaseCenter() {
  const context = useContext(ProductReleaseContext);
  if (!context) {
    throw new Error("useProductReleaseCenter must be used inside ProductReleaseProvider");
  }
  return context;
}

export function WhatsNewCard() {
  const center = useProductReleaseCenter();
  const release = center.unreadReleases[0];
  if (!release) return null;
  return (
    <section className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card to-card p-5 shadow-[var(--shadow-glow)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-4 w-4" /> What&apos;s new
            </span>
            <span className="text-xs text-muted-foreground">Version {release.version}</span>
          </div>
          <h2 className="mt-2 text-xl font-semibold text-foreground">{release.title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {release.summary}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            to="/updates"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background/50 px-4 text-sm font-semibold text-foreground"
          >
            All updates
          </Link>
          <button
            type="button"
            disabled={center.statePending}
            onClick={() => center.openRelease(release.id)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            View update <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

export function formatReleaseDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function ReleaseStatus({ release }: { release: ApplicableRelease }) {
  if (release.state?.acknowledged_at) {
    return <span className="text-xs font-medium text-emerald-300">Read</span>;
  }
  return <span className="text-xs font-medium text-primary">New</span>;
}


function publicPlanName(plan: string) {
  if (plan === "standard") return "Ripple";
  if (plan === "full") return "Current";
  if (plan === "expanded") return "Tidal";
  if (plan === "trial") return "Promo trial";
  return plan;
}

function releaseBodyForPlan(body: string, plan: string | null) {
  if (plan !== "standard" && plan !== "trial") return body;
  return body
    .split("\n")
    .filter(
      (line) =>
        !/creative studio|campaign manager|trending now|competitive intelligence/i.test(line),
    )
    .slice(0, 8)
    .join("\n")
    .trim();
}
