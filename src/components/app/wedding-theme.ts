import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type WeddingDelivery = Database["public"]["Tables"]["client_deliveries"]["Row"];

export const WEDDING_STAGES = [
  { value: "invitation_accepted", label: "Invitation accepted" },
  { value: "deposit_received", label: "Deposit received" },
  { value: "planning", label: "Planning" },
  { value: "creative_strategy_meeting", label: "Creative Strategy Meeting" },
  { value: "wedding_day_approaching", label: "Wedding day approaching" },
  { value: "wedding_captured", label: "Wedding captured" },
  { value: "editing", label: "Editing" },
  { value: "films_ready", label: "Films ready" },
  { value: "complete", label: "Complete" },
] as const;

export type WeddingStage = (typeof WEDDING_STAGES)[number]["value"];

export const STAGE_NEXT_STEP: Record<WeddingStage, string> = {
  invitation_accepted: "We are getting your workspace set up. Nothing needed from you yet.",
  deposit_received: "Let's book your Creative Strategy Meeting.",
  planning: "Share any details, people, or moments you want us to know about.",
  creative_strategy_meeting: "Meet with us and talk through the story of your day.",
  wedding_day_approaching: "We are finalizing the timeline. Keep an eye out for our check in.",
  wedding_captured: "We have your day. Editing starts next.",
  editing: "Your films are being edited. We will let you know the moment they are ready.",
  films_ready: "Your films are ready to watch in the Content tab.",
  complete: "Everything is delivered. Thank you for letting us be part of your day.",
};

export type WeddingPalette = {
  ink: string;
  accent: string;
  soft: string;
  wash: string;
  border: string;
};

export function weddingPalette(theme: string | null | undefined): WeddingPalette {
  return theme === "gold"
    ? { ink: "#6b5320", accent: "#b48a32", soft: "#f6efdf", wash: "#fdfaf4", border: "#ecdfc2" }
    : { ink: "#3f4d29", accent: "#667843", soft: "#eef2e4", wash: "#f9faf5", border: "#dde3ce" };
}

export type WeddingWorkspace = {
  name: string;
  account_status: string;
  wedding_display_name: string | null;
  wedding_theme: string | null;
  wedding_scheduling_url: string | null;
  wedding_date: string | null;
  wedding_venue: string | null;
  wedding_city: string | null;
  wedding_state: string | null;
  wedding_location: string | null;
  wedding_meeting_at: string | null;
  wedding_stage: string | null;
  wedding_welcome_message: string | null;
};

export const WEDDING_WORKSPACE_COLUMNS =
  "name,account_status,wedding_display_name,wedding_theme,wedding_scheduling_url,wedding_date,wedding_venue,wedding_city,wedding_state,wedding_location,wedding_meeting_at,wedding_stage,wedding_welcome_message";

export function useWeddingWorkspace(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["wedding", "workspace", workspaceId],
    enabled: !!workspaceId,
    staleTime: 60_000,
    queryFn: async (): Promise<WeddingWorkspace> => {
      const { data, error } = await supabase
        .from("workspaces")
        .select(WEDDING_WORKSPACE_COLUMNS)
        .eq("id", workspaceId!)
        .single();
      if (error) throw error;
      return data as unknown as WeddingWorkspace;
    },
  });
}

export function useWeddingDeliveries(workspaceId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["wedding", "deliveries", workspaceId],
    enabled: !!workspaceId && enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<WeddingDelivery[]> => {
      const { data, error } = await supabase
        .from("client_deliveries")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("is_pinned", { ascending: false })
        .order("delivered_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WeddingDelivery[];
    },
  });
}

export function formatWeddingDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const iso = value.length === 10 ? `${value}T12:00:00` : value;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function formatMeetingDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function weddingLocation(ws: WeddingWorkspace | undefined): string | null {
  if (!ws) return null;
  if (ws.wedding_location?.trim()) return ws.wedding_location.trim();
  const parts = [ws.wedding_venue, ws.wedding_city, ws.wedding_state]
    .map((p) => p?.trim())
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function weddingDisplayName(ws: WeddingWorkspace | undefined): string {
  return ws?.wedding_display_name?.trim() || ws?.name || "Your Wedding";
}

export function deliveryKindLabel(delivery: WeddingDelivery): string {
  const title = `${delivery.title ?? ""} ${delivery.description ?? ""}`.toLowerCase();
  if (title.includes("highlight")) return "Highlight film";
  if (title.includes("ceremony")) return "Ceremony film";
  if (title.includes("speech") || title.includes("toast")) return "Speeches";
  if (title.includes("teaser") || title.includes("social")) return "Social teaser";
  if (title.includes("gallery")) return "Full gallery";
  switch (delivery.kind) {
    case "photos":
      return "Photos";
    case "videos":
      return "Film";
    case "reels":
      return "Social teaser";
    case "graphics":
      return "Design";
    case "documents":
      return "Document";
    default:
      return "Delivery";
  }
}

export function deliveryActionLabel(delivery: WeddingDelivery): string {
  if (delivery.kind === "photos") return "View photos";
  if (delivery.kind === "videos" || delivery.kind === "reels") return "View film";
  return "Open delivery";
}

export const WEDDING_CONTACT_EMAIL = "dr3amwavemedia@outlook.com";
