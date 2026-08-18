import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Clock,
  ListChecks,
  Loader2,
  MessageSquareText,
  Plus,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/app/workspace-context";
import { useCurrentUser } from "@/hooks/use-waveos";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Decision = "pending" | "approved" | "changes_requested" | "rejected";
type Section = "requests" | "checklist" | "timeline" | "preferences";
type RequestRow = {
  id: string;
  title: string;
  description: string | null;
  request_type: string;
  decision: Decision;
  response_note: string | null;
  due_at: string | null;
  status: string | null;
  preferred_at: string | null;
  reference_url: string | null;
  attachment_path: string | null;
};
type ItemRow = { id: string; title: string; checklist_type: string; status: string };
type ActivityRow = {
  id: string;
  action: string;
  safe_metadata: Record<string, unknown>;
  created_at: string;
};
const db = supabase as unknown as {
  // CRM Phase 4 tables are available after the included migration is applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: Error | null }>;
};
const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60";

export function ClientCommunicationCenter() {
  const { activeWorkspace } = useWorkspace();
  const { data: user } = useCurrentUser();
  const [section, setSection] = useState<Section>("requests");
  useEffect(() => {
    if (activeWorkspace?.id)
      void db.rpc("phase4_refresh_deadline_notifications", { _workspace_id: activeWorkspace.id });
  }, [activeWorkspace?.id]);
  if (!activeWorkspace)
    return <p className="text-sm text-muted-foreground">Select a workspace first.</p>;
  const tabs: Array<[Section, string, typeof Clock]> = [
    ["requests", "Requests", MessageSquareText],
    ["checklist", "Checklist", ListChecks],
    ["timeline", "Timeline", Clock],
    ["preferences", "Contact preferences", Settings2],
  ];
  return (
    <div className="space-y-5">
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface/50 p-1">
        {tabs.map(([value, label, Icon]) => (
          <button
            key={value}
            onClick={() => setSection(value)}
            className={cn(
              "inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium",
              section === value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
      {section === "requests" && (
        <Requests workspaceId={activeWorkspace.id} isStaff={Boolean(user?.isStaff)} />
      )}{" "}
      {section === "checklist" && (
        <Checklist workspaceId={activeWorkspace.id} isStaff={Boolean(user?.isStaff)} />
      )}{" "}
      {section === "timeline" && <Timeline workspaceId={activeWorkspace.id} />}{" "}
      {section === "preferences" && <Preferences workspaceId={activeWorkspace.id} />}
    </div>
  );
}

function Requests({ workspaceId, isStaff }: { workspaceId: string; isStaff: boolean }) {
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", type: "approval", due: "" });
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const q = useQuery({
    queryKey: ["phase4-requests", workspaceId],
    queryFn: async (): Promise<RequestRow[]> => {
      const { data, error } = await db
        .from("client_requests")
        .select(
          "id,title,description,request_type,decision,response_note,due_at,status,preferred_at,reference_url,attachment_path",
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const noteQ = useQuery({
    queryKey: ["phase4-internal-notes", workspaceId],
    enabled: isStaff,
    queryFn: async () => {
      const { data, error } = await db
        .from("client_request_internal_notes")
        .select("id,request_id,body")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("phase4_create_request", {
        _workspace_id: workspaceId,
        _title: form.title,
        _description: form.description || null,
        _request_type: form.type,
        _due_at: form.due ? new Date(form.due).toISOString() : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm({ title: "", description: "", type: "approval", due: "" });
      setShow(false);
      void qc.invalidateQueries({ queryKey: ["phase4-requests"] });
      toast.success("Client request created.");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not create request."),
  });
  const respond = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: Decision }) => {
      const { error } = await db.rpc("phase4_respond_to_request", {
        _request_id: id,
        _decision: decision,
        _response_note: responses[id] || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["phase4-requests"] });
      void qc.invalidateQueries({ queryKey: ["phase4-timeline"] });
      toast.success("Response saved.");
    },
  });
  const changeStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await db.rpc("update_client_service_request_status", {
        _request_id: id,
        _status: status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["phase4-requests"] });
      void qc.invalidateQueries({ queryKey: ["client-service-requests"] });
      toast.success("Request status updated.");
    },
  });
  const addNote = useMutation({
    mutationFn: async (id: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await db.from("client_request_internal_notes").insert({
        request_id: id,
        workspace_id: workspaceId,
        body: notes[id],
        created_by: auth.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      setNotes((old) => ({ ...old, [id]: "" }));
      void qc.invalidateQueries({ queryKey: ["phase4-internal-notes"] });
      toast.success("Internal note added.");
    },
  });
  return (
    <div className="space-y-4">
      {isStaff && (
        <div className="flex justify-end">
          <button
            onClick={() => setShow((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            New request
          </button>
        </div>
      )}
      {show && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="surface-card grid gap-3 p-4 sm:grid-cols-2"
        >
          <input
            required
            minLength={2}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="What needs approval?"
            className={field}
          />
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className={field}
          >
            <option value="approval">Approval</option>
            <option value="information">Information</option>
            <option value="asset">Asset</option>
            <option value="decision">Decision</option>
          </select>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Instructions for the client"
            className={cn(field, "sm:col-span-2")}
          />
          <input
            type="datetime-local"
            value={form.due}
            onChange={(e) => setForm({ ...form, due: e.target.value })}
            className={field}
          />
          <button
            disabled={create.isPending || form.title.trim().length < 2}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Create request
          </button>
        </form>
      )}
      {q.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (q.data ?? []).length === 0 ? (
        <Empty text="No client requests yet." />
      ) : (
        (q.data ?? []).map((r) => (
          <div key={r.id} className="surface-card space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{r.title}</h3>
                <p className="text-xs capitalize text-muted-foreground">
                  {r.request_type}
                  {r.due_at ? ` · Due ${new Date(r.due_at).toLocaleString()}` : ""}
                </p>
              </div>
              {r.status ? (
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold capitalize text-primary">
                  {r.status.replace("_", " ")}
                </span>
              ) : (
                <Badge decision={r.decision} />
              )}
            </div>
            {r.description && (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{r.description}</p>
            )}
            {r.response_note && (
              <p className="rounded-lg bg-elevated p-3 text-sm">
                <b>Response:</b> {r.response_note}
              </p>
            )}
            {r.reference_url && (
              <a
                href={r.reference_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-primary hover:underline"
              >
                Open reference link
              </a>
            )}
            {r.preferred_at && (
              <p className="text-sm text-muted-foreground">
                Preferred date: {new Date(r.preferred_at).toLocaleDateString()}
              </p>
            )}
            {r.attachment_path && <RequestAttachment path={r.attachment_path} />}
            {r.status && isStaff && (
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Request status
                <select
                  value={r.status}
                  disabled={changeStatus.isPending}
                  onChange={(e) => changeStatus.mutate({ id: r.id, status: e.target.value })}
                  className="mt-2 min-h-12 w-full rounded-lg border border-border bg-background px-3 text-sm font-medium capitalize text-foreground"
                >
                  <option value="submitted">Submitted</option>
                  <option value="reviewing">Reviewing</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
            )}
            {!r.status && r.decision === "pending" && (
              <>
                <textarea
                  value={responses[r.id] ?? ""}
                  onChange={(e) => setResponses((old) => ({ ...old, [r.id]: e.target.value }))}
                  placeholder="Add feedback"
                  className={field}
                />
                <div className="flex flex-wrap gap-2">
                  {(["approved", "changes_requested", "rejected"] as Decision[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => respond.mutate({ id: r.id, decision: d })}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs capitalize"
                    >
                      {d.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </>
            )}
            {isStaff && (
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Internal notes — hidden from clients
                </p>
                {(noteQ.data ?? [])
                  .filter((n: { request_id: string }) => n.request_id === r.id)
                  .map((n: { id: string; body: string }) => (
                    <p key={n.id} className="mb-1 text-xs text-muted-foreground">
                      {n.body}
                    </p>
                  ))}
                <div className="mt-2 flex gap-2">
                  <input
                    value={notes[r.id] ?? ""}
                    onChange={(e) => setNotes((old) => ({ ...old, [r.id]: e.target.value }))}
                    placeholder="Staff-only note"
                    className={field}
                  />
                  <button
                    onClick={() => addNote.mutate(r.id)}
                    disabled={!notes[r.id]?.trim()}
                    className="rounded-lg border border-border px-3 text-xs disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function RequestAttachment({ path }: { path: string }) {
  async function open() {
    const { data, error } = await supabase.storage
      .from("client-request-attachments")
      .createSignedUrl(path, 60);
    if (error) return toast.error("Could not open attachment.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
  return (
    <button
      onClick={open}
      className="min-h-11 rounded-lg border border-border px-3 text-sm font-medium"
    >
      Open attachment
    </button>
  );
}

function Checklist({ workspaceId, isStaff }: { workspaceId: string; isStaff: boolean }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [type, setType] = useState("onboarding");
  const q = useQuery({
    queryKey: ["phase4-checklist", workspaceId],
    queryFn: async (): Promise<ItemRow[]> => {
      const { data, error } = await db
        .from("client_checklist_items")
        .select("id,title,checklist_type,status")
        .eq("workspace_id", workspaceId)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["phase4-checklist"] });
    void qc.invalidateQueries({ queryKey: ["phase4-timeline"] });
  };
  const standard = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("phase4_add_standard_onboarding", {
        _workspace_id: workspaceId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast.success("Standard onboarding added.");
    },
  });
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("phase4_add_checklist_item", {
        _workspace_id: workspaceId,
        _title: title,
        _checklist_type: type,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTitle("");
      refresh();
    },
  });
  const change = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await db.rpc("phase4_set_checklist_status", {
        _item_id: id,
        _status: status,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  return (
    <div className="space-y-4">
      {isStaff && (
        <div className="surface-card space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => standard.mutate()}
              className="rounded-lg border border-border px-3 py-2 text-xs"
            >
              Add standard onboarding
            </button>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={cn(field, "w-auto")}
            >
              <option value="onboarding">Onboarding</option>
              <option value="project">Project</option>
            </select>
          </div>
          <div className="flex gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add checklist item"
              className={field}
            />
            <button
              onClick={() => add.mutate()}
              disabled={title.trim().length < 2}
              className="rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      )}
      {(q.data ?? []).length === 0 ? (
        <Empty text="No checklist items yet." />
      ) : (
        (q.data ?? []).map((i) => (
          <div key={i.id} className="surface-card flex items-center gap-3 p-4">
            <button
              onClick={() =>
                change.mutate({ id: i.id, status: i.status === "completed" ? "open" : "completed" })
              }
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border",
                i.status === "completed" && "border-success bg-success text-white",
              )}
            >
              {i.status === "completed" && <Check className="h-4 w-4" />}
            </button>
            <div>
              <p
                className={cn(
                  "text-sm font-medium",
                  i.status === "completed" && "line-through text-muted-foreground",
                )}
              >
                {i.title}
              </p>
              <p className="text-xs capitalize text-muted-foreground">{i.checklist_type}</p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function Timeline({ workspaceId }: { workspaceId: string }) {
  const q = useQuery({
    queryKey: ["phase4-timeline", workspaceId],
    queryFn: async (): Promise<ActivityRow[]> => {
      const { data, error } = await db
        .from("activity_logs")
        .select("id,action,safe_metadata,created_at")
        .eq("workspace_id", workspaceId)
        .in("action", [
          "client_request_created",
          "client_request_decided",
          "checklist_item_created",
          "checklist_status_changed",
          "workspace_created",
        ])
        .order("created_at", { ascending: false })
        .limit(75);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="surface-card divide-y divide-border p-0">
      {(q.data ?? []).length === 0 ? (
        <Empty text="No client activity yet." />
      ) : (
        (q.data ?? []).map((r) => (
          <div key={r.id} className="p-4">
            <p className="text-sm font-medium capitalize">
              {r.action.replaceAll("_", " ")}
              {typeof r.safe_metadata.title === "string" ? ` — ${r.safe_metadata.title}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(r.created_at).toLocaleString()}
            </p>
          </div>
        ))
      )}
    </div>
  );
}
function Preferences({ workspaceId }: { workspaceId: string }) {
  const [form, setForm] = useState({ method: "email", best: "", email: "", phone: "" });
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("phase4_save_contact_preferences", {
        _workspace_id: workspaceId,
        _preferred_method: form.method,
        _best_time: form.best || null,
        _contact_email: form.email || null,
        _contact_phone: form.phone || null,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Contact preferences saved."),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="surface-card grid gap-4 p-5 sm:grid-cols-2"
    >
      <select
        value={form.method}
        onChange={(e) => setForm({ ...form, method: e.target.value })}
        className={field}
      >
        <option value="email">Email</option>
        <option value="phone">Phone call</option>
        <option value="text">Text message</option>
        <option value="waveos">WaveOS</option>
      </select>
      <input
        value={form.best}
        onChange={(e) => setForm({ ...form, best: e.target.value })}
        placeholder="Best time to reach you"
        className={field}
      />
      <input
        type="email"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        placeholder="Contact email"
        className={field}
      />
      <input
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
        placeholder="Contact phone"
        className={field}
      />
      <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
        Save preferences
      </button>
    </form>
  );
}
function Badge({ decision }: { decision: Decision }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-1 text-[10px] font-semibold uppercase",
        decision === "approved"
          ? "bg-success/15 text-success"
          : decision === "pending"
            ? "bg-warning/15 text-warning"
            : "bg-destructive/10 text-destructive",
      )}
    >
      {decision.replace("_", " ")}
    </span>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="p-8 text-center text-sm text-muted-foreground">{text}</div>;
}
