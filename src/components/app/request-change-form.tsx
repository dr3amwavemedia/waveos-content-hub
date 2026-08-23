import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquarePlus, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { containsProfanity } from "@/lib/profanity";
import { cn } from "@/lib/utils";

const db = supabase as unknown as {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: Error | null }>;
};

// Mirrors the server-side checks in create_client_service_request (length
// limits, profanity screen) so the client gets instant feedback instead of a
// rejected RPC. The server re-checks everything — this is UX, not security.
const changeRequestSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, { message: "Give your change a short title." })
    .max(140, { message: "Keep the title under 140 characters." })
    .refine((value) => !containsProfanity(value), {
      message: "Please keep the language professional.",
    }),
  comments: z
    .string()
    .trim()
    .min(2, { message: "Add a few details so the team gets it right." })
    .max(4000, { message: "Keep comments under 4,000 characters." })
    .refine((value) => !containsProfanity(value), {
      message: "Please keep the language professional.",
    }),
});

// Marks errors raised by the client-side zod schema. Their messages are
// already user-friendly guidance, so onError shows them verbatim instead of
// routing them through the server-code mapper (which would swallow them
// behind the generic fallback).
class ValidationError extends Error {}

// Friendly copy for the error codes the RPC raises.
function friendlySubmitError(error: unknown): string {
  if (error instanceof ValidationError) return error.message;
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (raw.includes("duplicate_request")) {
    return "You already have an open request with this title — we're on it. Add any extra detail as a comment instead.";
  }
  if (raw.includes("inappropriate_language")) {
    return "Please keep the language professional.";
  }
  if (raw.includes("invalid_title")) return "Keep the title between 2 and 140 characters.";
  if (raw.includes("invalid_description")) {
    return "Keep comments between 2 and 4,000 characters.";
  }
  return "Could not send your change request.";
}

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60";

// Inline "Request a change" form shown on the client project detail page.
// Submits into the shared client_requests pipeline (request_type = revision),
// so staff see it in the Requests tab and its status flows back here.
export function RequestChangeForm({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [comments, setComments] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      const parsed = changeRequestSchema.safeParse({ title, comments });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Check your entries and try again.");
      }
      const { error } = await db.rpc("create_client_service_request", {
        _workspace_id: workspaceId,
        _title: parsed.data.title,
        _description: parsed.data.comments,
        _request_type: "revision",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTitle("");
      setComments("");
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["client-projects"] });
      void qc.invalidateQueries({ queryKey: ["client-service-requests"] });
      void qc.invalidateQueries({ queryKey: ["phase4-requests"] });
      toast.success("Change request sent — watch this page for status updates.");
    },
    onError: (error: unknown) => toast.error(friendlySubmitError(error)),
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-elevated/60 px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
      >
        <MessageSquarePlus className="h-4 w-4 shrink-0 text-primary" />
        <span>
          <span className="font-medium text-foreground">Request a change</span> — tell the Dream
          Wave team what to tweak and track the status right here.
        </span>
      </button>
    );
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    // Duplicate submission prevention: ignore repeat submits (double-click,
    // Enter key) while a request is already in flight. The server also
    // rejects duplicate open requests as the real gate.
    if (submit.isPending) return;
    submit.mutate();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-xl border border-border bg-elevated/60 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MessageSquarePlus className="h-4 w-4 text-primary" />
          Request a change
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close change request form"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
        What should change?
        <input
          required
          minLength={2}
          maxLength={140}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Example: Swap the cover photo on the spring reel"
          className={field}
        />
      </label>

      <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
        Comments for the team
        <textarea
          required
          minLength={2}
          maxLength={4000}
          rows={4}
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder="Describe the change and anything we should know — the more detail, the faster we turn it around."
          className={cn(field, "resize-y")}
        />
      </label>

      <button
        type="submit"
        disabled={submit.isPending}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-50"
      >
        {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {submit.isPending ? "Sending…" : "Send change request"}
      </button>
    </form>
  );
}
