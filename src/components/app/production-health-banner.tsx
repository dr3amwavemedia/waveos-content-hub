import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

interface HealthIssue {
  id: string;
  message: string;
}

// Startup health check (admin-only): verifies the live database actually has
// the production columns/tables the app depends on. A migration that exists in
// the repo but was never applied shows up here instead of as a runtime crash
// on the Production "Today" panel.
async function runHealthCheck(): Promise<HealthIssue[]> {
  const issues: HealthIssue[] = [];

  const columnCheck = await db.from("production_projects").select("checked_in_at").limit(1);
  if (columnCheck.error) {
    const detail = String(columnCheck.error.message ?? columnCheck.error);
    if (/checked_in_at|42703|PGRST204/i.test(detail)) {
      issues.push({
        id: "checked_in_at",
        message:
          "Missing database migration: production_projects.checked_in_at — Production Today check-in/out will fail until the pending production migrations are applied.",
      });
    }
  }

  const tableCheck = await db.from("production_checklist_items").select("id").limit(1);
  if (tableCheck.error) {
    const detail = String(tableCheck.error.message ?? tableCheck.error);
    if (/production_checklist_items|42P01|PGRST205/i.test(detail)) {
      issues.push({
        id: "production_checklist_items",
        message:
          "Missing database migration: production_checklist_items table — shoot checklists will not load until the pending production migrations are applied.",
      });
    }
  }

  return issues;
}

export function ProductionHealthBanner({ enabled }: { enabled: boolean }) {
  const { data } = useQuery({
    queryKey: ["startup-health", "production-schema"],
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: runHealthCheck,
  });

  if (!enabled || !data?.length) return null;

  return (
    <div className="border-b border-warning/40 bg-warning/10 px-3 py-2 sm:px-6 lg:px-10" role="alert">
      <div className="mx-auto flex max-w-7xl items-start gap-2 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-warning">
            Admin notice — database out of sync
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-foreground">
            {data.map((issue) => (
              <li key={issue.id}>{issue.message}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
