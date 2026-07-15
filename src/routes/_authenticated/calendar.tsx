import { createFileRoute } from "@tanstack/react-router";
import { Calendar } from "lucide-react";
import { PlaceholderPage } from "@/components/app/placeholder-page";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: () => (
    <PlaceholderPage
      icon={Calendar}
      phase="Phase 5"
      title="Content calendar"
      subtitle="See exactly what's going out, when, and where."
      bullets={[
        "Monthly, weekly, and agenda views",
        "Drag to reschedule posts",
        "Platform + status filters",
        "Timezone‑aware scheduling with UTC conversion",
      ]}
    />
  ),
  head: () => ({ meta: [{ title: "Calendar — WaveOS" }] }),
});
