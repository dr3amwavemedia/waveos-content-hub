import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/app/workspace-context";
import { PLATFORM_LABEL, type SocialPlatform } from "@/hooks/use-content";
import { cn } from "@/lib/utils";
import { formatInTimeZone } from "@/lib/date-time";
import { refreshPublishAttemptDetails } from "@/lib/publish.functions";
import type { Database } from "@/integrations/supabase/types";

export type PublishAttempt = Database["public"]["Tables"]["publish_attempts"]["Row"];

/** Per-network publishing results for one post, with failure details + refresh. */
export function PublishResults({ attempts }: { attempts: PublishAttempt[] }) {
  const { activeWorkspace } = useWorkspace();
  const timeZone = activeWorkspace?.timezone ?? "UTC";
  const [selected, setSelected] = useState<PublishAttempt | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshAttempt = useServerFn(refreshPublishAttemptDetails);
  const queryClient = useQueryClient();

  if (attempts.length === 0) return null;

  async function handleRefresh(attempt: PublishAttempt) {
    setRefreshing(true);
    try {
      const result = await refreshAttempt({ data: { attemptId: attempt.id } });
      await queryClient.invalidateQueries({ queryKey: ["publish-attempts"] });
      setSelected(null);
      if (result.status === "failed") {
        toast.error(result.errorMessage || "The provider still has not supplied a detailed reason.");
      } else {
        toast.success(result.status === "success" ? "Provider now reports this post as published." : "Provider reports that this post is still processing.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh provider details.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2 px-3.5 pb-1">
        {attempts.map((attempt) => {
          const label = PLATFORM_LABEL[attempt.platform as SocialPlatform] ?? attempt.platform;
          const content = (
            <>
              {attempt.status === "success" ? <CheckCircle2 className="h-3.5 w-3.5" /> : attempt.status === "failed" ? <AlertCircle className="h-3.5 w-3.5" /> : <CalendarClock className="h-3.5 w-3.5" />}
              {label}: {attempt.status}
            </>
          );
          const classes = cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1",
            attempt.status === "success"
              ? "bg-success/10 text-success ring-success/25"
              : attempt.status === "failed"
                ? "bg-destructive/10 text-destructive ring-destructive/25"
                : "bg-muted/20 text-muted-foreground ring-border",
          );
          return attempt.status === "failed" ? (
            <button
              key={attempt.id}
              type="button"
              onClick={() => setSelected(attempt)}
              className={cn(classes, "cursor-pointer hover:bg-destructive/20")}
              aria-label={`View ${label} publishing error`}
            >
              {content}
            </button>
          ) : (
            <span key={attempt.id} className={classes}>{content}</span>
          );
        })}
      </div>
      {selected && (
        <FailureDetails
          attempt={selected}
          timeZone={timeZone}
          onClose={() => setSelected(null)}
          onRefresh={() => handleRefresh(selected)}
          isRefreshing={refreshing}
        />
      )}
    </>
  );
}

function FailureDetails({
  attempt,
  timeZone,
  onClose,
  onRefresh,
  isRefreshing,
}: {
  attempt: PublishAttempt;
  timeZone: string;
  onClose: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const platform = PLATFORM_LABEL[attempt.platform as SocialPlatform] ?? attempt.platform;
  const guidance = failureGuidance(attempt.error_message, platform);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-error-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="surface-card w-full max-w-lg p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-destructive">Publishing failed</p>
            <h2 id="publish-error-title" className="mt-1 text-xl font-semibold text-foreground">{platform}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-elevated hover:text-foreground" aria-label="Close publishing error">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 rounded-xl border border-destructive/25 bg-destructive/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-destructive">Provider response</p>
          <p className="mt-2 break-words text-sm leading-6 text-foreground">
            {attempt.error_message || "The publishing provider did not return a detailed error message."}
          </p>
          {attempt.error_code && <p className="mt-2 text-xs text-muted-foreground">Error code: {attempt.error_code}</p>}
        </div>
        <div className="mt-4">
          <p className="text-sm font-semibold text-foreground">What to check</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{guidance}</p>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Attempted {formatInTimeZone(attempt.attempted_at, timeZone, { dateStyle: "medium", timeStyle: "short" })} {timeZone}
        </p>
        {attempt.ayrshare_post_id && (
          <p className="mt-1 break-all text-xs text-muted-foreground">Provider reference: {attempt.ayrshare_post_id}</p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh provider details
          </button>
          <Link to="/social" search={{ view: "accounts" }} className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-elevated">Check social account</Link>
          <Link to="/create" search={{ id: attempt.content_item_id }} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Open and retry post</Link>
        </div>
      </div>
    </div>
  );
}

function failureGuidance(message: string | null, platform: string) {
  const error = (message ?? "").toLowerCase();
  if (/without returning a detailed platform message|does not identify the content/.test(error)) {
    return `The provider did not identify a cause. Refresh the provider details above. If no additional reason appears, use the provider reference when contacting support rather than changing content that already works on ${platform}.`;
  }
  if (/connect|account|profile|authorization|authori[sz]ed|token|permission/.test(error)) {
    return `Reconnect ${platform} under Social accounts, confirm the correct profile is selected, then reopen this post and publish it again.`;
  }
  if (/media|image|video|aspect|ratio|duration|size|format|resolution/.test(error)) {
    return `Review ${platform}'s media requirements. Adjust the file format, dimensions, duration, or size, then reopen this post and retry.`;
  }
  if (/caption|text|character|hashtag|mention/.test(error)) {
    return `Review the ${platform} caption for unsupported mentions, hashtags, links, or length, then retry the post.`;
  }
  return `Confirm ${platform} is connected and permitted to publish, review the provider response above, then reopen this post and retry. Networks that already succeeded will not be posted twice.`;
}
