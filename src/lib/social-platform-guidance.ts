import type { SocialPlatform } from "@/hooks/use-content";

export type SocialPlatformGuidance = {
  postTypes: string;
  caption: string;
  image: string;
  video: string;
  note?: string;
  storySupported: boolean;
  available: boolean;
  accent: string;
};

/**
 * Provider-facing publishing limits shown in the composer. Keep these aligned
 * with the publishing provider's platform documentation rather than generic design advice.
 */
export const SOCIAL_PLATFORM_GUIDANCE: Record<SocialPlatform, SocialPlatformGuidance> = {
  instagram: {
    postTypes: "Feed, carousel, Story, Reel",
    caption: "2,200 characters",
    image: "JPEG/PNG · 8 MB · up to 10 in a carousel · Story 1080×1920 recommended",
    video: "MP4/MOV · 300 MB feed/Reel, 100 MB Story · Reel 90 sec, Story 60 sec",
    note: "Business or Creator account required.",
    storySupported: true,
    available: true,
    accent: "border-fuchsia-400/30 bg-fuchsia-400/10",
  },
  facebook: {
    postTypes: "Page feed, Story, Reel",
    caption: "63,206 characters; only the opening is shown before truncation",
    image: "JPEG/PNG/GIF · 4 MB · up to 10 images · Story 1080×1920 recommended",
    video: "MP4/MOV · 4 GB · feed up to 240 min, Reel 60 sec, Story 120 sec",
    note: "A Facebook Page connection is required.",
    storySupported: true,
    available: true,
    accent: "border-blue-400/30 bg-blue-400/10",
  },
  tiktok: {
    postTypes: "Video or photo carousel",
    caption: "2,200 video caption · photo title 90 · photo description 4,000",
    image: "JPEG/PNG/WebP · 20 MB · up to 35 photos · portrait recommended",
    video: "MP4/MOV/WebM · 4 GB · 3 sec–10 min · 1080×1920 recommended",
    note: "TikTok does not expose a separate Story publishing target through this connection.",
    storySupported: false,
    available: true,
    accent: "border-cyan-400/30 bg-cyan-400/10",
  },
  youtube: {
    postTypes: "Video or Short",
    caption: "Title 100 · description 5,000 · tags 500 combined",
    image: "Thumbnail JPEG/PNG/GIF · 2 MB · 1280×720 recommended",
    video: "MP4/MOV/AVI/WMV/FLV/3GP/WebM · 256 GB · up to 12 hr when verified",
    storySupported: false,
    available: true,
    accent: "border-red-400/30 bg-red-400/10",
  },
  linkedin: {
    postTypes: "Post, video, or document",
    caption: "3,000 characters",
    image: "JPEG/PNG/GIF · 8 MB · up to 20 images",
    video: "MP4/MOV/AVI · 5 GB · 10 min personal, 30 min organization",
    note: "LinkedIn discontinued Stories; organization accounts are required for comment inbox access.",
    storySupported: false,
    available: true,
    accent: "border-sky-400/30 bg-sky-400/10",
  },
  x: {
    postTypes: "Post, reply, or thread",
    caption: "280 standard · up to 25,000 with Premium",
    image: "Up to 4 images or 1 GIF",
    video: "1 video · MP4/MOV recommended",
    note: "X may require separate provider billing for publishing access.",
    storySupported: false,
    available: true,
    accent: "border-slate-400/30 bg-slate-400/10",
  },
  pinterest: {
    postTypes: "Image Pin or video Pin",
    caption: "Title 100 · description 800",
    image: "JPEG/PNG/WebP/GIF · 32 MB · one image · 1000×1500 recommended",
    video: "MP4/MOV · 2 GB · 4 sec–15 min",
    note: "A board must be selected. Pinterest does not expose comments through this connection.",
    storySupported: false,
    available: true,
    accent: "border-rose-400/30 bg-rose-400/10",
  },
  threads: {
    postTypes: "Text, image, video, carousel, or thread",
    caption: "500 characters",
    image: "JPEG/PNG · 8 MB · up to 10 images",
    video: "MP4 H.264/AAC · 1 GB · up to 5 min",
    storySupported: false,
    available: true,
    accent: "border-zinc-400/30 bg-zinc-400/10",
  },
  bluesky: {
    postTypes: "Text, image, video, or thread",
    caption: "300 characters hard limit",
    image: "JPEG/PNG/WebP/GIF · 1 MB · up to 4 images",
    video: "MP4 · 50 MB · up to 60 sec",
    storySupported: false,
    available: true,
    accent: "border-blue-300/30 bg-blue-300/10",
  },
  gmb: {
    postTypes: "Update, event, or offer",
    caption: "Keep the summary concise; include a supported call to action",
    image: "JPG/PNG · 1200×900 recommended",
    video: "Not supported for Google Business local posts in this composer",
    note: "A verified location must be selected.",
    storySupported: false,
    available: true,
    accent: "border-emerald-400/30 bg-emerald-400/10",
  },
  snapchat: {
    postTypes: "Story, Saved Story, or Spotlight",
    caption: "Saved Story title 45 · Spotlight description 160",
    image: "JPEG/PNG · 20 MB · 1080×1920 recommended",
    video: "MP4 · 500 MB · 5–60 sec · 1080×1920 recommended",
    note: "Closed beta in Zernio. New connections remain unavailable until the provider approves the account.",
    storySupported: true,
    available: false,
    accent: "border-yellow-300/30 bg-yellow-300/10",
  },
};

export const COMMENT_ASSISTANT_PLATFORMS: SocialPlatform[] = [
  "facebook",
  "instagram",
  "youtube",
  "linkedin",
  "threads",
  "x",
];
