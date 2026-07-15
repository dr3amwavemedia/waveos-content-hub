import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { PlaceholderPage } from "@/components/app/placeholder-page";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: () => (
    <PlaceholderPage
      icon={BarChart3}
      phase="Phase 5"
      title="Analytics"
      subtitle="Simple, honest metrics — no fabricated numbers, ever."
      bullets={[
        "Reach, engagement, follower change",
        "Top posts and best posting times",
        "Platform comparisons",
        "Wave Assistant insights in plain English",
      ]}
    />
  ),
  head: () => ({ meta: [{ title: "Analytics — WaveOS" }] }),
});
