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
import { ArrowRight, BellOff, Check, ExternalLink, Loader2, Sparkles } from "lucide-react";
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

  useEffect(() => {
    if (!autoOpen || !center.autoShow || !center.popupRelease) return;
    if (autoOpened.current.has(center.popupRelease.id)) return;
    autoOpened.current.add(center.popupRelease.id);
    setOpenReleaseId(center.popupRelease.id);
  }, [autoOpen, center.autoShow, center.popupRelease]);

  const value = useMemo<ProductReleaseContextValue>(
    () => ({ ...center, openRelease: setOpenReleaseId }),
    [center],
  );

  const dismiss = async () => {
    const current = release;
    setOpenReleaseId(null);
    if (!current || current.state?.dismissed_at || current.state?.acknowledged_at) return;
    try {
      await center.markState({ release: current, action: "dismiss" });
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

  const disablePopups = async () => {
    try {
      await center.setAutoShow(false);
      toast.success("Automatic update popups are off. Updates remain available in What’s New.");
      await dismiss();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Your update preference could not be saved.",
      );
    }
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
          <DialogContent className="max-h-[min(42rem,calc(100dvh-2rem))] w-[calc(100%-1.5rem)] max-w-xl overflow-y-auto rounded-2xl border-border p-5 sm:p-6">
            <DialogHeader className="pr-9 text-left">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                  <Sparkles className="h-3.5 w-3.5" /> What&apos;s new
                </span>
                <span className="text-xs text-muted-foreground">Version {release.version}</span>
              </div>
              <DialogTitle className="text-2xl leading-tight">{release.title}</DialogTitle>
              <DialogDescription className="pt-1 text-sm leading-6">
                {release.summary}
              </DialogDescription>
            </DialogHeader>

            {release.body.trim() && (
              <div className="whitespace-pre-line rounded-xl border border-border bg-surface/55 p-4 text-sm leading-6 text-foreground/90">
                {release.body}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Published {formatReleaseDate(release.published_at)}
            </p>

            <button
              type="button"
              onClick={() => void disablePopups()}
              disabled={center.preferencePending || center.statePending}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm font-medium text-muted-foreground hover:bg-elevated hover:text-foreground disabled:opacity-60 sm:w-auto"
            >
              {center.preferencePending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BellOff className="h-4 w-4" />
              )}
              Don&apos;t show update popups
            </button>

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
                View updates <ArrowRight className="h-4 w-4" />
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
