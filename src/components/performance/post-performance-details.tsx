import type { LivePost } from "@/lib/live-posts";
import { PERFORMANCE_METRICS } from "@/lib/social-performance";
import { formatFreshness, METRIC_LABELS, MetricValue } from "./metric-value";
import { useSocialPerformance } from "./use-social-performance";

/**
 * Expandable stored performance for one exact provider copy. Display only:
 * analytics never creates, keeps or hides a published card.
 */
export function PostPerformanceDetails({ post, workspaceId }: { post: LivePost; workspaceId: string }) {
  const perf = useSocialPerformance({ workspaceId, days: 365, platform: post.platform, accountId: post.accountId, enabled: Boolean(post.platformPostId) });
  const copy = perf.data?.current.copies.find((c) => c.providerPostId === post.platformPostId);
  return (
    <details className="mt-4 rounded-xl border border-border bg-elevated/40">
      <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold text-foreground">Performance details</summary>
      <div className="border-t border-border p-4 text-sm">
        {!post.platformPostId && <p className="text-muted-foreground">The network didn't report a post ID for this copy, so its numbers can't be matched.</p>}
        {post.platformPostId && perf.isPending && <p className="text-muted-foreground">Loading…</p>}
        {post.platformPostId && perf.data && !copy && (
          <p className="text-muted-foreground">No provider numbers have been stored for this copy yet. They're saved when this library syncs.</p>
        )}
        {copy && (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              {PERFORMANCE_METRICS.map((k) => {
                const m = copy.metrics[k];
                return (
                  <div key={k} className="flex items-baseline justify-between gap-2">
                    <dt className="text-xs text-muted-foreground">{METRIC_LABELS[k] ?? k}</dt>
                    <dd>{m ? <MetricValue value={m.value} availability={m.availability} className="text-sm" /> : <span className="text-xs text-muted-foreground">not reported</span>}</dd>
                  </div>
                );
              })}
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              {copy.contentType} · last analytics sync {formatFreshness(copy.capturedAt)} · {Object.keys(copy.metrics).length}/{PERFORMANCE_METRICS.length} metrics reported. Clicks and DMs are interactions, not people.
            </p>
          </>
        )}
        {post.url && (
          <a href={post.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center font-semibold text-primary">View on network</a>
        )}
      </div>
    </details>
  );
}
