import { createFileRoute } from "@tanstack/react-router";
import { Images } from "lucide-react";
import { PlaceholderPage } from "@/components/app/placeholder-page";

export const Route = createFileRoute("/_authenticated/content")({
  component: () => (
    <PlaceholderPage
      icon={Images}
      phase="Phase 2"
      title="Content library"
      subtitle="A calm, cinematic media library for every asset in your brand's world."
      bullets={[
        "Drag‑and‑drop uploads (photos, videos, carousels)",
        "Smart folders — Deliverables, Photography, Reels, Testimonials",
        "Tags, filters, and fast search",
        "Preview, download, and see where each asset was used",
      ]}
    />
  ),
  head: () => ({ meta: [{ title: "Content — WaveOS" }] }),
});
