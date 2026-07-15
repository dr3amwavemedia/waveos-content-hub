import { createFileRoute } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { PlaceholderPage } from "@/components/app/placeholder-page";

export const Route = createFileRoute("/_authenticated/social-accounts")({
  component: () => (
    <PlaceholderPage
      icon={Share2}
      phase="Phase 4"
      title="Social accounts"
      subtitle="Securely connect your accounts so Dream Wave Media can help schedule and publish approved content."
      bullets={[
        "Instagram, Facebook, TikTok, LinkedIn, Threads, X, YouTube, Pinterest, Google Business",
        "One‑tap connection through a secure popup",
        "See connection status and last sync",
        "Reconnect or refresh accounts anytime",
      ]}
    />
  ),
  head: () => ({ meta: [{ title: "Social Accounts — WaveOS" }] }),
});
