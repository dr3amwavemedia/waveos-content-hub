import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { PlaceholderPage } from "@/components/app/placeholder-page";

export const Route = createFileRoute("/_authenticated/feedback")({
  component: () => (
    <PlaceholderPage
      icon={MessageSquare}
      phase="Phase 3"
      title="Feedback"
      subtitle="Leave clear, focused feedback right on the posts that need changes."
      bullets={[
        "Comment on any post or asset",
        "Tag a Dream Wave team member",
        "Attach reference images",
        "Mark threads resolved once addressed",
      ]}
    />
  ),
  head: () => ({ meta: [{ title: "Feedback — WaveOS" }] }),
});
