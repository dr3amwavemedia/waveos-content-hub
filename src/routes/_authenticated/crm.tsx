import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Download,
  Link2,
  Loader2,
  MessageSquareText,
  PhoneCall,
  Plus,
  Search,
  Trash2,
  Upload,
  UserPlus,
  UserRound,
  Users2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { downloadCsv, safeCsvFilename, type CrmCsvRow } from "@/lib/crm-csv";
import { parseBloomLeadsCsv } from "@/lib/bloom-csv";

export const Route = createFileRoute("/_authenticated/crm")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    if (!(roles ?? []).some((r) => r.role === "dream_wave_owner" || r.role === "dream_wave_team")) {
      throw redirect({ to: "/home" });
    }
  },
  component: CrmPage,
  head: () => ({ meta: [{ title: "CRM — WaveOS" }, { name: "robots", content: "noindex" }] }),
});

const STAGES = [
  "new_lead",
  "contacted",
  "discovery_scheduled",
  "qualified",
  "proposal_sent",
  "negotiating",
  "won",
  "lost",
  "archived",
] as const;
type Stage = (typeof STAGES)[number];
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
type Priority = (typeof PRIORITIES)[number];

const STAGE_LABEL: Record<Stage, string> = {
  new_lead: "New Lead",
  contacted: "Contacted",
  discovery_scheduled: "Discovery Scheduled",
  qualified: "Qualified",
  proposal_sent: "Proposal Sent",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
  archived: "Archived",
};

interface Contact {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
}
interface Account {
  id: string;
  business_name: string;
  website: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  industry: string | null;
  interested_services: string[];
  lead_source: string | null;
  referral_name: string | null;
  stage: Stage;
  priority: Priority;
  estimated_value_cents: number | null;
  assigned_to: string | null;
  preferred_contact_method: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  linked_workspace_id: string | null;
  created_at: string;
  updated_at: string;
  crm_contacts: Contact[];
}

interface Task {
  id: string;
  account_id: string | null;
  title: string;
  due_at: string | null;
  priority: Priority;
  status: "open" | "in_progress" | "completed" | "cancelled";
  assigned_to: string | null;
}

interface StaffMember {
  id: string;
  name: string;
  isOwner: boolean;
}

interface StaffDirectoryRow {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: "dream_wave_owner" | "dream_wave_team";
}

// CRM tables arrive in the generated database types after the migration is applied.
// This small adapter keeps the branch buildable before that deployment step.
const db = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: Error | null }>;
};

function CrmPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<Stage | "all">("all");
  const [priority, setPriority] = useState<Priority | "all">("all");
  const [assignee, setAssignee] = useState<"all" | "mine" | "unassigned" | string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Account | null>(null);
  const [importing, setImporting] = useState(false);
  const bloomInputRef = useRef<HTMLInputElement>(null);

  const clearFilters = () => {
    setSearch("");
    setStage("all");
    setPriority("all");
    setAssignee("all");
  };

  const showMyLeads = () => {
    // This is a shortcut to the user's complete assigned pipeline, so stale
    // search, stage, and priority filters should not hide valid assignments.
    setSearch("");
    setStage("all");
    setPriority("all");
    setAssignee("mine");
  };

  const staffQ = useQuery({
    queryKey: ["crm", "staff"],
    queryFn: async (): Promise<{
      currentUserId: string;
      isOwner: boolean;
      staff: StaffMember[];
    }> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sign in required.");
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("user_id,role")
        .in("role", ["dream_wave_owner", "dream_wave_team"]);
      if (error) throw error;
      const isOwner = (roles ?? []).some(
        (role) => role.user_id === auth.user!.id && role.role === "dream_wave_owner",
      );

      // Owners receive the protected directory so assignment menus show a
      // useful name/email instead of an opaque user id.
      if (isOwner) {
        const { data: directory, error: directoryError } = await db.rpc("get_staff_directory");
        if (!directoryError) {
          const staffDirectory = (directory ?? []) as StaffDirectoryRow[];
          return {
            currentUserId: auth.user.id,
            isOwner: true,
            staff: staffDirectory.map((member) => ({
              id: member.user_id,
              name:
                `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim() ||
                member.email ||
                "Staff member",
              isOwner: member.role === "dream_wave_owner",
            })),
          };
        }
      }

      const visibleRoles = (roles ?? []).filter((role) => role.user_id === auth.user!.id);
      const ids = Array.from(new Set(visibleRoles.map((role) => role.user_id)));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,first_name,last_name")
        .in("id", ids);
      const names = new Map(
        (profiles ?? []).map((profile) => [
          profile.id,
          `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "Staff member",
        ]),
      );
      return {
        currentUserId: auth.user.id,
        isOwner,
        staff: ids.map((id) => ({
          id,
          name: names.get(id) ?? "Staff member",
          isOwner: visibleRoles.some(
            (role) => role.user_id === id && role.role === "dream_wave_owner",
          ),
        })),
      };
    },
  });

  const accountsQ = useQuery({
    queryKey: ["crm", "accounts"],
    queryFn: async (): Promise<Account[]> => {
      const { data, error } = await db
        .from("crm_accounts")
        .select("*,crm_contacts(id,first_name,last_name,email,phone,is_primary)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Account[];
    },
  });
  const tasksQ = useQuery({
    queryKey: ["crm", "tasks"],
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await db
        .from("crm_tasks")
        .select("id,account_id,title,due_at,priority,status,assigned_to")
        .neq("status", "cancelled")
        .order("due_at");
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });

  const accounts = useMemo(() => accountsQ.data ?? [], [accountsQ.data]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return accounts.filter((account) => {
      const contact = account.crm_contacts?.find((c) => c.is_primary) ?? account.crm_contacts?.[0];
      const haystack = [
        account.business_name,
        account.email,
        account.phone,
        account.industry,
        contact?.first_name,
        contact?.last_name,
        contact?.email,
        contact?.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        (!needle || haystack.includes(needle)) &&
        (stage === "all" || account.stage === stage) &&
        (priority === "all" || account.priority === priority) &&
        (assignee === "all" ||
          (assignee === "mine" && account.assigned_to === staffQ.data?.currentUserId) ||
          (assignee === "unassigned" && !account.assigned_to) ||
          account.assigned_to === assignee)
      );
    });
  }, [accounts, assignee, priority, search, staffQ.data?.currentUserId, stage]);

  const now = Date.now();
  const openTasks = (tasksQ.data ?? []).filter((t) => t.status !== "completed");
  const overdueTasks = openTasks.filter((t) => t.due_at && new Date(t.due_at).getTime() < now);
  const dueToday = openTasks.filter(
    (t) => t.due_at && new Date(t.due_at).toDateString() === new Date().toDateString(),
  );
  const pipelineValue = accounts
    .filter((a) => !["won", "lost", "archived"].includes(a.stage))
    .reduce((sum, a) => sum + (a.estimated_value_cents ?? 0), 0);
  const activeWithoutFollowUp = accounts.filter(
    (a) => !["won", "lost", "archived"].includes(a.stage) && !a.next_follow_up_at,
  );

  const assignmentMutation = useMutation({
    mutationFn: async ({ id, assignedTo }: { id: string; assignedTo: string | null }) => {
      const { error } = await db
        .from("crm_accounts")
        .update({ assigned_to: assignedTo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm"] });
      toast.success("Lead owner updated.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not assign lead."),
  });

  const stageMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: Stage }) => {
      const { error } = await db.from("crm_accounts").update({ stage }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm"] });
      toast.success("Pipeline stage updated.");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not update stage."),
  });

  const priorityMutation = useMutation({
    mutationFn: async ({ id, priority }: { id: string; priority: Priority }) => {
      const { error } = await db.from("crm_accounts").update({ priority }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm"] });
      toast.success("Lead priority updated.");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not update priority."),
  });

  const toCsvRow = (account: Account): CrmCsvRow => {
    const contact = account.crm_contacts?.find((c) => c.is_primary) ?? account.crm_contacts?.[0];
    return {
      businessName: account.business_name,
      stage: STAGE_LABEL[account.stage],
      priority: account.priority,
      contactName: contact ? `${contact.first_name} ${contact.last_name ?? ""}`.trim() : null,
      email: contact?.email ?? account.email,
      phone: contact?.phone ?? account.phone,
      industry: account.industry,
      interestedServices: account.interested_services,
      leadSource: account.lead_source,
      referralName: account.referral_name,
      estimatedValueCents: account.estimated_value_cents,
      preferredContactMethod: account.preferred_contact_method,
      lastContactedAt: account.last_contacted_at,
      nextFollowUpAt: account.next_follow_up_at,
      city: account.city,
      state: account.state,
      website: account.website,
      linkedWorkspace: account.linked_workspace_id,
      createdAt: account.created_at,
      updatedAt: account.updated_at,
    };
  };

  async function importBloomCsv(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Choose a Bloom CSV smaller than 5 MB.");
      return;
    }
    setImporting(true);
    try {
      const leads = parseBloomLeadsCsv(await file.text());
      if (!window.confirm(`Import ${leads.length} Bloom leads into WaveCRM?`)) return;
      const { data, error } = await db.rpc("crm_import_bloom_leads", { _leads: leads });
      if (error) throw error;
      const result = data as { imported?: number; skipped?: number } | null;
      await qc.invalidateQueries({ queryKey: ["crm"] });
      toast.success(
        `Imported ${result?.imported ?? 0} leads. Skipped ${result?.skipped ?? 0} duplicate emails.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import the Bloom CSV.");
    } finally {
      setImporting(false);
      if (bloomInputRef.current) bloomInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
            Dream Wave Media
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">WaveCRM</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Keep leads, follow-ups, and client relationships moving in one staff-only workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={bloomInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importBloomCsv(file);
            }}
          />
          <button
            onClick={() => bloomInputRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-elevated disabled:opacity-50"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Import Bloom CSV
          </button>
          <button
            onClick={() =>
              downloadCsv(
                `wavecrm-${new Date().toISOString().slice(0, 10)}.csv`,
                filtered.map(toCsvRow),
              )
            }
            disabled={!filtered.length}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-elevated disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Export {filtered.length} CSV
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Add lead
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={Users2}
          label="Active leads"
          value={accounts.filter((a) => !["won", "lost", "archived"].includes(a.stage)).length}
        />
        <Metric icon={BriefcaseBusiness} label="Pipeline value" value={money(pipelineValue)} />
        <Metric
          icon={CalendarClock}
          label="Due today"
          value={dueToday.length}
          tone={dueToday.length ? "warning" : "default"}
        />
        <Metric
          icon={AlertCircle}
          label="Missing follow-up"
          value={activeWithoutFollowUp.length}
          tone={activeWithoutFollowUp.length ? "danger" : "default"}
        />
      </div>

      <section className="surface-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Daily follow-up queue</h2>
            <p className="text-xs text-muted-foreground">
              {overdueTasks.length} overdue · {dueToday.length} due today
            </p>
          </div>
          <button
            onClick={assignee === "mine" ? clearFilters : showMyLeads}
            className={
              "rounded-lg border px-3 py-2 text-xs font-medium " +
              (assignee === "mine"
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border")
            }
          >
            {assignee === "mine" ? "Show all leads" : "My leads"}
          </button>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {[...overdueTasks, ...dueToday.filter((task) => !overdueTasks.includes(task))]
            .slice(0, 6)
            .map((task) => (
              <div
                key={task.id}
                className="rounded-lg border border-border bg-background/40 p-3 text-sm"
              >
                <div className="font-medium">{task.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {task.due_at ? new Date(task.due_at).toLocaleString() : "No due date"}
                </div>
              </div>
            ))}
          {!overdueTasks.length && !dueToday.length && (
            <p className="text-sm text-muted-foreground">Nothing urgent today.</p>
          )}
        </div>
      </section>

      <section className="surface-card overflow-hidden">
        <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[1fr_180px_150px_180px]">
          <label className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search business, contact, email or phone"
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
            />
          </label>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as Stage | "all")}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="all">All pipeline stages</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
          {staffQ.data?.isOwner ? (
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="all">All assignees</option>
              <option value="mine">My leads</option>
              <option value="unassigned">Unassigned</option>
              {(staffQ.data?.staff ?? []).map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
              My assigned leads
            </div>
          )}
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority | "all")}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="all">All priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </div>

        {accountsQ.isLoading ? (
          <div className="flex justify-center p-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : accountsQ.isError ? (
          <div className="p-8 text-sm text-destructive">
            CRM tables are not available yet. Apply the included CRM migration, then refresh.
          </div>
        ) : !filtered.length ? (
          <div className="p-14 text-center">
            <UserRound className="mx-auto h-9 w-9 text-muted-foreground" />
            <h2 className="mt-3 font-semibold">No matching CRM records</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {assignee === "mine"
                ? "No leads are currently assigned to you."
                : "Add your first lead or adjust the current filters."}
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-elevated"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border md:hidden">
              {filtered.map((account) => {
                const contact =
                  account.crm_contacts?.find((c) => c.is_primary) ?? account.crm_contacts?.[0];
                return (
                  <article key={account.id} className="space-y-3 p-4">
                    <button onClick={() => setSelected(account)} className="block w-full text-left">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold text-foreground">
                            {account.business_name}
                          </h3>
                          <p className="truncate text-xs text-muted-foreground">
                            {contact?.email ??
                              account.email ??
                              account.industry ??
                              "No contact set"}
                          </p>
                        </div>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-primary" />
                      </div>
                    </button>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <label className="space-y-1">
                        <span className="text-muted-foreground">Stage</span>
                        <select
                          value={account.stage}
                          onChange={(e) =>
                            stageMutation.mutate({ id: account.id, stage: e.target.value as Stage })
                          }
                          className="min-h-10 w-full rounded-md border border-border bg-background px-2"
                        >
                          {STAGES.map((value) => (
                            <option key={value} value={value}>
                              {STAGE_LABEL[value]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="text-muted-foreground">Priority</span>
                        <select
                          value={account.priority}
                          onChange={(e) =>
                            priorityMutation.mutate({
                              id: account.id,
                              priority: e.target.value as Priority,
                            })
                          }
                          className="min-h-10 w-full rounded-md border border-border bg-background px-2 capitalize"
                        >
                          {PRIORITIES.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {dateLabel(account.next_follow_up_at)}
                      </span>
                      <span className="font-medium text-foreground">
                        {money(account.estimated_value_cents)}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="bg-elevated/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Business</th>
                    <th className="px-4 py-3">Stage</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Owner</th>
                    <th className="px-4 py-3">Value</th>
                    <th className="px-4 py-3">Next follow-up</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((account) => {
                    const contact =
                      account.crm_contacts?.find((c) => c.is_primary) ?? account.crm_contacts?.[0];
                    return (
                      <tr key={account.id} className="hover:bg-elevated/30">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setSelected(account)}
                            className="font-medium hover:text-primary"
                          >
                            {account.business_name}
                          </button>
                          <div className="text-xs text-muted-foreground">
                            {account.industry || "Industry not set"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={account.stage}
                            onChange={(e) =>
                              stageMutation.mutate({
                                id: account.id,
                                stage: e.target.value as Stage,
                              })
                            }
                            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                          >
                            {STAGES.map((s) => (
                              <option key={s} value={s}>
                                {STAGE_LABEL[s]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={account.priority}
                            onChange={(event) =>
                              priorityMutation.mutate({
                                id: account.id,
                                priority: event.target.value as Priority,
                              })
                            }
                            disabled={priorityMutation.isPending}
                            className={cn(
                              "rounded-md border border-border bg-background px-2 py-1 text-xs font-medium capitalize disabled:opacity-50",
                              account.priority === "urgent"
                                ? "text-destructive"
                                : account.priority === "high"
                                  ? "text-warning"
                                  : "text-foreground",
                            )}
                            aria-label={`Priority for ${account.business_name}`}
                          >
                            {PRIORITIES.map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          {staffQ.data?.isOwner ? (
                            <select
                              value={account.assigned_to ?? ""}
                              onChange={(e) =>
                                assignmentMutation.mutate({
                                  id: account.id,
                                  assignedTo: e.target.value || null,
                                })
                              }
                              className="max-w-40 rounded-md border border-border bg-background px-2 py-1 text-xs"
                            >
                              <option value="">Unassigned</option>
                              {(staffQ.data.staff ?? []).map((member) => (
                                <option key={member.id} value={member.id}>
                                  {member.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs">
                              {staffQ.data?.staff.find(
                                (member) => member.id === account.assigned_to,
                              )?.name ?? "Unassigned"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">{money(account.estimated_value_cents)}</td>
                        <td className="px-4 py-3">{dateLabel(account.next_follow_up_at)}</td>
                        <td className="px-4 py-3">
                          <div>
                            {contact ? `${contact.first_name} ${contact.last_name ?? ""}` : "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {contact?.email ?? account.email ?? ""}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setSelected(account)}
                            className="rounded-md p-2 hover:bg-elevated"
                            aria-label={`Open ${account.business_name}`}
                          >
                            <ArrowUpRight className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {addOpen && (
        <AddLeadModal
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            qc.invalidateQueries({ queryKey: ["crm"] });
          }}
        />
      )}
      {selected && (
        <AccountDrawer
          account={selected}
          onClose={() => setSelected(null)}
          onDeleted={() => {
            setSelected(null);
            qc.invalidateQueries({ queryKey: ["crm"] });
          }}
          onRefresh={() => qc.invalidateQueries({ queryKey: ["crm"] })}
          staff={staffQ.data?.staff ?? []}
          isOwner={staffQ.data?.isOwner ?? false}
          onExport={() =>
            downloadCsv(`${safeCsvFilename(selected.business_name)}-crm.csv`, [toCsvRow(selected)])
          }
        />
      )}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof Users2;
  label: string;
  value: string | number;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon
          className={cn(
            "h-4 w-4",
            tone === "danger"
              ? "text-destructive"
              : tone === "warning"
                ? "text-warning"
                : "text-primary",
          )}
        />
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}
function PriorityBadge({ value }: { value: Priority }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-1 text-xs font-medium capitalize",
        value === "urgent"
          ? "bg-destructive/15 text-destructive"
          : value === "high"
            ? "bg-warning/15 text-warning"
            : "bg-elevated text-muted-foreground",
      )}
    >
      {value}
    </span>
  );
}
function money(cents: number | null) {
  return cents == null
    ? "—"
    : (cents / 100).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      });
}
function dateLabel(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function AddLeadModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    business: "",
    first: "",
    last: "",
    email: "",
    phone: "",
    industry: "",
    services: "",
    source: "",
    priority: "normal" as Priority,
    value: "",
    followUp: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.business.trim() || !form.first.trim()) return;
    setBusy(true);
    try {
      // The RPC is added by this branch's migration and will enter generated
      // Supabase types after the migration is deployed.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: duplicates, error: dupError } = await (supabase as any).rpc(
        "crm_find_duplicates",
        {
          _email: form.email.trim() || null,
          _phone: form.phone.trim() || null,
          _business_name: form.business.trim(),
        },
      );
      if (dupError) throw dupError;
      if (
        duplicates?.length &&
        !window.confirm(`Possible duplicate: ${duplicates[0].business_name}. Add this lead anyway?`)
      )
        return;
      const { data: auth } = await supabase.auth.getUser();
      const { data: account, error } = await db
        .from("crm_accounts")
        .insert({
          business_name: form.business.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          industry: form.industry.trim() || null,
          interested_services: form.services
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          lead_source: form.source.trim() || null,
          priority: form.priority,
          estimated_value_cents: form.value ? Math.round(Number(form.value) * 100) : null,
          next_follow_up_at: form.followUp ? new Date(form.followUp).toISOString() : null,
          created_by: auth.user?.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: contactError } = await db.from("crm_contacts").insert({
        account_id: account.id,
        first_name: form.first.trim(),
        last_name: form.last.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        is_primary: true,
        created_by: auth.user?.id,
      });
      if (contactError) throw contactError;
      toast.success("Lead added to WaveCRM.");
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add lead.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        className="absolute inset-0 bg-background/75 backdrop-blur"
        onClick={onClose}
        aria-label="Close"
      />
      <form
        onSubmit={submit}
        className="surface-card relative z-10 h-[100dvh] w-full max-w-2xl overflow-y-auto rounded-none p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:h-auto sm:max-h-[90vh] sm:rounded-xl sm:p-6"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">Add CRM lead</h2>
            <p className="text-sm text-muted-foreground">
              Create the business and its primary contact together.
            </p>
          </div>
          <button type="button" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field
            label="Business name"
            required
            value={form.business}
            onChange={(v) => set("business", v)}
          />
          <Field label="Industry" value={form.industry} onChange={(v) => set("industry", v)} />
          <Field
            label="Contact first name"
            required
            value={form.first}
            onChange={(v) => set("first", v)}
          />
          <Field label="Contact last name" value={form.last} onChange={(v) => set("last", v)} />
          <Field label="Email" type="email" value={form.email} onChange={(v) => set("email", v)} />
          <Field label="Phone" type="tel" value={form.phone} onChange={(v) => set("phone", v)} />
          <Field
            label="Interested services"
            placeholder="Brand story, reels, photography"
            value={form.services}
            onChange={(v) => set("services", v)}
          />
          <Field
            label="Lead source"
            placeholder="Referral, BNI, website"
            value={form.source}
            onChange={(v) => set("source", v)}
          />
          <Field
            label="Estimated value ($)"
            type="number"
            value={form.value}
            onChange={(v) => set("value", v)}
          />
          <Field
            label="Next follow-up"
            type="datetime-local"
            value={form.followUp}
            onChange={(v) => set("followUp", v)}
          />
          <label className="space-y-1 text-sm">
            <span>Priority</span>
            <select
              value={form.priority}
              onChange={(e) => set("priority", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            disabled={busy || !form.business.trim() || !form.first.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Add lead
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span>
        {label}
        {required && " *"}
      </span>
      <input
        required={required}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2"
      />
    </label>
  );
}

function AccountDrawer({
  account,
  onClose,
  onExport,
  onRefresh,
  onDeleted,
  staff,
  isOwner,
}: {
  account: Account;
  onClose: () => void;
  onExport: () => void;
  onRefresh: () => void;
  onDeleted: () => void;
  staff: StaffMember[];
  isOwner: boolean;
}) {
  const [tab, setTab] = useState<
    "overview" | "contacts" | "notes" | "tasks" | "communication" | "activity"
  >("overview");
  const contact = account.crm_contacts?.find((c) => c.is_primary) ?? account.crm_contacts?.[0];
  const tabs = [
    ["overview", "Overview", BriefcaseBusiness],
    ["contacts", "Contacts", Users2],
    ["notes", "Notes", MessageSquareText],
    ["tasks", "Tasks", ClipboardList],
    ["communication", "Log contact", PhoneCall],
    ["activity", "Activity", Activity],
  ] as const;
  return (
    <div className="fixed inset-0 z-50">
      <button
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />
      <aside className="absolute inset-0 w-full overflow-y-auto bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-w-xl sm:border-l sm:border-border sm:p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary">CRM record</p>
            <h2 className="mt-1 text-2xl font-semibold">{account.business_name}</h2>
            <p className="text-sm text-muted-foreground">
              {account.industry || "Industry not set"}
            </p>
          </div>
          <button onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-6 flex gap-2">
          <button
            onClick={onExport}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
          >
            <Download className="h-4 w-4" /> Export individual CSV
          </button>
          {account.linked_workspace_id && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" /> Linked client
            </span>
          )}
        </div>
        <div className="mt-6 flex gap-1 overflow-x-auto border-b border-border">
          {tabs.map(([value, label, Icon]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={cn(
                "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium",
                tab === value
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
        <div className="mt-5">
          {tab === "overview" && (
            <OverviewTab
              account={account}
              contact={contact}
              onRefresh={onRefresh}
              onDeleted={onDeleted}
              isOwner={isOwner}
            />
          )}
          {tab === "contacts" && <ContactsTab accountId={account.id} onRefresh={onRefresh} />}
          {tab === "notes" && <NotesTab accountId={account.id} />}
          {tab === "tasks" && <TasksTab accountId={account.id} onRefresh={onRefresh} />}
          {tab === "communication" && (
            <CommunicationTab account={account} staff={staff} onRefresh={onRefresh} />
          )}
          {tab === "activity" && <ActivityTab accountId={account.id} />}
        </div>
      </aside>
    </div>
  );
}

function OverviewTab({
  account,
  contact,
  onRefresh,
  onDeleted,
  isOwner,
}: {
  account: Account;
  contact: Contact | undefined;
  onRefresh: () => void;
  onDeleted: () => void;
  isOwner: boolean;
}) {
  const qc = useQueryClient();
  const [workspaceId, setWorkspaceId] = useState(account.linked_workspace_id ?? "");
  const [conversionTier, setConversionTier] = useState("retainer_full");
  const [conversionTerm, setConversionTerm] = useState("");
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({
    business: account.business_name,
    email: account.email ?? "",
    phone: account.phone ?? "",
    industry: account.industry ?? "",
    value: account.estimated_value_cents == null ? "" : String(account.estimated_value_cents / 100),
    followUp: account.next_follow_up_at ? account.next_follow_up_at.slice(0, 16) : "",
  });
  const workspacesQ = useQuery({
    queryKey: ["crm", "workspaces"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id,name,account_status")
        .neq("account_status", "archived")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const linkMutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("Choose a client workspace.");
      const { error } = await db
        .from("crm_accounts")
        .update({
          linked_workspace_id: workspaceId,
          stage: "won",
          converted_at: new Date().toISOString(),
        })
        .eq("id", account.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm"] });
      toast.success("Lead linked to the client workspace and marked Won.");
      onRefresh();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not link workspace."),
  });
  const convertMutation = useMutation({
    mutationFn: async () => {
      if (account.linked_workspace_id) throw new Error("This lead is already linked to a client.");
      const confirmed = window.confirm(
        `Create a new client profile for ${account.business_name}?\n\nThe lead will be marked Won. You can review the profile and send the client invite afterward.`,
      );
      if (!confirmed) return null;
      const { data, error } = await db.rpc("crm_convert_lead_to_client", {
        _account_id: account.id,
        _access_tier: conversionTier,
        _agreement_term: conversionTerm || null,
        _timezone: "America/New_York",
      });
      if (error) throw error;
      return (data as Array<{ workspace_id: string }> | null)?.[0] ?? null;
    },
    onSuccess: (created) => {
      if (!created) return;
      setWorkspaceId(created.workspace_id);
      qc.invalidateQueries({ queryKey: ["crm"] });
      qc.invalidateQueries({ queryKey: ["crm", "workspaces"] });
      qc.invalidateQueries({ queryKey: ["clients", "workspaces"] });
      qc.invalidateQueries({ queryKey: ["waveos", "workspaces"] });
      toast.success("Client profile created. The lead is now marked Won.");
      onRefresh();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not create client profile."),
  });
  const editMutation = useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from("crm_accounts")
        .update({
          business_name: edit.business.trim(),
          email: edit.email.trim() || null,
          phone: edit.phone.trim() || null,
          industry: edit.industry.trim() || null,
          estimated_value_cents: edit.value ? Math.round(Number(edit.value) * 100) : null,
          next_follow_up_at: edit.followUp ? new Date(edit.followUp).toISOString() : null,
        })
        .eq("id", account.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditing(false);
      onRefresh();
      toast.success("Account updated.");
    },
  });
  const archiveMutation = useMutation({
    mutationFn: async () => {
      const archived = account.stage === "archived";
      const { error } = await db
        .from("crm_accounts")
        .update({
          stage: archived ? "new_lead" : "archived",
          archived_at: archived ? null : new Date().toISOString(),
        })
        .eq("id", account.id);
      if (error) throw error;
    },
    onSuccess: () => {
      onRefresh();
      toast.success(account.stage === "archived" ? "Lead restored." : "Lead archived.");
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (account.linked_workspace_id) throw new Error("Unlink this lead from its client first.");
      const confirmation = window.prompt(
        `Permanently delete this lead and all of its CRM history?\n\nType ${account.business_name} to confirm.`,
      );
      if (confirmation === null) return false;
      if (confirmation !== account.business_name) throw new Error("Business name did not match.");
      const { error } = await db.rpc("crm_delete_lead", { _account_id: account.id });
      if (error) throw error;
      return true;
    },
    onSuccess: (deleted) => {
      if (!deleted) return;
      toast.success("Lead permanently deleted.");
      onDeleted();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not delete lead."),
  });

  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-2">
        <button
          onClick={() => setEditing((value) => !value)}
          className="rounded-lg border border-border px-3 py-2 text-xs"
        >
          {editing ? "Cancel editing" : "Edit account"}
        </button>
        <button
          onClick={() => archiveMutation.mutate()}
          disabled={
            Boolean(account.linked_workspace_id && account.stage !== "archived") ||
            archiveMutation.isPending
          }
          title={
            account.linked_workspace_id ? "Linked client records cannot be archived." : undefined
          }
          className="rounded-lg border border-border px-3 py-2 text-xs disabled:opacity-50"
        >
          {account.stage === "archived" ? "Restore" : "Archive"}
        </button>
        {isOwner && (
          <button
            onClick={() => deleteMutation.mutate()}
            disabled={Boolean(account.linked_workspace_id) || deleteMutation.isPending}
            title={
              account.linked_workspace_id
                ? "Unlink this lead from its client workspace before deleting it."
                : "Permanently delete this lead and its CRM history."
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive hover:bg-destructive/20 disabled:opacity-50"
          >
            {deleteMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Delete permanently
          </button>
        )}
      </div>
      {editing && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            editMutation.mutate();
          }}
          className="grid gap-3 rounded-xl border border-border bg-background/40 p-4 sm:grid-cols-2"
        >
          <Field
            label="Business"
            required
            value={edit.business}
            onChange={(value) => setEdit((state) => ({ ...state, business: value }))}
          />
          <Field
            label="Industry"
            value={edit.industry}
            onChange={(value) => setEdit((state) => ({ ...state, industry: value }))}
          />
          <Field
            label="Email"
            type="email"
            value={edit.email}
            onChange={(value) => setEdit((state) => ({ ...state, email: value }))}
          />
          <Field
            label="Phone"
            value={edit.phone}
            onChange={(value) => setEdit((state) => ({ ...state, phone: value }))}
          />
          <Field
            label="Estimated value ($)"
            type="number"
            value={edit.value}
            onChange={(value) => setEdit((state) => ({ ...state, value }))}
          />
          <Field
            label="Next follow-up"
            type="datetime-local"
            value={edit.followUp}
            onChange={(value) => setEdit((state) => ({ ...state, followUp: value }))}
          />
          <div className="sm:col-span-2 flex justify-end">
            <button
              disabled={!edit.business.trim() || editMutation.isPending}
              className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            >
              Save changes
            </button>
          </div>
        </form>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Detail label="Pipeline stage" value={STAGE_LABEL[account.stage]} />
        <Detail label="Priority" value={account.priority} />
        <Detail label="Estimated value" value={money(account.estimated_value_cents)} />
        <Detail label="Next follow-up" value={dateLabel(account.next_follow_up_at)} />
        <Detail
          label="Primary contact"
          value={contact ? `${contact.first_name} ${contact.last_name ?? ""}` : "—"}
        />
        <Detail label="Email" value={contact?.email ?? account.email ?? "—"} />
        <Detail label="Phone" value={contact?.phone ?? account.phone ?? "—"} />
        <Detail label="Lead source" value={account.lead_source || "—"} />
        <Detail
          label="Interested services"
          value={account.interested_services?.join(", ") || "—"}
        />
        <Detail
          label="Location"
          value={[account.city, account.state].filter(Boolean).join(", ") || "—"}
        />
      </div>
      {isOwner && (
        <div className="rounded-xl border border-border bg-background/40 p-4">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Convert to WaveOS client</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Create a new client profile from this lead, or link it to an existing workspace. Either
            option marks the opportunity Won.
          </p>
          {!account.linked_workspace_id && (
            <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs font-semibold text-foreground">Create a new client profile</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <select
                  value={conversionTier}
                  onChange={(event) => setConversionTier(event.target.value)}
                  className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="project_client">Project Client</option>
                  <option value="growth_90">Growth (90 days)</option>
                  <option value="retainer_full">Retainer</option>
                </select>
                <select
                  value={conversionTerm}
                  onChange={(event) => setConversionTerm(event.target.value)}
                  className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">No agreement term</option>
                  <option value="one_time">One-time</option>
                  <option value="90_day">90 days</option>
                  <option value="6_month">6 months</option>
                  <option value="12_month">12 months</option>
                </select>
                <button
                  onClick={() => convertMutation.mutate()}
                  disabled={convertMutation.isPending}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {convertMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  Create client
                </button>
              </div>
            </div>
          )}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Choose client workspace…</option>
              {(workspacesQ.data ?? []).map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name} · {workspace.account_status}
                </option>
              ))}
            </select>
            <button
              onClick={() => linkMutation.mutate()}
              disabled={!workspaceId || linkMutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {linkMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Link client
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ContactsTab({ accountId, onRefresh }: { accountId: string; onRefresh: () => void }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ first: "", last: "", title: "", email: "", phone: "" });
  const contactsQ = useQuery({
    queryKey: ["crm", "contacts", accountId],
    queryFn: async (): Promise<Contact[]> => {
      const { data, error } = await db
        .from("crm_contacts")
        .select("id,first_name,last_name,job_title,email,phone,is_primary")
        .eq("account_id", accountId)
        .order("is_primary", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const addMutation = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await db.from("crm_contacts").insert({
        account_id: accountId,
        first_name: form.first.trim(),
        last_name: form.last.trim() || null,
        job_title: form.title.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        is_primary: !(contactsQ.data ?? []).length,
        created_by: auth.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm({ first: "", last: "", title: "", email: "", phone: "" });
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["crm", "contacts", accountId] });
      onRefresh();
      toast.success("Contact added.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not add contact."),
  });
  const primaryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: clearError } = await db
        .from("crm_contacts")
        .update({ is_primary: false })
        .eq("account_id", accountId)
        .eq("is_primary", true);
      if (clearError) throw clearError;
      const { error } = await db.from("crm_contacts").update({ is_primary: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm", "contacts", accountId] });
      onRefresh();
      toast.success("Primary contact updated.");
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm((value) => !value)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
        >
          <UserPlus className="h-3.5 w-3.5" /> Add contact
        </button>
      </div>
      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addMutation.mutate();
          }}
          className="grid gap-3 rounded-xl border border-border bg-background/40 p-3 sm:grid-cols-2"
        >
          <Field
            label="First name"
            required
            value={form.first}
            onChange={(v) => setForm((f) => ({ ...f, first: v }))}
          />
          <Field
            label="Last name"
            value={form.last}
            onChange={(v) => setForm((f) => ({ ...f, last: v }))}
          />
          <Field
            label="Job title"
            value={form.title}
            onChange={(v) => setForm((f) => ({ ...f, title: v }))}
          />
          <Field
            label="Email"
            type="email"
            value={form.email}
            onChange={(v) => setForm((f) => ({ ...f, email: v }))}
          />
          <Field
            label="Phone"
            type="tel"
            value={form.phone}
            onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
          />
          <div className="flex items-end justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-border px-3 py-2 text-xs"
            >
              Cancel
            </button>
            <button
              disabled={!form.first.trim() || addMutation.isPending}
              className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              Save contact
            </button>
          </div>
        </form>
      )}
      {contactsQ.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      ) : !(contactsQ.data ?? []).length ? (
        <p className="text-sm text-muted-foreground">No contacts yet.</p>
      ) : (
        <ul className="space-y-2">
          {contactsQ.data!.map((item) => (
            <li key={item.id} className="rounded-xl border border-border bg-background/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">
                    {item.first_name} {item.last_name ?? ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {(item as Contact & { job_title?: string | null }).job_title || "Contact"}
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {item.email && <div>{item.email}</div>}
                    {item.phone && <div>{item.phone}</div>}
                  </div>
                </div>
                {item.is_primary ? (
                  <span className="rounded-full bg-success/15 px-2 py-1 text-[10px] font-medium text-success">
                    Primary
                  </span>
                ) : (
                  <button
                    onClick={() => primaryMutation.mutate(item.id)}
                    className="text-xs text-primary hover:underline"
                  >
                    Make primary
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotesTab({ accountId }: { accountId: string }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const notesQ = useQuery({
    queryKey: ["crm", "notes", accountId],
    queryFn: async () => {
      const { data, error } = await db
        .from("crm_notes")
        .select("id,body,created_at,author_id")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const addMutation = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await db.from("crm_notes").insert({
        account_id: accountId,
        body: body.trim(),
        author_id: auth.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["crm", "notes", accountId] });
      toast.success("Internal note added.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not add note."),
  });
  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addMutation.mutate();
        }}
        className="space-y-2"
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Add a private staff note…"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
        />
        <div className="flex justify-end">
          <button
            disabled={!body.trim() || addMutation.isPending}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            Add note
          </button>
        </div>
      </form>
      <ul className="space-y-2">
        {(notesQ.data ?? []).map((note: { id: string; body: string; created_at: string }) => (
          <li key={note.id} className="rounded-xl border border-border bg-background/40 p-3">
            <p className="whitespace-pre-wrap text-sm">{note.body}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {new Date(note.created_at).toLocaleString()}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TasksTab({ accountId, onRefresh }: { accountId: string; onRefresh: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const tasksQ = useQuery({
    queryKey: ["crm", "tasks", accountId],
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await db
        .from("crm_tasks")
        .select("id,account_id,title,due_at,priority,status")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const addMutation = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await db.from("crm_tasks").insert({
        account_id: accountId,
        title: title.trim(),
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        priority,
        created_by: auth.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTitle("");
      setDueAt("");
      setPriority("normal");
      qc.invalidateQueries({ queryKey: ["crm", "tasks"] });
      onRefresh();
      toast.success("Follow-up task added.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not add task."),
  });
  const completeMutation = useMutation({
    mutationFn: async ({ id, complete }: { id: string; complete: boolean }) => {
      const { error } = await db
        .from("crm_tasks")
        .update({
          status: complete ? "completed" : "open",
          completed_at: complete ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm", "tasks"] });
      onRefresh();
    },
  });
  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addMutation.mutate();
        }}
        className="space-y-3 rounded-xl border border-border bg-background/40 p-3"
      >
        <Field
          label="Task or follow-up"
          required
          value={title}
          onChange={setTitle}
          placeholder="Call about proposal"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Due" type="datetime-local" value={dueAt} onChange={setDueAt} />
          <label className="space-y-1 text-sm">
            <span>Priority</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
        </div>
        <div className="flex justify-end">
          <button
            disabled={!title.trim() || addMutation.isPending}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            Add task
          </button>
        </div>
      </form>
      <ul className="space-y-2">
        {(tasksQ.data ?? []).map((task) => (
          <li
            key={task.id}
            className="flex items-start gap-3 rounded-xl border border-border bg-background/40 p-3"
          >
            <input
              type="checkbox"
              checked={task.status === "completed"}
              onChange={(e) => completeMutation.mutate({ id: task.id, complete: e.target.checked })}
              className="mt-1 h-4 w-4"
            />
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "text-sm font-medium",
                  task.status === "completed" && "text-muted-foreground line-through",
                )}
              >
                {task.title}
              </div>
              <div className="mt-1 flex gap-2 text-[11px] text-muted-foreground">
                <span>{task.due_at ? new Date(task.due_at).toLocaleString() : "No due date"}</span>
                <PriorityBadge value={task.priority} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CommunicationTab({
  account,
  staff,
  onRefresh,
}: {
  account: Account;
  staff: StaffMember[];
  onRefresh: () => void;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState("call");
  const [summary, setSummary] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [nextAction, setNextAction] = useState("");
  const [nextDueAt, setNextDueAt] = useState("");
  const [assignedTo, setAssignedTo] = useState(account.assigned_to ?? "");
  const mutation = useMutation({
    mutationFn: async () => {
      // Generated RPC types arrive after the manual migration is applied.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("crm_log_communication", {
        _account_id: account.id,
        _activity_type: type,
        _summary: summary.trim(),
        _occurred_at: new Date(occurredAt).toISOString(),
        _next_action: nextAction.trim() || null,
        _next_due_at: nextDueAt ? new Date(nextDueAt).toISOString() : null,
        _assigned_to: assignedTo || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setSummary("");
      setNextAction("");
      setNextDueAt("");
      qc.invalidateQueries({ queryKey: ["crm"] });
      onRefresh();
      toast.success("Communication logged.");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not log communication."),
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
      className="space-y-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>Type</span>
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2"
          >
            <option value="call">Call</option>
            <option value="email">Email</option>
            <option value="meeting">Meeting</option>
            <option value="proposal">Proposal</option>
            <option value="client_check_in">Client check-in</option>
          </select>
        </label>
        <Field
          label="Date and time"
          type="datetime-local"
          value={occurredAt}
          onChange={setOccurredAt}
        />
      </div>
      <label className="space-y-1 text-sm">
        <span>Summary *</span>
        <textarea
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          rows={3}
          maxLength={500}
          className="w-full rounded-xl border border-border bg-background px-3 py-2"
          placeholder="What happened and what matters next?"
        />
      </label>
      <div className="rounded-xl border border-border bg-background/40 p-3">
        <h3 className="text-sm font-semibold">Optional next follow-up</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            label="Next action"
            value={nextAction}
            onChange={setNextAction}
            placeholder="Send revised proposal"
          />
          <Field label="Due" type="datetime-local" value={nextDueAt} onChange={setNextDueAt} />
          <label className="space-y-1 text-sm sm:col-span-2">
            <span>Assign task to</span>
            <select
              value={assignedTo}
              onChange={(event) => setAssignedTo(event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            >
              <option value="">Current staff member</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="flex justify-end">
        <button
          disabled={!summary.trim() || mutation.isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          Log communication
        </button>
      </div>
    </form>
  );
}

function ActivityTab({ accountId }: { accountId: string }) {
  const activityQ = useQuery({
    queryKey: ["crm", "activity", accountId],
    queryFn: async () => {
      const { data, error } = await db
        .from("crm_activities")
        .select("id,activity_type,summary,safe_metadata,occurred_at")
        .eq("account_id", accountId)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="space-y-2">
      {(activityQ.data ?? []).map(
        (item: { id: string; activity_type: string; summary: string; occurred_at: string }) => (
          <div
            key={item.id}
            className="flex gap-3 rounded-xl border border-border bg-background/40 p-3"
          >
            <div className="mt-0.5 rounded-full bg-primary/15 p-1.5 text-primary">
              <Activity className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="text-sm font-medium">{item.summary}</div>
              <div className="mt-1 text-[11px] capitalize text-muted-foreground">
                {item.activity_type.replaceAll("_", " ")} ·{" "}
                {new Date(item.occurred_at).toLocaleString()}
              </div>
            </div>
          </div>
        ),
      )}
      {!activityQ.isLoading && !(activityQ.data ?? []).length && (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      )}
    </div>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium capitalize">{value}</div>
    </div>
  );
}
