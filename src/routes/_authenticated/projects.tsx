import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  Copy,
  Eye,
  EyeOff,
  FolderKanban,
  Loader2,
  Plus,
  Save,
  Trash2,
  UserPlus,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { accountDisplayName } from "@/lib/identity-display";
import { cn } from "@/lib/utils";

const db = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: Error | null }>;
};

export const Route = createFileRoute("/_authenticated/projects")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const isOwner = (roles ?? []).some((row) => row.role === "dream_wave_owner");
    if (!isOwner) throw redirect({ to: "/home" });
  },
  head: () => ({
    meta: [
      { title: "Production · Projects | WaveOS" },
      {
        name: "description",
        content:
          "Create, assign, and track Dream Wave Media production projects, staff assignments, notes, and milestones.",
      },
      { property: "og:title", content: "Production · Projects | WaveOS" },
      {
        property: "og:description",
        content: "Manage production projects, crew assignments, notes, and milestones in WaveOS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ProjectsPage,
});

const PROJECT_TYPES = [
  { value: "one_time", label: "One time" },
  { value: "retainer", label: "Retainer" },
  { value: "campaign", label: "Campaign" },
  { value: "wedding", label: "Wedding" },
];

const STATUSES = ["draft", "planning", "in_progress", "review", "complete"];

interface ProjectRow {
  id: string;
  name: string;
  business_name: string | null;
  client_name: string | null;
  project_type: string;
  description: string | null;
  status: string;
  is_active: boolean;
  client_visible: boolean;
  published_at: string | null;
  start_date: string | null;
  end_date: string | null;
  event_date: string | null;
  workspace_id: string | null;
  created_at: string;
}

interface StaffRow {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  staff_type: string | null;
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60";

function ProjectsPage() {
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftType, setDraftType] = useState("one_time");
  const [draftWorkspace, setDraftWorkspace] = useState("");

  const projectsQ = useQuery({
    queryKey: ["production", "projects"],
    queryFn: async () => {
      const { data, error } = await db
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProjectRow[];
    },
  });

  const workspacesQ = useQuery({
    queryKey: ["production", "projects", "workspaces"],
    queryFn: async () => {
      const { data, error } = await db
        .from("workspaces")
        .select("id,name,business_name,client_name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        name: string;
        business_name: string | null;
        client_name: string | null;
      }[];
    },
  });

  const staffQ = useQuery({
    queryKey: ["production", "projects", "staff"],
    queryFn: async () => {
      const { data, error } = await db.rpc("get_staff_directory");
      if (error) throw error;
      return (data ?? []) as StaffRow[];
    },
  });

  const visible = useMemo(
    () => (projectsQ.data ?? []).filter((p) => (showArchived ? !p.is_active : p.is_active)),
    [projectsQ.data, showArchived],
  );
  const selected = useMemo(
    () => (projectsQ.data ?? []).find((p) => p.id === selectedId) ?? null,
    [projectsQ.data, selectedId],
  );

  const refresh = () => qc.invalidateQueries({ queryKey: ["production", "projects"] });

  const createProject = useMutation({
    mutationFn: async () => {
      const workspace = (workspacesQ.data ?? []).find((w) => w.id === draftWorkspace);
      const { data, error } = await db
        .from("projects")
        .insert({
          name: draftName.trim(),
          project_type: draftType,
          workspace_id: draftWorkspace || null,
          business_name: workspace?.business_name ?? workspace?.name ?? null,
          client_name: workspace?.client_name ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: async (row) => {
      await refresh();
      setCreating(false);
      setDraftName("");
      setDraftWorkspace("");
      setSelectedId(row.id);
      toast.success("Project created as a draft.");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not create the project."),
  });

  const updateProject = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ProjectRow> }) => {
      const { error } = await db.from("projects").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not update the project."),
  });

  const duplicateProject = useMutation({
    mutationFn: async (project: ProjectRow) => {
      const { error } = await db.from("projects").insert({
        name: `${project.name} (copy)`,
        business_name: project.business_name,
        client_name: project.client_name,
        project_type: project.project_type,
        description: project.description,
        workspace_id: project.workspace_id,
        status: "draft",
        client_visible: false,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Project duplicated as a draft.");
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Production projects, crew assignments, notes, and milestones. New projects stay internal
            drafts until you publish them to the client.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-elevated"
          >
            {showArchived ? (
              <ArchiveRestore className="h-3.5 w-3.5" />
            ) : (
              <Archive className="h-3.5 w-3.5" />
            )}
            {showArchived ? "Show active" : "Show archived"}
          </button>
          <button
            onClick={() => setCreating((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> New project
          </button>
        </div>
      </header>

      {creating && (
        <div className="surface-card space-y-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">New project</p>
          <div className="grid gap-2 md:grid-cols-3">
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Project name"
              className={inputClass}
            />
            <select
              value={draftType}
              onChange={(e) => setDraftType(e.target.value)}
              className={inputClass}
            >
              {PROJECT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <select
              value={draftWorkspace}
              onChange={(e) => setDraftWorkspace(e.target.value)}
              className={inputClass}
            >
              <option value="">No client account</option>
              {(workspacesQ.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.business_name || w.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => createProject.mutate()}
            disabled={!draftName.trim() || createProject.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {createProject.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Create project
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="surface-card p-3">
          {projectsQ.isLoading ? (
            <p className="p-3 text-sm text-muted-foreground">Loading projects…</p>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title={showArchived ? "No archived projects" : "No projects yet"}
              body="Create your first production project to start assigning crew and tracking milestones."
            />
          ) : (
            <ul className="space-y-2">
              {visible.map((project) => (
                <li key={project.id}>
                  <button
                    onClick={() => setSelectedId(project.id)}
                    className={cn(
                      "w-full rounded-lg border border-border/70 p-3 text-left hover:bg-elevated",
                      selectedId === project.id && "border-primary/50 bg-primary/5",
                    )}
                  >
                    <p className="truncate text-sm font-medium">{project.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {project.business_name || "No business"} ·{" "}
                      {PROJECT_TYPES.find((t) => t.value === project.project_type)?.label ??
                        project.project_type}{" "}
                      · {project.status.replace("_", " ")}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0">
          {selected ? (
            <ProjectDetail
              key={selected.id}
              project={selected}
              staff={staffQ.data ?? []}
              onPatch={(patch) => updateProject.mutate({ id: selected.id, patch })}
              onDuplicate={() => duplicateProject.mutate(selected)}
            />
          ) : (
            <div className="surface-card p-6">
              <p className="text-sm text-muted-foreground">
                Select a project to view and edit its details.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectDetail({
  project,
  staff,
  onPatch,
  onDuplicate,
}: {
  project: ProjectRow;
  staff: StaffRow[];
  onPatch: (patch: Partial<ProjectRow>) => void;
  onDuplicate: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [businessName, setBusinessName] = useState(project.business_name ?? "");
  const [clientName, setClientName] = useState(project.client_name ?? "");
  const [startDate, setStartDate] = useState(project.start_date ?? "");
  const [eventDate, setEventDate] = useState(project.event_date ?? "");
  const [endDate, setEndDate] = useState(project.end_date ?? "");
  const [noteBody, setNoteBody] = useState("");
  const [noteVisibility, setNoteVisibility] = useState("internal");
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [position, setPosition] = useState("");

  const assignmentsQ = useQuery({
    queryKey: ["production", "projects", project.id, "staff"],
    queryFn: async () => {
      const { data, error } = await db
        .from("project_staff_assignments")
        .select("id,user_id,position,responsibilities")
        .eq("project_id", project.id);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        user_id: string;
        position: string | null;
        responsibilities: string | null;
      }[];
    },
  });

  const notesQ = useQuery({
    queryKey: ["production", "projects", project.id, "notes"],
    queryFn: async () => {
      const { data, error } = await db
        .from("project_notes")
        .select("id,body,visibility,created_at")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; body: string; visibility: string; created_at: string }[];
    },
  });

  const milestonesQ = useQuery({
    queryKey: ["production", "projects", project.id, "milestones"],
    queryFn: async () => {
      const { data, error } = await db
        .from("project_milestones")
        .select("id,title,status,due_at,is_active,sort_order")
        .eq("project_id", project.id)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        title: string;
        status: string;
        due_at: string | null;
        is_active: boolean;
        sort_order: number;
      }[];
    },
  });

  const invalidate = (key: string) =>
    qc.invalidateQueries({ queryKey: ["production", "projects", project.id, key] });

  const addAssignment = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("project_staff_assignments").insert({
        project_id: project.id,
        user_id: assignee,
        position: position.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setAssignee("");
      setPosition("");
      await invalidate("staff");
      toast.success("Staff assigned.");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not assign staff."),
  });

  const removeAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("project_staff_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate("staff"),
  });

  const addNote = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await db.from("project_notes").insert({
        project_id: project.id,
        body: noteBody.trim(),
        visibility: noteVisibility,
        author_id: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setNoteBody("");
      await invalidate("notes");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save the note."),
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("project_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate("notes"),
  });

  const addMilestone = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("project_milestones").insert({
        project_id: project.id,
        title: milestoneTitle.trim(),
        sort_order: (milestonesQ.data?.length ?? 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setMilestoneTitle("");
      await invalidate("milestones");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not add the milestone."),
  });

  const toggleMilestone = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await db.from("project_milestones").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate("milestones"),
  });

  const staffName = (userId: string) => {
    const member = staff.find((s) => s.user_id === userId);
    return accountDisplayName({
      firstName: member?.first_name,
      lastName: member?.last_name,
      email: member?.email,
      fallback: "Staff member",
    });
  };

  return (
    <div className="space-y-4">
      <section className="surface-card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Project details</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() =>
                onPatch({
                  client_visible: !project.client_visible,
                  published_at: !project.client_visible ? new Date().toISOString() : null,
                })
              }
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-elevated"
            >
              {project.client_visible ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              {project.client_visible ? "Hide from client" : "Publish to client"}
            </button>
            <button
              onClick={onDuplicate}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-elevated"
            >
              <Copy className="h-3.5 w-3.5" /> Duplicate
            </button>
            <button
              onClick={() => onPatch({ is_active: !project.is_active })}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-elevated"
            >
              {project.is_active ? (
                <Archive className="h-3.5 w-3.5" />
              ) : (
                <ArchiveRestore className="h-3.5 w-3.5" />
              )}
              {project.is_active ? "Archive" : "Restore"}
            </button>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            className={inputClass}
          />
          <select
            value={project.status}
            onChange={(e) => onPatch({ status: e.target.value })}
            className={inputClass}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Business name"
            className={inputClass}
          />
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Client name"
            className={inputClass}
          />
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Project description"
          className={inputClass}
        />
        <div className="grid gap-2 md:grid-cols-3">
          <label className="space-y-1 text-xs text-muted-foreground">
            Start date
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Shoot / event date <span className="text-primary">(shown to client)</span>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Wrap date
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Publish the project to the client and anything you enter here — description, dates,
          client-visible notes, milestones, and approved links — appears on their portal home and
          Your Projects page automatically.
        </p>
        <button
          onClick={() =>
            onPatch({
              name: name.trim() || project.name,
              description: description.trim() || null,
              business_name: businessName.trim() || null,
              client_name: clientName.trim() || null,
              start_date: startDate || null,
              event_date: eventDate || null,
              end_date: endDate || null,
            })
          }
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
        >
          <Save className="h-3.5 w-3.5" /> Save details
        </button>
      </section>

      <section className="surface-card space-y-3 p-4">
        <h2 className="text-sm font-semibold">Staff assignments</h2>
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className={inputClass}
          >
            <option value="">Select staff member</option>
            {staff.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {staffName(s.user_id)}
              </option>
            ))}
          </select>
          <input
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="Position (e.g. Lead videographer)"
            className={inputClass}
          />
          <button
            onClick={() => addAssignment.mutate()}
            disabled={!assignee || addAssignment.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            <UserPlus className="h-3.5 w-3.5" /> Assign
          </button>
        </div>
        <ul className="space-y-2">
          {(assignmentsQ.data ?? []).map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-lg border border-border/70 p-2"
            >
              <span className="min-w-0 truncate text-sm">
                {staffName(a.user_id)}
                {a.position ? <span className="text-muted-foreground"> · {a.position}</span> : null}
              </span>
              <button
                onClick={() => removeAssignment.mutate(a.id)}
                className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-elevated"
                aria-label="Remove assignment"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {!assignmentsQ.isLoading && !(assignmentsQ.data ?? []).length && (
            <li className="text-xs text-muted-foreground">No staff assigned yet.</li>
          )}
        </ul>
      </section>

      <section className="surface-card space-y-3 p-4">
        <h2 className="text-sm font-semibold">Notes</h2>
        <textarea
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
          rows={2}
          placeholder="Add a note"
          className={inputClass}
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={noteVisibility}
            onChange={(e) => setNoteVisibility(e.target.value)}
            className={cn(inputClass, "w-auto")}
          >
            <option value="internal">Internal only</option>
            <option value="client">Visible to client</option>
          </select>
          <button
            onClick={() => addNote.mutate()}
            disabled={!noteBody.trim() || addNote.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add note
          </button>
        </div>
        <ul className="space-y-2">
          {(notesQ.data ?? []).map((note) => (
            <li key={note.id} className="rounded-lg border border-border/70 p-2">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 whitespace-pre-wrap break-words text-sm">{note.body}</p>
                <button
                  onClick={() => deleteNote.mutate(note.id)}
                  className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-elevated"
                  aria-label="Delete note"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                {note.visibility === "client" ? "Client visible" : "Internal"}
              </p>
            </li>
          ))}
          {!notesQ.isLoading && !(notesQ.data ?? []).length && (
            <li className="text-xs text-muted-foreground">No notes yet.</li>
          )}
        </ul>
      </section>

      <section className="surface-card space-y-3 p-4">
        <h2 className="text-sm font-semibold">Milestones</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={milestoneTitle}
            onChange={(e) => setMilestoneTitle(e.target.value)}
            placeholder="Milestone title"
            className={cn(inputClass, "flex-1 min-w-[180px]")}
          />
          <button
            onClick={() => addMilestone.mutate()}
            disabled={!milestoneTitle.trim() || addMilestone.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        <ul className="space-y-2">
          {(milestonesQ.data ?? []).map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 p-2"
            >
              <span className="min-w-0 truncate text-sm">{m.title}</span>
              <div className="flex items-center gap-2">
                <select
                  value={m.status}
                  onChange={(e) =>
                    toggleMilestone.mutate({ id: m.id, patch: { status: e.target.value } })
                  }
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In progress</option>
                  <option value="done">Done</option>
                </select>
                <button
                  onClick={() =>
                    toggleMilestone.mutate({ id: m.id, patch: { is_active: !m.is_active } })
                  }
                  className="rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated"
                >
                  {m.is_active ? "Active" : "Inactive"}
                </button>
              </div>
            </li>
          ))}
          {!milestonesQ.isLoading && !(milestonesQ.data ?? []).length && (
            <li className="text-xs text-muted-foreground">No milestones yet.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
