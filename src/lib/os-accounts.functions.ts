import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireOwner(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "dream_wave_owner")
    .maybeSingle();
  if (!data) throw new Error("owner_required");
  return supabaseAdmin;
}

export const listOsAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { search?: string; page?: number; pageSize?: number }) => data)
  .handler(async ({ data, context }) => {
    const admin = await requireOwner(context.userId);
    const page = Math.max(1, data.page ?? 1);
    const pageSize = Math.min(60, Math.max(10, data.pageSize ?? 30));
    const { data: rawProfiles, error } = await admin
      .from("profiles" as never)
      .select("id,first_name,last_name,created_at,payments_enabled")
      .eq("account_source", "os_data")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const profiles = (rawProfiles ?? []) as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      created_at: string;
      payments_enabled: boolean;
    }>;
    const userIds = profiles.map((profile) => profile.id);
    const { data: memberships } = userIds.length
      ? await admin.from("workspace_members").select("user_id,workspace_id").in("user_id", userIds)
      : { data: [] as Array<{ user_id: string; workspace_id: string }> };
    const workspaceByUser = new Map(
      (memberships ?? []).map((row) => [row.user_id, row.workspace_id]),
    );
    const workspaceIds = [...new Set(workspaceByUser.values())];
    const { data: rawSubscriptions } = workspaceIds.length
      ? await admin
          .from("workspace_social_subscriptions" as never)
          .select("workspace_id,plan,status,account_limit")
          .in("workspace_id", workspaceIds)
      : { data: [] };
    const subscriptions = (rawSubscriptions ?? []) as Array<{
      workspace_id: string;
      plan: string;
      status: string;
      account_limit: number;
    }>;
    const subscriptionByWorkspace = new Map(subscriptions.map((row) => [row.workspace_id, row]));
    const { data: connectionRows } = workspaceIds.length
      ? await admin
          .from("social_connections")
          .select("workspace_id")
          .in("workspace_id", workspaceIds)
          .eq("connected", true)
      : { data: [] as Array<{ workspace_id: string }> };
    const connectionCount = new Map<string, number>();
    for (const row of connectionRows ?? []) {
      connectionCount.set(row.workspace_id, (connectionCount.get(row.workspace_id) ?? 0) + 1);
    }
    const users = await Promise.all(
      (profiles ?? []).map(async (profile) => ({
        profile,
        user: (await admin.auth.admin.getUserById(profile.id)).data.user,
      })),
    );
    const search = data.search?.trim().toLowerCase() ?? "";
    const filtered = users.filter(
      ({ profile, user }) =>
        !search ||
        [user?.email, profile.first_name, profile.last_name].some((value) =>
          value?.toLowerCase().includes(search),
        ),
    );
    const start = (page - 1) * pageSize;
    return {
      accounts: filtered.slice(start, start + pageSize).map(({ profile, user }) => {
        const workspaceId = workspaceByUser.get(profile.id);
        const subscription = workspaceId ? subscriptionByWorkspace.get(workspaceId) : undefined;
        const connectedAccounts = workspaceId ? (connectionCount.get(workspaceId) ?? 0) : 0;
        return {
          id: profile.id,
          email: user?.email ?? "",
          firstName: profile.first_name,
          lastName: profile.last_name,
          createdAt: profile.created_at,
          paymentsEnabled: profile.payments_enabled,
          lastSignInAt: user?.last_sign_in_at ?? null,
          plan: subscription?.plan ?? null,
          planStatus: subscription?.status ?? null,
          accountLimit: subscription?.account_limit ?? 0,
          connectedAccounts,
          remainingAccounts: Math.max(0, (subscription?.account_limit ?? 0) - connectedAccounts),
        };
      }),
      total: filtered.length,
      page,
      pageSize,
    };
  });

export const updateOsAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { userId: string; firstName: string; lastName: string; email: string }) => data)
  .handler(async ({ data, context }) => {
    const admin = await requireOwner(context.userId);
    const { data: rawProfile } = await admin
      .from("profiles" as never)
      .select("account_source")
      .eq("id", data.userId)
      .maybeSingle();
    const profile = rawProfile as { account_source?: string } | null;
    if (profile?.account_source !== "os_data") throw new Error("os_account_not_found");
    const email = data.email.trim().toLowerCase();
    const auth = await admin.auth.admin.updateUserById(data.userId, {
      email,
      user_metadata: {
        first_name: data.firstName.trim(),
        last_name: data.lastName.trim(),
        account_source: "os_data",
      },
    });
    if (auth.error) throw auth.error;
    const updated = await admin
      .from("profiles" as never)
      .update({
        first_name: data.firstName.trim() || null,
        last_name: data.lastName.trim() || null,
      } as never)
      .eq("id", data.userId);
    if (updated.error) throw updated.error;
    await admin.from("activity_logs").insert({
      actor_user_id: context.userId,
      action: "os_account_updated",
      entity_type: "profile",
      entity_id: data.userId,
      safe_metadata: { email },
    });
    return { updated: true };
  });

export const sendOsAccountPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { userId: string }) => data)
  .handler(async ({ data, context }) => {
    const admin = await requireOwner(context.userId);
    const [{ data: rawProfile }, userResult] = await Promise.all([
      admin
        .from("profiles" as never)
        .select("account_source")
        .eq("id", data.userId)
        .maybeSingle(),
      admin.auth.admin.getUserById(data.userId),
    ]);
    const profile = rawProfile as { account_source?: string } | null;
    if (profile?.account_source !== "os_data" || !userResult.data.user?.email)
      throw new Error("os_account_not_found");
    const origin = process.env.WAVEOS_APP_URL ?? "https://waveos.dreamwavemedia.co";
    const result = await admin.auth.resetPasswordForEmail(userResult.data.user.email, {
      redirectTo: `${origin}/reset-password`,
    });
    if (result.error) throw result.error;
    await admin.from("activity_logs").insert({
      actor_user_id: context.userId,
      action: "os_account_password_reset_sent",
      entity_type: "profile",
      entity_id: data.userId,
      safe_metadata: { email: userResult.data.user.email },
    });
    return { sent: true };
  });

export const setOsAccountPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { userId: string; enabled: boolean }) => data)
  .handler(async ({ data, context }) => {
    await requireOwner(context.userId);
    const result = await context.supabase.rpc(
      "admin_set_os_account_payments" as never,
      { _user_id: data.userId, _enabled: data.enabled } as never,
    );
    if (result.error) throw result.error;
    return { updated: true };
  });

export const deleteOsAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { userId: string; confirmEmail: string }) => data)
  .handler(async ({ data, context }) => {
    const admin = await requireOwner(context.userId);
    const [{ data: rawProfile }, userResult] = await Promise.all([
      admin
        .from("profiles" as never)
        .select("account_source")
        .eq("id", data.userId)
        .maybeSingle(),
      admin.auth.admin.getUserById(data.userId),
    ]);
    const profile = rawProfile as { account_source?: string } | null;
    const email = userResult.data.user?.email?.toLowerCase();
    if (profile?.account_source !== "os_data" || !email) throw new Error("os_account_not_found");
    if (data.confirmEmail.trim().toLowerCase() !== email)
      throw new Error("confirmation_email_mismatch");
    await admin.from("activity_logs").insert({
      actor_user_id: context.userId,
      action: "os_account_deleted",
      entity_type: "profile",
      entity_id: data.userId,
      safe_metadata: { email },
    });
    const result = await admin.auth.admin.deleteUser(data.userId);
    if (result.error) throw result.error;
    return { deleted: true };
  });
