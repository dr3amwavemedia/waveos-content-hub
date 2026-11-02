import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/app/workspace-context";
import { PLATFORM_LABEL, type SocialPlatform } from "@/hooks/use-content";
import { cn } from "@/lib/utils";
import { formatInTimeZone } from "@/lib/date-time";
import { refreshPublishAttemptDetails, unpublishPublishAttempt } from "@/lib/publish.functions";
import { failureGuidance, hasProviderReference } from "@/lib/publish-failure-guidance";
import {
  isUnpublishConfirmation,
  publishedAttemptActions,
  UNPUBLISH_CONFIRMATION,
  unsupportedUnpublishMessage,
} from "@/lib/published-post-management";
import type { Database } from "@/integrations/supabase/types";
import { readTargetSummary, TARGET_LABELS } from "@/lib/publish-targets";

export type PublishAttempt = Database["public"]["Tables"]["publish_attempts"]["Row"];

/** "Instagram (account …e20f01d)" for each destination the request contained. */
function sentTargets(snapshot: unknown) {
  const summary = readTargetSummary(snapshot);
  const platforms =
    summary?.platforms ??
    (Array.isArray((snapshot as { platforms?: unknown } | null)?.platforms)
      ? ((snapshot as { platforms: Array<{ platform?: unknown; accountId?: unknown }> }).platforms
          .filter((entry) => typeof entry?.platform === "string" && typeof entry?.accountId === "string")
          .map((entry) => ({ platform: entry.platform as string, accountId: entry.accountId as string })))
      : []);
  return platforms.map(
    (target) => `${TARGET_LABELS[target.platform] ?? target.platform} (account …${target.accountId.slice(-7)})`,
  );
}

const platformLabel = (attempt: PublishAttempt) =>
  PLATFORM_LABEL[attempt.platform as SocialPlatform] ?? attempt.platform;

/** Chip for one network's result. Published and failed results open the dialog. */
export function PublishAttemptChip({
  attempt,
  onOpen,
}: {
  attempt: PublishAttempt;
  onOpen: (attempt: PublishAttempt) => void;
}) {
  const label = platformLabel(attempt);
  const removed = attempt.status === "success" && Boolean(attempt.unpublished_at);
  const content = (
    <>
      {removed ? (
        <Trash2 className="h-3.5 w-3.5" />
      ) : attempt.status === "success" ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : attempt.status === "failed" ? (
        <AlertCircle className="h-3.5 w-3.5" />
      ) : (
        <CalendarClock className="h-3.5 w-3.5" />
      )}
      {label}: {removed ? "removed" : attempt.status}
    </>
  );
  const classes = cn(
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1",
    removed
      ? "bg-muted/20 text-muted-foreground ring-border"
      : attempt.status === "success"
        ? "bg-success/10 text-success ring-success/25"
        : attempt.status === "failed"
          ? "bg-destructive/10 text-destructive ring-destructive/25"
          : "bg-muted/20 text-muted-foreground ring-border",
  );
  if (attempt.status !== "failed" && attempt.status !== "success")
    return <span className={classes}>{content}</span>;
  return (
    <button
      type="button"
      onClick={() => onOpen(attempt)}
      className={cn(
        classes,
        "cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2",
        attempt.status === "failed"
          ? "hover:bg-destructive/20 focus-visible:ring-destructive"
          : "hover:bg-success/20 focus-visible:ring-success",
      )}
      aria-label={
        attempt.status === "failed"
          ? `View ${label} publishing error`
          : `Manage ${label} published post`
      }
    >
      {content}
    </button>
  );
}

/** Per-network publishing results for one post, with details, refresh and removal. */
export function PublishResults({ attempts }: { attempts: PublishAttempt[] }) {
  const { activeWorkspace } = useWorkspace();
  const timeZone = activeWorkspace?.timezone ?? "UTC";
  const [selected, setSelected] = useState<PublishAttempt | null>(null);

  if (attempts.length === 0) return null;

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2 px-3.5 pb-1">
        {attempts.map((attempt) => (
          <PublishAttemptChip key={attempt.id} attempt={attempt} onOpen={setSelected} />
        ))}
      </div>
      {selected && (
        <PublishAttemptDialog
          attempt={selected}
          timeZone={timeZone}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

export function PublishAttemptDialog({
  attempt,
  timeZone,
  onClose,
}: {
  attempt: PublishAttempt;
  timeZone: string;
  onClose: () => void;
}) {
  const platform = platformLabel(attempt);
  const queryClient = useQueryClient();
  const refreshAttempt = useServerFn(refreshPublishAttemptDetails);
  const unpublish = useServerFn(unpublishPublishAttempt);
  const [refreshing, setRefreshing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [removing, setRemoving] = useState(false);
  const [removedAt, setRemovedAt] = useState<string | null>(attempt.unpublished_at);
  const actions = publishedAttemptActions({ ...attempt, unpublished_at: removedAt });
  const hasReference = hasProviderReference(attempt);
  const sentTo = sentTargets(attempt.request_snapshot);
  const isFailure = attempt.status === "failed";
  const formatTime = (value: string) =>
    `${formatInTimeZone(value, timeZone, { dateStyle: "medium", timeStyle: "short" })} ${timeZone}`;

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const result = await refreshAttempt({ data: { attemptId: attempt.id } });
      await queryClient.invalidateQueries({ queryKey: ["publish-attempts"] });
      onClose();
      if (result.status === "failed") {
        toast.error(
          result.errorMessage || "The provider still has not supplied a detailed reason.",
        );
      } else {
        toast.success(
          result.status === "success"
            ? "Provider now reports this post as published."
            : "Provider reports that this post is still processing.",
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh provider details.");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleRemove() {
    if (!isUnpublishConfirmation(confirmation)) return;
    setRemoving(true);
    try {
      const result = await unpublish({
        data: { attemptId: attempt.id, confirmation: UNPUBLISH_CONFIRMATION },
      });
      setRemovedAt(result.unpublishedAt);
      setConfirming(false);
      setConfirmation("");
      await queryClient.invalidateQueries({ queryKey: ["publish-attempts"] });
      toast.success(`Removed from ${platform}`);
    } catch (error) {
      await queryClient.invalidateQueries({ queryKey: ["publish-attempts"] });
      toast.error(error instanceof Error ? error.message : `Could not remove from ${platform}.`);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-attempt-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !removing) onClose();
      }}
    >
      <div className="surface-card max-h-[90vh] w-full max-w-lg overflow-y-auto p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p
              className={cn(
                "text-xs font-semibold uppercase tracking-wider",
                isFailure
                  ? "text-destructive"
                  : actions.removed
                    ? "text-muted-foreground"
                    : "text-success",
              )}
            >
              {isFailure ? "Publishing failed" : actions.removed ? "Removed" : "Published"}
            </p>
            <h2 id="publish-attempt-title" className="mt-1 text-xl font-semibold text-foreground">
              {platform}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={removing}
            className="rounded-lg p-2 text-muted-foreground hover:bg-elevated hover:text-foreground"
            aria-label="Close publishing details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isFailure && (
          <>
            <div className="mt-4 rounded-xl border border-destructive/25 bg-destructive/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
                Provider response
              </p>
              <p className="mt-2 break-words text-sm leading-6 text-foreground">
                {attempt.error_message ||
                  "The publishing provider did not return a detailed error message."}
              </p>
              {attempt.error_code && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Error code: {attempt.error_code}
                </p>
              )}
            </div>
            <div className="mt-4">
              <p className="text-sm font-semibold text-foreground">What to check</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {failureGuidance(attempt.error_message, platform, {
                  errorCode: attempt.error_code,
                  hasReference,
                })}
              </p>
            </div>
          </>
        )}

        {!isFailure && actions.removed && removedAt && (
          <div className="mt-4 rounded-xl border border-border bg-elevated/60 p-4">
            <p className="text-sm font-semibold text-foreground">Removed from {platform}</p>
            <p className="mt-1 text-xs text-muted-foreground">{formatTime(removedAt)}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              WaveOS keeps this publishing record as history.
            </p>
          </div>
        )}

        {!isFailure && actions.removeUnsupported && (
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            {unsupportedUnpublishMessage(platform)}
          </p>
        )}

        {!isFailure && !actions.removed && attempt.unpublish_error && (
          <p className="mt-4 rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-foreground">
            Last removal attempt: {attempt.unpublish_error}
          </p>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          Attempted {formatTime(attempt.attempted_at)}
        </p>
        {sentTo.length > 0 && (
          <p className="mt-1 break-all text-xs text-muted-foreground">
            Sent only to: {sentTo.join(", ")}
          </p>
        )}
        {hasReference && (
          <p className="mt-1 break-all text-xs text-muted-foreground">
            Provider reference: {attempt.provider_post_id ?? attempt.ayrshare_post_id}
          </p>
        )}

        {confirming ? (
          <div className="mt-5 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
            <p className="text-sm font-semibold text-foreground">Remove this post from {platform}?</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              This deletes the live post on {platform}. WaveOS keeps its publishing history, but
              the {platform} post cannot be restored. Type {UNPUBLISH_CONFIRMATION} to confirm.
            </p>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={UNPUBLISH_CONFIRMATION}
              autoComplete="off"
              aria-label={`Type ${UNPUBLISH_CONFIRMATION} to confirm`}
              className="mt-3 w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm outline-none focus:border-destructive/60"
            />
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={removing}
                onClick={() => {
                  setConfirming(false);
                  setConfirmation("");
                }}
                className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-elevated"
              >
                Keep post
              </button>
              <button
                type="button"
                disabled={removing || !isUnpublishConfirmation(confirmation)}
                onClick={() => void handleRemove()}
                className="inline-flex items-center gap-2 rounded-full bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {removing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Remove from {platform}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {hasReference && isFailure && (
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Refresh provider details
              </button>
            )}
            {isFailure && (
              <Link
                to="/social"
                search={{ view: "accounts" }}
                className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-elevated"
              >
                Check social account
              </Link>
            )}
            {actions.canRemove && (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="inline-flex items-center gap-2 rounded-full border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
                Remove from {platform}
              </button>
            )}
            {actions.canOpen && attempt.post_url && (
              <a
                href={attempt.post_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-elevated"
              >
                <ExternalLink className="h-4 w-4" />
                Open on {platform}
              </a>
            )}
            {isFailure && (
              <Link
                to="/create"
                search={{ id: attempt.content_item_id }}
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Open and retry post
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
