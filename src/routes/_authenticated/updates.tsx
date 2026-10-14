import { createFileRoute } from "@tanstack/react-router";
import { Bell, Check, ExternalLink, Loader2, RotateCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  ProductReleaseProvider,
  ReleaseStatus,
  formatReleaseDate,
  useProductReleaseCenter,
} from "@/components/app/product-releases";
import { Switch } from "@/components/ui/switch";
import { safeReleaseLink } from "@/hooks/use-product-releases";

export const Route = createFileRoute("/_authenticated/updates")({
  component: () => (
    <ProductReleaseProvider autoOpen={false}>
      <UpdatesPage />
    </ProductReleaseProvider>
  ),
  head: () => ({
    meta: [{ title: "What’s New — WaveOS" }, { name: "robots", content: "noindex" }],
  }),
});

function UpdatesPage() {
  const center = useProductReleaseCenter();

  const setAutoShow = async (value: boolean) => {
    try {
      await center.setAutoShow(value);
      toast.success(
        value
          ? "Automatic update popups are on."
          : "Automatic update popups are off. Your update history stays here.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Your preference could not be saved.");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="h-4 w-4" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em]">WaveOS updates</p>
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          What&apos;s new
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Updates shown here match your current workspace, plan, and role. Tools that are not
          included in your workspace are not advertised as available.
        </p>
      </header>

      <section className="surface-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Bell className="h-5 w-5" />
          </span>
          <div>
            <label htmlFor="release-popup-preference" className="font-semibold text-foreground">
              Show update popups
            </label>
            <p className="mt-1 text-sm text-muted-foreground">
              Turn this off to stop automatic popups. You can always return to this page.
            </p>
          </div>
        </div>
        <div className="flex min-h-11 items-center justify-between gap-3 sm:justify-end">
          <span className="text-xs font-semibold text-muted-foreground">
            {center.autoShow ? "On" : "Off"}
          </span>
          <Switch
            id="release-popup-preference"
            checked={center.autoShow}
            disabled={center.preferencePending || center.isPending}
            onCheckedChange={(value) => void setAutoShow(value)}
            aria-label="Show update popups"
            className="h-6 w-11 data-[state=checked]:bg-primary"
          />
        </div>
      </section>

      {center.isPending ? (
        <div className="surface-card flex min-h-40 items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading updates…
        </div>
      ) : center.isError ? (
        <div role="alert" className="surface-card p-6 text-center">
          <h2 className="font-semibold text-foreground">Updates could not be loaded</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Check your connection and try again. Your workspace is otherwise unaffected.
          </p>
          <button
            type="button"
            onClick={() => void center.refetch()}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-foreground"
          >
            <RotateCw className="h-4 w-4" /> Try again
          </button>
        </div>
      ) : center.releases.length === 0 ? (
        <div className="surface-card p-8 text-center">
          <Sparkles className="mx-auto h-6 w-6 text-primary" />
          <h2 className="mt-3 font-semibold text-foreground">No updates for this workspace yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Applicable release notes will appear here after they are published.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {center.releases.map((release) => {
            const link = safeReleaseLink(release.link_url);
            return (
              <article key={release.id} className="surface-card p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <ReleaseStatus release={release} />
                      <span className="text-xs text-muted-foreground">
                        Version {release.version}
                      </span>
                      <span aria-hidden className="text-xs text-muted-foreground">
                        ·
                      </span>
                      <time
                        dateTime={release.published_at}
                        className="text-xs text-muted-foreground"
                      >
                        {formatReleaseDate(release.published_at)}
                      </time>
                    </div>
                    <h2 className="mt-2 text-xl font-semibold text-foreground">{release.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {release.summary}
                    </p>
                  </div>
                </div>

                {release.body.trim() && (
                  <details className="mt-4 rounded-xl border border-border bg-background/35 px-4 py-3">
                    <summary className="min-h-8 cursor-pointer text-sm font-semibold text-foreground">
                      View details
                    </summary>
                    <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                      {release.body}
                    </p>
                  </details>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {!release.state?.acknowledged_at && (
                    <button
                      type="button"
                      disabled={center.statePending}
                      onClick={async () => {
                        try {
                          await center.markState({ release, action: "acknowledge" });
                          toast.success("Update marked as read.");
                        } catch (error) {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "This update could not be marked as read.",
                          );
                        }
                      }}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {center.statePending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      Got it
                    </button>
                  )}
                  {link && (
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-elevated"
                    >
                      Learn more <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
