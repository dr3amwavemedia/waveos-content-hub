import { Eye, UserCog, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useActingStaff } from "@/hooks/use-acting-staff";
import { useImpersonateClient, type PreviewTier } from "@/hooks/use-impersonation";
import { useCurrentUser } from "@/hooks/use-waveos";
import { useWorkspace } from "./workspace-context";

export function ImpersonationBanner() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const { on, disable, tier, setTier } = useImpersonateClient();
  const acting = useActingStaff();
  const { activeWorkspace, setActiveWorkspaceId } = useWorkspace();

  if (acting.on && acting.identity) {
    const name =
      `${acting.identity.firstName ?? ""} ${acting.identity.lastName ?? ""}`.trim() ||
      acting.identity.email ||
      "staff member";
    return (
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-center gap-3 border-b border-primary/30 bg-primary/10 px-4 py-2 text-xs backdrop-blur">
        <UserCog className="h-3.5 w-3.5 text-primary" />
        <span className="text-foreground">
          Admin acting as <span className="font-semibold">{name}</span> for WaveOS tasks. Email
          sending is disabled in acting mode.
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

  const canPreviewClients =
    user?.roles.includes("dream_wave_owner") === true ||
    user?.roles.includes("dream_wave_team") === true;
  const exitClientView = () => {
    disable();
    setActiveWorkspaceId("11111111-1111-1111-1111-111111111111");
    qc.clear();
    window.location.assign("/clients");
  };

  const clientBanner =
    canPreviewClients && on ? (
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-center gap-2 border-b border-primary/30 bg-primary/10 px-3 py-2 text-xs backdrop-blur">
        <Eye className="h-3.5 w-3.5 text-primary" />
        <span className="text-foreground">
          Viewing <span className="font-semibold">{activeWorkspace?.name ?? "workspace"}</span> as a
          client. Staff-only controls are hidden.
        </span>
        <select
          value={tier ?? ""}
          onChange={(event) => {
            const value = event.target.value as PreviewTier | "";
            if (value) setTier(value);
          }}
          className="rounded-md border border-border bg-surface/90 px-2 py-1 text-xs text-foreground"
          aria-label="Preview client layer"
        >
          <option value="">Saved client tier</option>
          <option value="project_client">Layer 1 · Project</option>
          <option value="growth_90">Layer 2 · Growth</option>
          <option value="retainer_full">Layer 3 · Retainer</option>
          <option value="social_management">Layer 4 · Social Management</option>
          <option value="wedding_client">Layer 5 · Wedding Client</option>
        </select>
        <button
          onClick={exitClientView}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface/80 px-2 py-0.5 font-medium text-foreground hover:bg-elevated"
        >
          <X className="h-3 w-3" /> Exit
        </button>
      </div>
    ) : null;

  return clientBanner;
}
