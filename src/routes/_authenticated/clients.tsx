import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Copy, Loader2, Plus, Users2, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/app/empty-state";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/clients")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const staff = (roles ?? []).some(
      (r) => r.role === "dream_wave_owner" || r.role === "dream_wave_team",
    );
    if (!staff) throw redirect({ to: "/home" });
  },
  component: ClientsPage,
  head: () => ({
    meta: [{ title: "Clients — WaveOS" }, { name: "robots", content: "noindex" }],
  }),
});

interface ClientWorkspace {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  timezone: string;
  is_demo: boolean;
  created_at: string;
  member_count: number;
  invite_count: number;
}

function ClientsPage() {
  const [open, setOpen] = useState(false);
  const [newInviteLink, setNewInviteLink] = useState<{
    link: string;
    email: string;
    workspace: string;
  } | null>(null);

  const workspacesQ = useQuery({
    queryKey: ["clients", "workspaces"],
    queryFn: async () => {
      const { data: ws, error } = await supabase
        .from("workspaces")
        .select("id,name,slug,industry,timezone,is_demo,created_at")
        .eq("is_archived", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const [{ data: members }, { data: invites }] = await Promise.all([
        supabase.from("workspace_members").select("workspace_id"),
        supabase.from("invites").select("workspace_id").is("accepted_at", null),
      ]);
      const mCount = new Map<string, number>();
      (members ?? []).forEach((m) =>
        mCount.set(m.workspace_id, (mCount.get(m.workspace_id) ?? 0) + 1),
      );
      const iCount = new Map<string, number>();
      (invites ?? []).forEach((i) => {
        if (!i.workspace_id) return;
        iCount.set(i.workspace_id, (iCount.get(i.workspace_id) ?? 0) + 1);
      });
      return (ws ?? []).map<ClientWorkspace>((w) => ({
        ...w,
        member_count: mCount.get(w.id) ?? 0,
        invite_count: iCount.get(w.id) ?? 0,
      }));
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
            Dream Wave Media
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Clients
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Create a client workspace, invite the client, and start delivering content.
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          New client
        </button>
      </header>

      <div className="surface-card overflow-hidden">
        {workspacesQ.isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading workspaces…
          </div>
        ) : (workspacesQ.data ?? []).length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Users2}
              title="No client workspaces yet"
              body="Click New client to create your first workspace and send an invite."
            />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Workspace</th>
                <th className="px-4 py-3 text-left font-medium">Industry</th>
                <th className="px-4 py-3 text-left font-medium">Members</th>
                <th className="px-4 py-3 text-left font-medium">Pending</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {(workspacesQ.data ?? []).map((w) => (
                <tr
                  key={w.id}
                  className="border-t border-border/60 transition-colors hover:bg-elevated/40"
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold text-foreground">{w.name}</div>
                    <div className="text-xs text-muted-foreground">/{w.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {w.industry ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-foreground">{w.member_count}</td>
                  <td className="px-4 py-3">
                    {w.invite_count > 0 ? (
                      <span className="rounded-md bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning ring-1 ring-warning/30">
                        {w.invite_count} pending
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(w.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <OnboardingModal
          onClose={() => setOpen(false)}
          onCreated={(payload) => {
            setOpen(false);
            setNewInviteLink(payload);
          }}
        />
      )}

      {newInviteLink && (
        <InviteLinkModal
          {...newInviteLink}
          onClose={() => setNewInviteLink(null)}
        />
      )}
    </div>
  );
}

function OnboardingModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (payload: { link: string; email: string; workspace: string }) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [industry, setIndustry] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "approver" | "viewer">("owner");

  const create = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Not signed in");

      const finalSlug =
        (slug.trim() || name.trim())
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || `client-${Date.now()}`;

      const { data: ws, error: wsErr } = await supabase
        .from("workspaces")
        .insert({
          name: name.trim(),
          slug: finalSlug,
          industry: industry.trim() || null,
          timezone,
          created_by: uid,
        })
        .select()
        .single();
      if (wsErr) throw wsErr;

      const token =
        crypto.randomUUID().replace(/-/g, "") +
        crypto.randomUUID().replace(/-/g, "").slice(0, 12);
      const appRole =
        role === "owner"
          ? "client_owner"
          : role === "approver"
            ? "client_approver"
            : "client_viewer";
      const { error: invErr } = await supabase.from("invites").insert({
        email: email.trim().toLowerCase(),
        workspace_id: ws.id,
        workspace_role: role,
        app_role: appRole,
        token,
        invited_by: uid,
      });
      if (invErr) throw invErr;

      const link = `${window.location.origin}/accept-invite?token=${token}`;
      return { link, email: email.trim(), workspace: ws.name };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["clients", "workspaces"] });
      qc.invalidateQueries({ queryKey: ["waveos", "workspaces"] });
      onCreated(data);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to create workspace.";
      toast.error(msg);
    },
  });

  const canSubmit = name.trim().length > 1 && /@/.test(email);

  return (
    <ModalShell title="Onboard a new client" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) create.mutate();
        }}
        className="space-y-4"
      >
        <p className="text-xs text-muted-foreground">
          This creates the workspace and generates a private invite link. Send it
          to the client — they sign up with the email below and land in the
          workspace instantly.
        </p>

        <Field label="Client / brand name">
          <input
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Coffee Co."
            className={inputCls}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="URL slug (optional)">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="acme-coffee"
              className={inputCls}
            />
          </Field>
          <Field label="Industry">
            <input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="Coffee shop"
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Timezone">
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className={inputCls}
          >
            {[
              "America/New_York",
              "America/Chicago",
              "America/Denver",
              "America/Los_Angeles",
              "Europe/London",
              "Europe/Paris",
              "Asia/Dubai",
              "Asia/Tokyo",
              "Australia/Sydney",
            ].map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </Field>

        <div className="my-2 h-px bg-border" />

        <Field label="Client contact email">
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@acmecoffee.com"
            className={inputCls}
          />
        </Field>

        <Field label="Role in this workspace">
          <div className="grid grid-cols-3 gap-2">
            {(["owner", "approver", "viewer"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs font-medium capitalize transition-all",
                  role === r
                    ? "border-primary/50 bg-primary/15 text-foreground ring-1 ring-primary/40"
                    : "border-border bg-surface/60 text-muted-foreground hover:text-foreground",
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Owner can approve & manage. Approver can review posts. Viewer is
            read-only.
          </p>
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-surface/60 px-3 py-2 text-sm text-foreground hover:bg-elevated"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit || create.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-60"
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create workspace & invite
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function InviteLinkModal({
  link,
  email,
  workspace,
  onClose,
}: {
  link: string;
  email: string;
  workspace: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <ModalShell title="Invite ready" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">
          <Check className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <div className="font-medium text-foreground">
              {workspace} is ready.
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Send this private link to <span className="text-foreground">{email}</span>.
              It expires in 14 days.
            </p>
          </div>
        </div>
        <div className="flex items-stretch gap-2">
          <input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className={cn(inputCls, "font-mono text-xs")}
          />
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              toast.success("Copied to clipboard.");
              setTimeout(() => setCopied(false), 2000);
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:brightness-110"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-border bg-surface/60 px-3 py-2 text-sm text-foreground hover:bg-elevated"
          >
            Done
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

const inputCls =
  "w-full rounded-lg border border-input bg-surface/60 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function ModalShell({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8" role="dialog">
      <div className="absolute inset-0 bg-background/70 backdrop-blur" onClick={onClose} />
      <div className="surface-card relative w-full max-w-lg overflow-hidden p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-elevated hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
