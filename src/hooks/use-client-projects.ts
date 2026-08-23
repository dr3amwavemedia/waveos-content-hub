import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Client-facing project reads. RLS (`is_project_client`) is the real gate:
// a client only ever receives projects for their workspace that are active,
// client-visible and published. The filters below mirror that server rule so
// the UI never optimistically renders something the server would deny.
const db = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export interface ClientProject {
  id: string;
  name: string;
  business_name: string | null;
  client_name: string | null;
  project_type: string;
  description: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  event_date: string | null;
  published_at: string | null;
}

export interface ClientProjectMilestone {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  status: string;
  sort_order: number;
}

export interface ClientProjectNote {
  id: string;
  project_id: string;
  body: string;
  created_at: string;
}

export interface ClientProjectReference {
  id: string;
  project_id: string;
  title: string;
  url: string;
  kind: string;
}

export interface ClientProjectChangeRequest {
  id: string;
  title: string;
  status: string;
  updated_at: string;
}

// Client-initiated change requests (client_requests with a service status).
// Submitted from the project detail "Request a change" form; staff move them
// through submitted → reviewing → scheduled → in_progress → completed/closed.
export interface ClientServiceRequest {
  id: string;
  title: string;
  description: string | null;
  request_type: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ClientProjectBundle {
  projects: ClientProject[];
  milestones: ClientProjectMilestone[];
  notes: ClientProjectNote[];
  references: ClientProjectReference[];
  // Workspace-scoped: content the client asked to be changed. Shown in every
  // project detail so "requested changes" is visible in one place.
  changeRequests: ClientProjectChangeRequest[];
  serviceRequests: ClientServiceRequest[];
}

async function loadClientProjects(workspaceId: string): Promise<ClientProjectBundle> {
  const { data: projects, error } = await db
    .from("projects")
    .select(
      "id,name,business_name,client_name,project_type,description,status,start_date,end_date,event_date,published_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .eq("client_visible", true)
    .not("published_at", "is", null)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (projects ?? []) as ClientProject[];

  const changeRequestsQ = await db
    .from("content_items")
    .select("id,title,status,updated_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "changes_requested")
    .order("updated_at", { ascending: false });
  const changeRequests = (changeRequestsQ.data ?? []) as ClientProjectChangeRequest[];

  const ids = rows.map((project) => project.id);
  if (!ids.length) return { projects: [], milestones: [], notes: [], references: [], changeRequests };

  const [milestones, notes, references] = await Promise.all([
    db
      .from("project_milestones")
      .select("id,project_id,title,description,due_at,status,sort_order")
      .in("project_id", ids)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    db
      .from("project_notes")
      .select("id,project_id,body,created_at")
      .in("project_id", ids)
      .eq("visibility", "client")
      .order("created_at", { ascending: false }),
    db
      .from("project_references")
      .select("id,project_id,title,url,kind")
      .in("project_id", ids)
      .eq("is_active", true)
      .eq("is_approved", true)
      .order("created_at", { ascending: true }),
  ]);

  return {
    projects: rows,
    milestones: (milestones.data ?? []) as ClientProjectMilestone[],
    notes: (notes.data ?? []) as ClientProjectNote[],
    references: (references.data ?? []) as ClientProjectReference[],
    changeRequests,
  };
}

export function useClientProjects(workspaceId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["client-projects", workspaceId],
    enabled: !!workspaceId && enabled,
    staleTime: 60_000,
    queryFn: () => loadClientProjects(workspaceId!),
  });
}
