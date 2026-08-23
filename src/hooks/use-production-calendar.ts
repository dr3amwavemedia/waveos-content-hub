import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export interface ProductionCalendarItem {
  id: string;
  title: string;
  scheduled_at: string;
  location: string | null;
  status: string;
}

export function useProductionCalendar(workspaceId: string | null) {
  return useQuery({
    queryKey: ["production-calendar", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_projects")
        .select("id,title,scheduled_at,location,status")
        .eq("workspace_id", workspaceId!)
        .not("scheduled_at", "is", null)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).filter(
        (item): item is ProductionCalendarItem => item.scheduled_at !== null,
      );
    },
  });
}
