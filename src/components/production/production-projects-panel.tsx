import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  Loader2,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Plus,
  RefreshCw,
  Users2,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-waveos";
import { errorMessage } from "@/lib/error-message";
import { formatInTimeZone, zonedDateTimeToIso } from "@/lib/date-time";

type ClientContact = {
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  is_primary: boolean;
};

type ClientAccount = {
  id: string;
  business_name: string;
  linked_workspace_id: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  industry: string | null;
  preferred_contact_method: string | null;
  crm_contacts: ClientContact[];
};

type ClientSnapshot = {
  businessName: string;
  workspaceId: string | null;
  email: string | null;
  phone: string | null;
  industry: string | null;
  preferredContactMethod: string | null;
  address: string | null;
  primaryContact: {
    name: string;
    email: string | null;
    phone: string | null;
    jobTitle: string | null;
  } | null;
};

type ProductionProject = {
  id: string;
  title: string;
  crm_account_id: string;
  workspace_id: string | null;
  assigned_to: string | null;
  scheduled_at: string | null;
  location: string | null;
  status: string;
  client_snapshot: ClientSnapshot;
  client_synced_at: string;
};

const db = supabase as unknown as {
  // Generated database types land after the production migration is applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const STATUS_LABEL: Record<string, string> = {
  assigned: "Assigned",
  pre_production: "Pre-production",
  shooting: "Shooting",
  uploading: "Uploading",
  editing: "Editing",
  complete: "Complete",
};

function snapshotFor(account: ClientAccount): ClientSnapshot {
  const primary =
    account.crm_contacts.find((contact) => contact.is_primary) ?? account.crm_contacts[0];
  const address = [
    account.address_line1,
    account.address_line2,
    [account.city, account.state].filter(Boolean).join(", "),
    account.postal_code,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    businessName: account.business_name,
    workspaceId: account.linked_workspace_id,
    email: account.email,
    phone: account.phone,
    industry: account.industry,
    preferredContactMethod: account.preferred_contact_method,
    address: address || null,
    primaryContact: primary
      ? {
          name: [primary.first_name, primary.last_name].filter(Boolean).join(" "),
          email: primary.email,
          phone: primary.phone,
          jobTitle: primary.job_title,
        }
      : null,
  };
}

export function ProductionProjectsPanel() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [location, setLocation] = useState("");

  const clientsQ = useQuery({
    queryKey: ["production", "clients"],
    queryFn: async () => {
      const { data, error } = await db
        .from("crm_accounts")
        .select(
          "id,business_name,linked_workspace_id,email,phone,address_line1,address_line2,city,state,postal_code,industry,preferred_contact_method,crm_contacts(first_name,last_name,email,phone,job_title,is_primary)",
        )
        .is("archived_at", null)
        .order("business_name");
      if (error) throw error;
      return (data ?? []) as ClientAccount[];
    },
  });

  const workspaceTimeZonesQ = useQuery({
    queryKey: ["production", "client-workspace-timezones", clientsQ.data],
    enabled: !!clientsQ.data,
    queryFn: async () => {
      const workspaceIds = Array.from(
        new Set((clientsQ.data ?? []).flatMap((client) => client.linked_workspace_id ?? [])),
      );
      if (!workspaceIds.length) return new Map<string, string>();
      const { data, error } = await db
        .from("workspaces")
        .select("id,timezone")
        .in("id", workspaceIds);
      if (error) throw error;
      return new Map<string, string>(
        (data ?? []).map((workspace: { id: string; timezone: string | null }) => [
          workspace.id,
          workspace.timezone || "UTC",
        ]),
      );
    },
  });

  const selectedClient = clientsQ.data?.find((client) => client.id === clientId);
  const selectedTimeZone = selectedClient?.linked_workspace_id
    ? (workspaceTimeZonesQ.data?.get(selectedClient.linked_workspace_id) ?? "UTC")
    : "UTC";

  const projectsQ = useQuery({
    queryKey: ["production", "projects"],
    queryFn: async () => {
      const { data, error } = await db
        .from("production_projects")
        .select(
          "id,title,crm_account_id,workspace_id,assigned_to,scheduled_at,location,status,client_snapshot,client_synced_at",
        )
        .order("scheduled_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as ProductionProject[];
    },
  });

  const createProject = useMutation({
    mutationFn: async () => {
      const client = clientsQ.data?.find((entry) => entry.id === clientId);
      if (!client) throw new Error("Choose a client.");
      if (!title.trim()) throw new Error("Enter a production title.");
      let assignmentTimeZone = "UTC";
      if (client.linked_workspace_id) {
        const { data: workspace, error: workspaceError } = await db
          .from("workspaces")
          .select("timezone")
          .eq("id", client.linked_workspace_id)
          .single();
        if (workspaceError) throw workspaceError;
        assignmentTimeZone = workspace.timezone || "UTC";
      }
      const { error } = await db.rpc("assign_production_project", {
        _title: title.trim(),
        _crm_account_id: client.id,
        _assigned_to: user?.userId ?? null,
        _scheduled_at: scheduledAt ? zonedDateTimeToIso(scheduledAt, assignmentTimeZone) : null,
        _location: location.trim() || null,
        _client_snapshot: snapshotFor(client),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTitle("");
      setClientId("");
      setScheduledAt("");
      setLocation("");
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["production", "projects"] });
      qc.invalidateQueries({ queryKey: ["production-calendar"] });
      toast.success("Production assigned with synced client information.");
    },
    onError: (error: unknown) => toast.error(errorMessage(error, "Could not assign production.")),
  });

  const syncClient = useMutation({
    mutationFn: async (project: ProductionProject) => {
      const client = clientsQ.data?.find((entry) => entry.id === project.crm_account_id);
      if (!client) throw new Error("The linked CRM client could not be found.");
      const { error } = await db
        .from("production_projects")
        .update({
          workspace_id: client.linked_workspace_id,
          client_snapshot: snapshotFor(client),
          client_synced_at: new Date().toISOString(),
        })
        .eq("id", project.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production", "projects"] });
      qc.invalidateQueries({ queryKey: ["production-calendar"] });
      toast.success("Client information synced from WaveCRM.");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not sync client information."),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await db.from("production_projects").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production", "projects"] });
      qc.invalidateQueries({ queryKey: ["production-calendar"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not update production."),
  });

  return (
    <section className="rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Users2 className="h-5 w-5 text-primary" />
            Assigned productions
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Link every production to its WaveCRM client and workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating((current) => !current)}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground sm:w-auto sm:rounded-full"
        >
          <Plus className="h-4 w-4" />
          Assign production
        </button>
      </div>

      {creating && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createProject.mutate();
          }}
          className="grid gap-4 border-b border-border bg-primary/5 p-4 md:grid-cols-2 xl:grid-cols-4 xl:p-5"
        >
          <label className="space-y-1 xl:col-span-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Production title
            </span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Darcie listing video"
              className="min-h-12 w-full rounded-xl border border-border bg-background px-3 py-3 text-base outline-none focus:border-primary sm:text-sm"
            />
            {scheduledAt && (
              <span className="block text-[10px] text-muted-foreground">
                Client timezone: {selectedTimeZone}
              </span>
            )}
          </label>
          <label className="space-y-1 xl:col-span-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Client
            </span>
            <select
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              className="min-h-12 w-full rounded-xl border border-border bg-background px-3 py-3 text-base outline-none focus:border-primary sm:text-sm"
            >
              <option value="">Select WaveCRM client</option>
              {(clientsQ.data ?? []).map((client) => (
                <option key={client.id} value={client.id}>
                  {client.business_name}
                  {client.linked_workspace_id ? "" : " · CRM only"}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Shoot date
            </span>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              className="min-h-12 w-full rounded-xl border border-border bg-background px-3 py-3 text-base outline-none focus:border-primary sm:text-sm"
            />
          </label>
          <label className="space-y-1 md:col-span-1 xl:col-span-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Location
            </span>
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Shoot address or meeting point"
              className="min-h-12 w-full rounded-xl border border-border bg-background px-3 py-3 text-base outline-none focus:border-primary sm:text-sm"
            />
          </label>
          <div className="grid grid-cols-2 items-end gap-2 md:flex md:justify-end">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="min-h-12 rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              disabled={createProject.isPending || !title.trim() || !clientId}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {createProject.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Assign
            </button>
          </div>
        </form>
      )}

      <div className="p-3 sm:p-5">
        {projectsQ.isLoading ? (
          <div className="flex justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading productions…
          </div>
        ) : (projectsQ.data ?? []).length === 0 ? (
          <div className="py-10 text-center">
            <Building2 className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-semibold text-foreground">
              No productions assigned yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Assign a production and its client details will travel with the project.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {projectsQ.data!.map((project) => {
              const client = project.client_snapshot ?? ({} as ClientSnapshot);
              const projectTimeZone = project.workspace_id
                ? (workspaceTimeZonesQ.data?.get(project.workspace_id) ?? "UTC")
                : "UTC";
              return (
                <article
                  key={project.id}
                  className="rounded-2xl border border-border bg-elevated/35 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {project.title}
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-primary">
                        <Building2 className="h-3.5 w-3.5" />
                        {client.businessName || "Linked client"}
                      </div>
                    </div>
                    <select
                      value={project.status}
                      onChange={(event) =>
                        updateStatus.mutate({ id: project.id, status: event.target.value })
                      }
                      className="min-h-12 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground sm:min-h-10 sm:w-auto sm:text-xs"
                    >
                      {Object.entries(STATUS_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 sm:text-xs">
                    {project.scheduled_at && (
                      <div className="flex min-h-11 items-center gap-2 rounded-xl bg-background/50 px-3 py-2">
                        <CalendarDays className="h-3.5 w-3.5 text-primary" />
                        {formatInTimeZone(project.scheduled_at, projectTimeZone, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </div>
                    )}
                    {(project.location || client.address) && (
                      <a
                        href={`https://maps.apple.com/?q=${encodeURIComponent(project.location || client.address || "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-11 items-center gap-2 rounded-xl bg-background/50 px-3 py-2 text-foreground"
                      >
                        <MapPin className="h-3.5 w-3.5 text-primary" />
                        <span className="min-w-0 flex-1 truncate">
                          {project.location || client.address}
                        </span>
                        <Navigation className="h-3.5 w-3.5 shrink-0 text-primary" />
                      </a>
                    )}
                    {client.primaryContact && (
                      <div className="space-y-2 rounded-xl bg-background/50 p-3 sm:col-span-2">
                        <div className="font-medium text-foreground">
                          {client.primaryContact.name}
                        </div>
                        <div className="grid gap-2 sm:flex">
                          {client.primaryContact.phone && (
                            <a
                              href={`tel:${client.primaryContact.phone}`}
                              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 font-semibold text-foreground"
                            >
                              <Phone className="h-4 w-4 text-primary" /> Call
                            </a>
                          )}
                          {client.primaryContact.email && (
                            <a
                              href={`mailto:${client.primaryContact.email}`}
                              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 font-semibold text-foreground"
                            >
                              <Mail className="h-4 w-4 text-primary" /> Email
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      Synced {new Date(project.client_synced_at).toLocaleString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => syncClient.mutate(project)}
                      disabled={syncClient.isPending}
                      className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-primary disabled:opacity-50"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Sync client info
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
