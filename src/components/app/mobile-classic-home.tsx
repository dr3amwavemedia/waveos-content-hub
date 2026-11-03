import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";

import { MobileCommandCenter } from "@/components/app/mobile-command-center";
import { MobileRecentMedia } from "@/components/app/mobile-recent-media";
import { useWorkspace } from "@/components/app/workspace-context";
import { usePermissions } from "@/hooks/use-permissions";
import { useCurrentUser } from "@/hooks/use-waveos";
import { supabase } from "@/integrations/supabase/client";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** The familiar phone command center stays separate from the desktop dashboard. */
export function MobileClassicHome() {
  const { data: user } = useCurrentUser();
  const { activeWorkspace } = useWorkspace();
  const { can } = usePermissions();
  const workspaceId = activeWorkspace?.id;
  const isPublicOs = activeWorkspace?.data_source === "os_data";

  const stats = useQuery({
    queryKey: ["mobile-classic-home", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const [scheduled, awaiting, published, upcoming, drafts, failed] = await Promise.all([
        supabase
          .from("content_items")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId!)
          .in("status", ["scheduled", "approved"]),
        supabase
          .from("content_items")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId!)
          .in("status", ["in_review", "changes_requested"]),
        supabase
          .from("content_items")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId!)
          .eq("status", "published"),
        supabase
          .from("content_items")
          .select("id,title,scheduled_at,status,metadata,media_asset_ids")
          .eq("workspace_id", workspaceId!)
          .in("status", ["scheduled", "approved"])
          .not("scheduled_at", "is", null)
          .gte("scheduled_at", new Date().toISOString())
          .order("scheduled_at", { ascending: true })
          .limit(5),
        supabase
          .from("content_items")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId!)
          .eq("status", "draft"),
        supabase
          .from("content_items")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId!)
          .eq("status", "failed"),
      ]);
      const result = [scheduled, awaiting, published, upcoming, drafts, failed].find(
        (entry) => entry.error,
      );
      if (result?.error) throw result.error;
      return {
        scheduledCount: scheduled.count ?? 0,
        awaitingCount: awaiting.count ?? 0,
        publishedCount: published.count ?? 0,
        draftCount: drafts.count ?? 0,
        failedCount: failed.count ?? 0,
        upcoming: (upcoming.data ?? []) as Array<{
          id: string;
          title: string | null;
          scheduled_at: string;
          status: string;
          metadata?: unknown;
          media_asset_ids?: string[] | null;
        }>,
      };
    },
  });

  const firstName = user?.firstName?.trim().split(/\s+/)[0] || "there";

  return (
    <section className="mobile-classic-home space-y-5 sm:hidden" aria-label="Mobile overview">
      <header className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/20 via-primary-glow/10 to-transparent p-4 shadow-[var(--shadow-glow)]">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("waveos:open-menu"))}
          className="flex max-w-full items-center gap-1 text-sm font-semibold text-primary-glow"
          aria-label="Switch workspace"
        >
          <span className="truncate">{activeWorkspace?.name ?? "WaveOS"}</span>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </button>
        <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight text-foreground">
          {greeting()}, {firstName} 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">What do you want to work on today?</p>
      </header>

      <MobileCommandCenter
        can={can}
        workspaceName={activeWorkspace?.name}
        stats={stats.data}
        loading={stats.isPending}
        approvalsTo={isPublicOs ? "/social" : "/approvals"}
      />
      {stats.isError && (
        <button
          type="button"
          className="min-h-11 w-full rounded-2xl border border-primary/25 bg-primary/10 px-4 text-sm font-semibold text-primary-glow"
          onClick={() => void stats.refetch()}
        >
          Reload workspace activity
        </button>
      )}
      <MobileRecentMedia workspaceId={workspaceId} />
    </section>
  );
}
