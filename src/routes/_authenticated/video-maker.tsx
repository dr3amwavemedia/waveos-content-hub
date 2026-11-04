import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { RequireFeature } from "@/components/app/require-feature";
import { useVideoMaker } from "@/components/video-maker/use-video-maker";
import { MobileVideoMaker } from "@/components/video-maker/mobile-video-maker";
import { DesktopVideoMaker } from "@/components/video-maker/desktop-video-maker";
import { VIDEO_MAKER_MOBILE_QUERY, useMatchesMedia } from "@/hooks/use-matches-media";

export const Route = createFileRoute("/_authenticated/video-maker")({
  component: () => (
    <RequireFeature
      feature="can_use_creative_studio"
      title="Video Maker is available with Current or Tidal"
      description="Upgrade your WaveOS plan to prepare video content for social publishing."
    >
      <VideoMakerPage />
    </RequireFeature>
  ),
  head: () => ({
    meta: [
      { title: "Video Maker — WaveOS" },
      { name: "description", content: "Trim, frame and caption a clip, then carry it into a WaveOS post." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Video Maker — WaveOS" },
      { property: "og:description", content: "Mobile video editing with a live preview inside WaveOS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/** Phones and tablets get the mobile editor; desktop keeps the existing layout. Both share one controller. */
function VideoMakerPage() {
  const controller = useVideoMaker();
  const mobile = useMatchesMedia(VIDEO_MAKER_MOBILE_QUERY);
  if (mobile === null) {
    return (
      <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading Video Maker…
      </div>
    );
  }
  return mobile ? <MobileVideoMaker controller={controller} /> : <DesktopVideoMaker controller={controller} />;
}
