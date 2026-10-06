import type { ContentItem } from "@/hooks/use-content";

export const DEFAULT_WEEKLY_POST_GOAL = 3;

export function startOfLocalWeek(now: Date) {
  const start = new Date(now);
  const day = start.getDay();
  start.setDate(start.getDate() - ((day + 6) % 7));
  start.setHours(0, 0, 0, 0);
  return start;
}

export function weeklyPostingProgress(items: ContentItem[], now = new Date()) {
  const start = startOfLocalWeek(now).getTime();
  const end = start + 7 * 86_400_000;
  return items.filter((item) => {
    if (!["scheduled", "publishing", "published"].includes(item.status)) return false;
    const timestamp = item.published_at ?? item.scheduled_at;
    if (!timestamp) return false;
    const value = new Date(timestamp).getTime();
    return value >= start && value < end;
  }).length;
}
