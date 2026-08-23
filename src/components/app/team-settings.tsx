import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type WorkspaceRole = Database["public"]["Enums"]["workspace_member_role"];
type InviteRole = Extract<WorkspaceRole, "admin" | "editor" | "viewer">;

export function TeamSettings({
  workspaceId,
  canManage,
}: {
  workspaceId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("editor");
  const refreshInvites = () =>
    queryClient.invalidateQueries({ queryKey: ["settings", "invites", workspaceId] });

  const team = useQuery({
    queryKey: ["settings", "team", workspaceId],
    queryFn: async () => {
      const { data: members, error } = await supabase
        .from("workspace_members")
        .select("id,user_id,role,created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at");
      if (error) throw error;
      const ids = (members ?? []).map((member) => member.user_id);
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id,first_name,last_name").in("id", ids)
        : { data: [] };
      const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      return (members ?? []).map((member) => ({ ...member, profile: byId.get(member.user_id) }));
    },
  });

  const invites = useQuery({
    queryKey: ["settings", "invites", workspaceId],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invites")
        .select("id,email,workspace_role,expires_at,created_at")
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const createInvite = useMutation({
    mutationFn: async () => {
      const clean = email.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(clean)) throw new Error("Enter a valid email address.");
      const { data, error } = await supabase.rpc("create_invite", {
        _email: clean,
        _workspace_id: workspaceId,
        _workspace_role: role,
        _app_role: "client_viewer",
        _expires_days: 14,
      });
      if (error) throw error;
      return data?.[0]?.raw_token;
    },
    onSuccess: async (token) => {
      setEmail("");
      await refreshInvites();
      if (token) await copyInvite(token);
      toast.success("Invite created and link copied.");
    },
    onError: showError,
  });

  const resend = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("resend_invite", {
        _invite_id: id,
        _extend_days: 14,
      });
      if (error) throw error;
      return data?.[0]?.raw_token;
    },
    onSuccess: async (token) => {
      await refreshInvites();
      if (token) await copyInvite(token);
      toast.success("Invite refreshed and link copied.");
    },
    onError: showError,
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("revoke_invite", { _invite_id: id });
      if (error) throw error;
    },
    onSuccess: async () => {
      await refreshInvites();
      toast.success("Invite revoked.");
    },
    onError: showError,
  });

  return (
    <section className="surface-card overflow-hidden">
      <div className="border-b border-border/60 px-6 py-5">
        <h2 className="text-lg font-semibold text-foreground">Team</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Invite teammates and review workspace access.
        </p>
        {canManage && (
          <form
            className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              createInvite.mutate();
            }}
          >
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="teammate@company.com"
              className="rounded-lg border border-input bg-surface/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as InviteRole)}
              className="rounded-lg border border-input bg-surface/60 px-3 py-2 text-sm text-foreground"
            >
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              disabled={createInvite.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {createInvite.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              Invite
            </button>
          </form>
        )}
      </div>
      <div className="divide-y divide-border/60">
        {team.isLoading ? (
          <LoadingRow />
        ) : (
          (team.data ?? []).map((member) => (
            <div key={member.id} className="flex items-center justify-between gap-4 px-6 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {member.profile
                    ? [member.profile.first_name, member.profile.last_name]
                        .filter(Boolean)
                        .join(" ") || "Team member"
                    : "Team member"}
                </p>
                <p className="truncate text-xs text-muted-foreground">{member.user_id}</p>
              </div>
              <RoleBadge role={member.role} />
            </div>
          ))
        )}
        {canManage &&
          (invites.data ?? []).map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between gap-4 bg-primary/[0.025] px-6 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{invite.email}</p>
                <p className="text-xs text-muted-foreground">
                  Pending · expires {new Date(invite.expires_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <RoleBadge role={invite.workspace_role} />
                <button
                  title="Refresh invite link"
                  onClick={() => resend.mutate(invite.id)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-elevated hover:text-foreground"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  title="Revoke invite"
                  onClick={() => revoke.mutate(invite.id)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}

async function copyInvite(token: string) {
  await navigator.clipboard.writeText(
    `${window.location.origin}/accept-invite?token=${encodeURIComponent(token)}`,
  );
}
function showError(error: Error) {
  toast.error(error.message || "Something went wrong.");
}
function RoleBadge({ role }: { role: string }) {
  return (
    <span className="rounded-md bg-elevated px-2 py-1 text-xs font-medium capitalize text-foreground ring-1 ring-border">
      {role}
    </span>
  );
}
function LoadingRow() {
  return (
    <div className="flex items-center px-6 py-5 text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Loading team…
    </div>
  );
}
