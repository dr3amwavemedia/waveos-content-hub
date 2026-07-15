import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { PlaceholderPage } from "@/components/app/placeholder-page";

export const Route = createFileRoute("/_authenticated/brand-voice")({
  component: () => (
    <PlaceholderPage
      icon={Sparkles}
      phase="Phase 2"
      title="Brand voice"
      subtitle="Teach WaveOS how your brand sounds so every caption feels like you."
      bullets={[
        "Tone selectors (professional, friendly, bold, luxury…)",
        "Preferred phrases and words to avoid",
        "Call‑to‑action preferences and emoji style",
        "English and Spanish content support",
      ]}
    />
  ),
  head: () => ({ meta: [{ title: "Brand Voice — WaveOS" }] }),
});
