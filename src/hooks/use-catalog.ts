import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CatalogItem } from "@/lib/catalog";

export type CatalogItemWithTemplate = CatalogItem & {
  document_templates: { id: string; name: string; version: number } | null;
};

/** Price-sheet catalog. Staff can read it; only the owner can change it. */
export function useCatalogItems(activeOnly = true) {
  return useQuery({
    queryKey: ["catalog-items", activeOnly],
    queryFn: async (): Promise<CatalogItemWithTemplate[]> => {
      let query = supabase
        .from("catalog_items")
        .select("*, document_templates(id,name,version)")
        .order("category")
        .order("name");
      if (activeOnly) query = query.eq("active", true);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as CatalogItemWithTemplate[];
    },
    staleTime: 60_000,
  });
}
