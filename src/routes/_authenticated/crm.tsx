import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Download,
  Loader2,
  Plus,
  Search,
  UserRound,
  Users2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { downloadCsv, safeCsvFilename, type CrmCsvRow } from "@/lib/crm-csv";

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
type Priority = "low" | "normal" | "high" | "urgent";

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
}

// CRM tables arrive in the generated database types after the migration is applied.
// This small adapter keeps the branch buildable before that deployment step.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };

function CrmPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<Stage | "all">("all");
  const [priority, setPriority] = useState<Priority | "all">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Account | null>(null);

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
        .select("id,account_id,title,due_at,priority,status")
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
        (priority === "all" || account.priority === priority)
      );
    });
  }, [accounts, priority, search, stage]);

  const now = Date.now();
  const openTasks = (tasksQ.data ?? []).filter((t) => t.status !== "completed");
  const overdueTasks = openTasks.filter((t) => t.due_at && new Date(t.due_at).getTime() < now);
  const dueToday = openTasks.filter(
    (t) => t.due_at && new Date(t.due_at).toDateString() === new Date().toDateString(),
  );
  const pipelineValue = accounts
    .filter((a) => !["won", "lost", "archived"].includes(a.stage))
    .reduce((sum, a) => sum + (a.estimated_value_cents ?? 0), 0);

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
          label="Overdue tasks"
          value={overdueTasks.length}
          tone={overdueTasks.length ? "danger" : "default"}
        />
      </div>

      <section className="surface-card overflow-hidden">
        <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[1fr_190px_160px]">
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
              Add your first lead or adjust the current filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-elevated/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Priority</th>
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
                            stageMutation.mutate({ id: account.id, stage: e.target.value as Stage })
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
                        <PriorityBadge value={account.priority} />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        className="absolute inset-0 bg-background/75 backdrop-blur"
        onClick={onClose}
        aria-label="Close"
      />
      <form
        onSubmit={submit}
        className="surface-card relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6"
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
}: {
  account: Account;
  onClose: () => void;
  onExport: () => void;
}) {
  const contact = account.crm_contacts?.find((c) => c.is_primary) ?? account.crm_contacts?.[0];
  return (
    <div className="fixed inset-0 z-50">
      <button
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />
      <aside className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto border-l border-border bg-surface p-6 shadow-2xl">
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
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
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
      </aside>
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
