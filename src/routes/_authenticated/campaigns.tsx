import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { RequireFeature } from "@/components/app/require-feature";
import { useCampaignManager } from "@/components/campaign/use-campaign-manager";
import { MobileCampaignManager } from "@/components/campaign/mobile-campaign-manager";
import { DesktopCampaignManager } from "@/components/campaign/desktop-campaign-manager";
import { CAMPAIGN_PHONE_QUERY, useMatchesMedia } from "@/hooks/use-matches-media";

export const Route = createFileRoute("/_authenticated/campaigns")({
  component: () => (
    <RequireFeature
      feature="can_use_campaign_manager"
      title="Campaign Manager is available with Current or Tidal"
      description="Upgrade your WaveOS plan to build and organize multi-post campaigns."
    >
      <CampaignManagerPage />
    </RequireFeature>
  ),
  head: () => ({
    meta: [
      { title: "Campaign Manager — WaveOS" },
      {
        name: "description",
        content: "Build reviewable internal social campaign plans without auto-publishing.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Campaign Manager — WaveOS" },
      { property: "og:description", content: "Build and review your next social campaign plan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/** Phones get the five-step builder; tablets and desktop keep the existing layout. Both share one controller. */
function CampaignManagerPage() {
  const controller = useCampaignManager();
  const phone = useMatchesMedia(CAMPAIGN_PHONE_QUERY);
  if (!controller.activeWorkspace) return null;
  if (phone === null) {
    return (
      <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading Campaign Manager…
      </div>
    );
  }
  return phone ? <MobileCampaignManager controller={controller} /> : <DesktopCampaignManager controller={controller} />;
}
