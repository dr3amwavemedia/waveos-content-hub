import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/app/empty-state";
import { useWorkspace } from "@/components/app/workspace-context";
import { useCurrentUser } from "@/hooks/use-waveos";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/feedback")({
  component: FeedbackPage,
  head: () => ({ meta: [{ title: "Feedback — WaveOS" }, { name: "robots", content: "noindex" }] }),
});

function FeedbackPage() {
  const { activeWorkspace } = useWorkspace();
  const { data: user } = useCurrentUser();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  if (!user) return <EmptyState icon={MessageSquare} title="Sign in required" body="Sign in to send feedback." />;

  async function send() {
    if (!message.trim()) return;
    setSending(true);
    try {
      await supabase.from("activity_logs").insert({
        workspace_id: activeWorkspace?.id ?? null,
        actor_user_id: user!.userId,
        action: "feedback_submitted",
        entity_type: "feedback",
        safe_metadata: { message: message.trim().slice(0, 4000) },
      });
      toast.success("Thanks — Dream Wave Media will follow up.");
      setMessage("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Send feedback</h1>
        <p className="text-sm text-muted-foreground">
          Bugs, requests, or anything you want the Dream Wave Media team to see.
        </p>
      </div>
      <div className="surface-card space-y-3 p-5">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={7}
          placeholder="What's on your mind?"
          className="w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm outline-none focus:border-primary/60"
        />
        <div className="flex items-center justify-end gap-2">
          <button
            disabled={!message.trim() || sending}
            onClick={send}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> Send
          </button>
        </div>
      </div>
    </div>
  );
}
