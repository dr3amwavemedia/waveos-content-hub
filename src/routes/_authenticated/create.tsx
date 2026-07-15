import { createFileRoute } from "@tanstack/react-router";
import { PenSquare } from "lucide-react";
import { PlaceholderPage } from "@/components/app/placeholder-page";

export const Route = createFileRoute("/_authenticated/create")({
  component: () => (
    <PlaceholderPage
      icon={PenSquare}
      phase="Phase 3"
      title="Create a post"
      subtitle="A guided workflow that keeps every caption tailored to the platform."
      bullets={[
        "Pick media from library or upload fresh",
        "Independent caption tabs per platform",
        "Wave Assistant caption + hashtag suggestions",
        "Approvals, scheduling, and publishing",
      ]}
    />
  ),
  head: () => ({ meta: [{ title: "Create Post — WaveOS" }] }),
});
