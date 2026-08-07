import { Eye, UserCog, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useActingStaff } from "@/hooks/use-acting-staff";
import { useImpersonateClient } from "@/hooks/use-impersonation";
import { useCurrentUser } from "@/hooks/use-waveos";
import { useWorkspace } from "./workspace-context";

export function ImpersonationBanner() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const { on, disable } = useImpersonateClient();
  const acting = useActingStaff();
  const { activeWorkspace } = useWorkspace();

  if (acting.on && acting.identity) {
    const name =
      `${acting.identity.firstName ?? ""} ${acting.identity.lastName ?? ""}`.trim() ||
      acting.identity.email ||
      "staff member";
    return (
      <div className="sticky top-0 z-30 flex items-center justify-center gap-3 border-b border-primary/30 bg-primary/10 px-4 py-2 text-xs backdrop-blur">
        <UserCog className="h-3.5 w-3.5 text-primary" />
        <span className="text-foreground">
          Admin acting as <span className="font-semibold">{name}</span>. Staff navigation and workspace behavior are active.
        </span>
        <button
          onClick={async () => {
            acting.disable();
            await Promise.all([
              qc.invalidateQueries({ queryKey: ["waveos", "current-user"] }),
              qc.invalidateQueries({ queryKey: ["waveos", "workspaces"] }),
            ]);
            window.location.assign("/admin");
          }}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface/80 px-2 py-0.5 font-medium text-foreground hover:bg-elevated"
        >
          <X className="h-3 w-3" /> Exit acting mode
        </button>
      </div>
    );
  }

  if (!user?.isStaff || !on) return null;
  return (
    <div className="sticky top-0 z-30 flex items-center justify-center gap-3 border-b border-primary/30 bg-primary/10 px-4 py-2 text-xs backdrop-blur">
      <Eye className="h-3.5 w-3.5 text-primary" />
      <span className="text-foreground">
        Viewing <span className="font-semibold">{activeWorkspace?.name ?? "workspace"}</span>{" "}
        as a client. Staff-only controls are hidden.
      </span>
      <button
        onClick={disable}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface/80 px-2 py-0.5 font-medium text-foreground hover:bg-elevated"
      >
        <X className="h-3 w-3" /> Exit
      </button>
    </div>
  );
}
