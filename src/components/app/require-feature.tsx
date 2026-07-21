import { Link } from "@tanstack/react-router";
import { Loader2, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { usePermissions } from "@/hooks/use-permissions";
import { useWorkspace } from "@/components/app/workspace-context";
import { useCurrentUser } from "@/hooks/use-waveos";
import type { FeatureKey } from "@/lib/permissions";
import { LockedPreview } from "@/components/app/feature-gate";

interface RequireFeatureProps {
  feature: FeatureKey;
  title?: string;
  description?: string;
  children: ReactNode;
}

/**
 * Client-side route guard. Renders children only when the active workspace
 * grants the feature. Otherwise shows a polished access message.
 *
 * IMPORTANT: This is UX-only. Server-side RLS is the actual enforcement layer.
 */
export function RequireFeature({
  feature,
  title,
  description,
  children,
}: RequireFeatureProps) {
  const { can, isLoading, isStaff, access } = usePermissions();
  const { activeWorkspace, isLoading: wsLoading } = useWorkspace();
  const { isLoading: userLoading } = useCurrentUser();

  if (userLoading || wsLoading || isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!activeWorkspace) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-surface/60 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-elevated">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-foreground">
          No workspace selected
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {isStaff
            ? "Choose a client workspace from the sidebar to continue."
            : "Your Dream Wave Media account manager will send your activation link when your workspace is ready."}
        </p>
      </div>
    );
  }

  if (can(feature)) return <>{children}</>;

  // Staff should always be able to reach this (retainer_full by default), so
  // hitting this branch means staff is impersonating a client tier without the
  // feature, or an actual client is on a lower tier.
  return (
    <div className="space-y-4">
      <LockedPreview
        title={title ?? "Not included in your plan"}
        description={
          description ??
          (access?.status === "expired"
            ? "Your Dream Wave Media agreement has expired. Contact your account manager to renew and restore access to this tool."
            : "This workspace tool is included with 6- and 12-month Dream Wave Media retainers. Contact your account manager to upgrade.")
        }
      />
      <div className="text-center">
        <Link
          to="/home"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface/60 px-4 py-2 text-sm text-foreground hover:bg-elevated"
        >
          Back to overview
        </Link>
      </div>
    </div>
  );
}
