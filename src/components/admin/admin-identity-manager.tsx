import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, Pencil, Save, UserCog } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useActingStaff } from "@/hooks/use-acting-staff";
import { accountDisplayName } from "@/lib/identity-display";

const db = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
};

type StaffType = "sales" | "media_manager" | "crew" | null;
type StaffRow = {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: "dream_wave_owner" | "dream_wave_team";
  staff_type: StaffType;
};
type WorkspaceRow = { id: string; name: string; business_name: string | null; client_name: string | null };
type ContactRow = { id: string; first_name: string; last_name: string | null; is_primary: boolean };
type LeadRow = { id: string; business_name: string; crm_contacts: ContactRow[] };

export function AdminIdentityManager() {
  const qc = useQueryClient();
  const acting = useActingStaff();
  const [staffEdit, setStaffEdit] = useState<StaffRow | null>(null);
  const [workspaceEdit, setWorkspaceEdit] = useState<WorkspaceRow | null>(null);
  const [leadEdit, setLeadEdit] = useState<LeadRow | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [name, setName] = useState("");
  const [contactFirst, setContactFirst] = useState("");
  const [contactLast, setContactLast] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [clientName, setClientName] = useState("");

  const staffQ = useQuery({
    queryKey: ["admin", "identity-staff"],
    queryFn: async () => {
      const { data, error } = await db.rpc("get_staff_directory");
      if (error) throw error;
      return (data ?? []) as StaffRow[];
    },
  });
  const workspacesQ = useQuery({
    queryKey: ["admin", "identity-workspaces"],
    queryFn: async () => {
      const { data, error } = await db.from("workspaces").select("id,name,business_name,client_name").order("name");
      if (error) throw error;
      return (data ?? []) as WorkspaceRow[];
    },
  });
  const leadsQ = useQuery({
    queryKey: ["admin", "identity-leads"],
    queryFn: async () => {
      const { data, error } = await db
        .from("crm_accounts")
        .select("id,business_name,crm_contacts(id,first_name,last_name,is_primary)")
        .order("business_name");
      if (error) throw error;
      return (data ?? []) as LeadRow[];
    },
  });

  const editableStaff = useMemo(
    () => (staffQ.data ?? []).filter((member) => member.role === "dream_wave_team"),
    [staffQ.data],
  );

  const renameStaff = useMutation({
    mutationFn: async () => {
      if (!staffEdit) return;
      const { error } = await db.rpc("admin_update_staff_name", {
        _target_user: staffEdit.user_id,
        _first_name: firstName,
        _last_name: lastName,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "staff"] }),
        qc.invalidateQueries({ queryKey: ["admin", "identity-staff"] }),
        qc.invalidateQueries({ queryKey: ["crm", "staff"] }),
      ]);
      setStaffEdit(null);
      toast.success("Staff name updated.");
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not update staff name."),
  });

  const renameWorkspace = useMutation({
    mutationFn: async () => {
      if (!workspaceEdit) return;
      const { error } = await db.rpc("admin_update_workspace_name", {
        _workspace_id: workspaceEdit.id,
        _name: name,
      });
      if (error) throw error;
      const { error: fieldsError } = await db
        .from("workspaces")
        .update({ business_name: businessName.trim() || null, client_name: clientName.trim() || null })
        .eq("id", workspaceEdit.id);
      if (fieldsError) throw fieldsError;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "identity-workspaces"] }),
        qc.invalidateQueries({ queryKey: ["clients", "workspaces"] }),
        qc.invalidateQueries({ queryKey: ["waveos", "workspaces"] }),
      ]);
      setWorkspaceEdit(null);
      toast.success("Client name updated.");
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not update client name."),
  });

  const renameLead = useMutation({
    mutationFn: async () => {
      if (!leadEdit) return;
      const primary = leadEdit.crm_contacts?.find((contact) => contact.is_primary) ?? leadEdit.crm_contacts?.[0];
      const { error } = await db.rpc("admin_update_crm_identity", {
        _account_id: leadEdit.id,
        _business_name: name,
        _contact_id: primary?.id ?? null,
        _first_name: contactFirst || null,
        _last_name: contactLast || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "identity-leads"] }),
        qc.invalidateQueries({ queryKey: ["crm"] }),
      ]);
      setLeadEdit(null);
      toast.success("Lead name updated.");
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not update lead name."),
  });

  const startActing = async (member: StaffRow) => {
    acting.enable({
      userId: member.user_id,
      email: member.email ?? "",
      firstName: member.first_name,
      lastName: member.last_name,
      staffType: member.staff_type ?? "sales",
    });
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["waveos", "current-user"] }),
      qc.invalidateQueries({ queryKey: ["waveos", "workspaces"] }),
    ]);
    window.location.assign("/home");
  };

  return (
    <div className="surface-card p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/15 p-2 text-primary"><UserCog className="h-5 w-5" /></div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Acting staff & name manager</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Preview WaveOS as a staff member, or correct staff, client, and lead names without recreating accounts.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <section className="rounded-xl border border-border bg-background/35 p-4">
          <h3 className="text-sm font-semibold">Staff</h3>
          <div className="mt-3 space-y-2">
            {editableStaff.map((member) => (
              <div key={member.user_id} className="flex items-center gap-2 rounded-lg border border-border/70 p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{accountDisplayName({ firstName: member.first_name, lastName: member.last_name, email: member.email, fallback: "Staff member" })}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{member.email} · {member.staff_type === "media_manager" ? "Media Manager" : member.staff_type === "crew" ? "Crew" : "Sales"}</p>
                  {!member.first_name?.trim() && !member.last_name?.trim() && (
                    <p className="mt-1 text-[10px] font-medium text-warning">Name needs identification</p>
                  )}
                </div>
                <button
                  onClick={() => void startActing(member)}
                  className="rounded-md border border-primary/30 p-1.5 text-primary hover:bg-primary/10"
                  title="Act as this staff member"
                ><Eye className="h-4 w-4" /></button>
                <button
                  onClick={() => {
                    setStaffEdit(member);
                    setFirstName(member.first_name ?? "");
                    setLastName(member.last_name ?? "");
                  }}
                  className="rounded-md border border-border p-1.5 hover:bg-elevated"
                  title="Edit staff name"
                ><Pencil className="h-4 w-4" /></button>
              </div>
            ))}
            {!staffQ.isLoading && !editableStaff.length && <p className="text-xs text-muted-foreground">No staff members yet.</p>}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-background/35 p-4">
          <h3 className="text-sm font-semibold">Clients</h3>
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
            {(workspacesQ.data ?? []).map((workspace) => (
              <button
                key={workspace.id}
                onClick={() => {
                  setWorkspaceEdit(workspace);
                  setLeadEdit(null);
                  setName(workspace.name);
                  setBusinessName(workspace.business_name ?? "");
                  setClientName(workspace.client_name ?? "");
                }}
                className="flex w-full items-center justify-between rounded-lg border border-border/70 p-2 text-left hover:bg-elevated"
              >
                <span className="truncate text-sm">{workspace.name}</span><Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-background/35 p-4">
          <h3 className="text-sm font-semibold">Leads</h3>
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
            {(leadsQ.data ?? []).map((lead) => (
              <button
                key={lead.id}
                onClick={() => {
                  const primary = lead.crm_contacts?.find((contact) => contact.is_primary) ?? lead.crm_contacts?.[0];
                  setLeadEdit(lead);
                  setWorkspaceEdit(null);
                  setName(lead.business_name);
                  setContactFirst(primary?.first_name ?? "");
                  setContactLast(primary?.last_name ?? "");
                }}
                className="flex w-full items-center justify-between rounded-lg border border-border/70 p-2 text-left hover:bg-elevated"
              >
                <span className="truncate text-sm">{lead.business_name}</span><Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      </div>

      {staffEdit && (
        <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Edit staff name</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <button onClick={() => renameStaff.mutate()} disabled={renameStaff.isPending || !firstName.trim()} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">
            {renameStaff.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save staff name
          </button>
        </div>
      )}

      {(workspaceEdit || leadEdit) && (
        <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{workspaceEdit ? "Edit client name" : "Edit lead name"}</p>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          {workspaceEdit && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Business name (optional)" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client name (optional)" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
          )}
          {leadEdit && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input value={contactFirst} onChange={(e) => setContactFirst(e.target.value)} placeholder="Primary contact first name" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <input value={contactLast} onChange={(e) => setContactLast(e.target.value)} placeholder="Primary contact last name" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
          )}
          <button onClick={() => workspaceEdit ? renameWorkspace.mutate() : renameLead.mutate()} disabled={!name.trim() || renameWorkspace.isPending || renameLead.isPending} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">
            {(renameWorkspace.isPending || renameLead.isPending) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save changes
          </button>
        </div>
      )}
    </div>
  );
}
