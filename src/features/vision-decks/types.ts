import type { Json } from "@/integrations/supabase/types";

export type VisionDeckStatus = "draft" | "ready" | "archived";
export type VisionReferenceKind = "image" | "video" | "link";

export interface VisionReference {
  id: string;
  kind: VisionReferenceKind;
  label: string;
  url: string;
  note: string;
}

export interface VisionDeliverable {
  id: string;
  quantity: number;
  title: string;
  description: string;
  platform: string;
}

export interface VisionTimelineStep {
  id: string;
  phase: string;
  timing: string;
  detail: string;
}

export interface VisionRoiModel {
  investment: number;
  months: number;
  videosPerMonth: number;
  averageViews: number;
  clickRate: number;
  leadRate: number;
  closeRate: number;
  customerValue: number;
}

export interface VisionPackageOption {
  id: string;
  name: string;
  price: number;
  paymentPlan: string;
  description: string;
  deliverableCount: number;
  features: string[];
  badge: string;
  callToAction: string;
  recommended: boolean;
}

export interface VisionPackageComparison {
  eyebrow: string;
  headline: string;
  introduction: string;
  currency: string;
  options: VisionPackageOption[];
}

export interface VisionDeckBranding {
  companyLogo?: {
    storagePath: string;
    alt: string;
    fit: "contain" | "cover";
  };
}

export interface VisionDeckContent {
  cover: { eyebrow: string; headline: string; subhead: string };
  discovery: {
    summary: string;
    audience: string;
    goals: string[];
    challenges: string[];
  };
  direction: {
    title: string;
    narrative: string;
    keywords: string[];
    references: VisionReference[];
  };
  plan: { narrative: string; deliverables: VisionDeliverable[] };
  social: {
    handle: string;
    hook: string;
    caption: string;
    callToAction: string;
    videoUrl: string;
    posterUrl: string;
  };
  roi: VisionRoiModel;
  packages?: VisionPackageComparison;
  timeline: VisionTimelineStep[];
  close: {
    headline: string;
    body: string;
    callToActionLabel: string;
    callToActionUrl: string;
  };
  branding?: VisionDeckBranding;
}

export interface VisionDeck {
  id: string;
  title: string;
  company_name: string;
  prospect_name: string | null;
  prospect_email: string | null;
  status: VisionDeckStatus;
  content: VisionDeckContent;
  accent_color: string;
  share_token: string;
  share_enabled: boolean;
  published_at: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface PublicVisionDeck {
  id: string;
  title: string;
  company_name: string;
  prospect_name: string | null;
  accent_color: string;
  content: VisionDeckContent;
  published_at: string | null;
}

export function parseVisionDeckContent(value: Json): VisionDeckContent {
  return value as unknown as VisionDeckContent;
}

export function serializeVisionDeckContent(value: VisionDeckContent): Json {
  return value as unknown as Json;
}

export function newVisionId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export const VISION_ASSETS_BUCKET = "vision-deck-assets";
