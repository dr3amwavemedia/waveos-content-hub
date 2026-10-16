import { Link } from "@tanstack/react-router";
import {
  BarChart3 as ChartIcon,
  CalendarDays,
  CheckSquare as ApproveIcon,
  ChevronRight as Chevron,
  PlusCircle,
  Wand2,
  type LucideIcon,
} from "lucide-react";

import type { FeatureKey } from "@/lib/permissions";

type Tile = {
  to: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  feature: FeatureKey;
  search?: { view: "analytics" };
  primary?: boolean;
};

const TILES: Tile[] = [
  { to: "/create", label: "Create Post", hint: "Plan or publish", icon: PlusCircle, feature: "can_create_content", primary: true },
  { to: "/creative-studio", label: "Creative Studio", hint: "Design graphics", icon: Wand2, feature: "can_create_content" },
  { to: "/social", search: { view: "analytics" }, label: "Analytics", hint: "View performance", icon: ChartIcon, feature: "can_view_analytics_checkup" },
  { to: "/calendar", label: "Calendar", hint: "See what's next", icon: CalendarDays, feature: "can_view_calendar_preview" },
];

/** Phone-only command center: big action tiles + real "Today's focus" items. */
export function MobileCommandCenter({
  can,
  scheduledCount,
  awaitingCount,
  approvalsTo,
}: {
  can: (feature: FeatureKey) => boolean;
  scheduledCount?: number;
  awaitingCount?: number;
  approvalsTo: string;
}) {
  const tiles = TILES.filter((tile) => can(tile.feature)).slice(0, 4);
  const focus = [
    scheduledCount
      ? { label: `${scheduledCount} ${scheduledCount === 1 ? "post" : "posts"} scheduled`, to: "/calendar", icon: CalendarDays }
      : null,
    awaitingCount
      ? { label: `${awaitingCount} ${awaitingCount === 1 ? "approval" : "approvals"} waiting`, to: approvalsTo, icon: ApproveIcon }
      : null,
  ].filter(Boolean) as Array<{ label: string; to: string; icon: LucideIcon }>;

  if (!tiles.length && !focus.length) return null;

  return (
    <div className="space-y-3 sm:hidden">
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {tiles.map(({ to, search, label, hint, icon: Icon, primary }) => (
            <Link
              key={to}
              to={to}
              search={search}
              className={
                primary
                  ? "flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-br from-primary to-primary-glow p-3 text-center text-primary-foreground shadow-[var(--shadow-glow)]"
                  : "flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl border border-border-strong bg-gradient-to-br from-secondary to-surface p-3 text-center text-foreground"
              }
            >
              <Icon className={primary ? "h-6 w-6" : "h-6 w-6 text-primary"} />
              <span className="text-sm font-semibold">{label}</span>
              <span className={primary ? "text-[11px] opacity-80" : "text-[11px] text-muted-foreground"}>{hint}</span>
            </Link>
          ))}
        </div>
      )}
      {focus.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-3">
          <p className="mb-1 flex items-center gap-2 px-1 text-sm font-semibold text-foreground">
            Today's focus
            <span className="rounded-full bg-primary/20 px-2 text-xs text-primary">{focus.length}</span>
          </p>
          {focus.map(({ label, to, icon: Icon }) => (
            <Link key={label} to={to} className="flex min-h-11 items-center gap-3 rounded-xl px-1 text-sm text-foreground hover:bg-elevated">
              <Icon className="h-4 w-4 text-primary" />
              <span className="flex-1">{label}</span>
              <Chevron className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
