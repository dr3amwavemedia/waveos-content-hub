import { AlertTriangle, Clock3, PauseCircle } from "lucide-react";

import { usePermissions } from "@/hooks/use-permissions";
import { useCurrentUser } from "@/hooks/use-waveos";
import { daysUntil } from "@/lib/permissions";

export function AccountStatusBanner() {
  const { access, raw, isStaff } = usePermissions();
  const { data: user } = useCurrentUser();
  if (!access || isStaff || user?.isStaff) return null;

  const remaining = daysUntil(access.expiresAt);
  const common = "flex flex-wrap items-center justify-center gap-2 border-b px-3 py-2 text-xs";

  if (access.status === "pending") {
    return (
      <div className={`${common} border-primary/30 bg-primary/10 text-foreground`}>
        <Clock3 className="h-4 w-4 text-primary" />
        Your workspace is being prepared. Dream Wave Media will notify you when activation is
        complete.
      </div>
    );
  }
  if (access.status === "suspended") {
    return (
      <div className={`${common} border-warning/30 bg-warning/10 text-foreground`}>
        <PauseCircle className="h-4 w-4 text-warning" />
        This workspace is temporarily read-only. Contact Dream Wave Media for assistance.
      </div>
    );
  }
  if (access.status === "expired" || (remaining !== null && remaining < 0)) {
    return (
      <div className={`${common} border-warning/30 bg-warning/10 text-foreground`}>
        <AlertTriangle className="h-4 w-4 text-warning" />
        Your agreement has expired. Contact Dream Wave Media to renew access.
      </div>
    );
  }
  if (remaining !== null && remaining >= 0 && remaining <= 14) {
    return (
      <div className={`${common} border-primary/30 bg-primary/10 text-foreground`}>
        <Clock3 className="h-4 w-4 text-primary" />
        Your current access ends in {remaining} day{remaining === 1 ? "" : "s"}. Contact Dream Wave
        Media about renewal.
      </div>
    );
  }
  if (!raw?.activated_at) return null;
  return null;
}
