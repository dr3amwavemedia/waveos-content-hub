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

export type OsPromoColor = "ocean" | "violet" | "emerald" | "sunset";

export const listOsPromoCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: Record<string, never>) => data)
  .handler(async ({ context }) => {
    const admin = await requireOwner(context.userId);
    const { data, error } = await admin
      .from("os_promo_codes" as never)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Array<{
      id: string;
      code: string;
      name: string;
      bonus_trial_days: number;
      max_redemptions: number;
      redemption_count: number;
      starts_at: string;
      expires_at: string | null;
      is_active: boolean;
      color_theme: OsPromoColor;
      created_at: string;
    }>;
  });

export const createOsPromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: {
      code: string;
      name: string;
      bonusTrialDays: number;
      maxRedemptions: number;
      startsAt?: string | null;
      expiresAt?: string | null;
      colorTheme: OsPromoColor;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const admin = await requireOwner(context.userId);
    const code = data.code.trim().toUpperCase();
    const name = data.name.trim();
    if (!/^[A-Z0-9][A-Z0-9-]{2,23}$/.test(code))
      throw new Error("Use 3–24 letters, numbers, or hyphens for the promo code.");
    if (!name || name.length > 80) throw new Error("Add a promo name up to 80 characters.");
    if (
      !Number.isInteger(data.bonusTrialDays) ||
      data.bonusTrialDays < 1 ||
      data.bonusTrialDays > 30
    )
      throw new Error("Promo trial duration must be between 1 and 30 days.");
    if (
      !Number.isInteger(data.maxRedemptions) ||
      data.maxRedemptions < 1 ||
      data.maxRedemptions > 100000
    )
      throw new Error("Redemption limit must be between 1 and 100,000.");
    const startsAt = data.startsAt ? new Date(data.startsAt) : new Date();
    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    if (Number.isNaN(startsAt.getTime()) || (expiresAt && Number.isNaN(expiresAt.getTime())))
      throw new Error("Enter valid promo dates.");
    if (expiresAt && expiresAt <= startsAt)
      throw new Error("Expiration must be after the start date.");
    const result = await admin.from("os_promo_codes" as never).insert({
      code,
      name,
      bonus_trial_days: data.bonusTrialDays,
      max_redemptions: data.maxRedemptions,
      starts_at: startsAt.toISOString(),
      expires_at: expiresAt?.toISOString() ?? null,
      color_theme: data.colorTheme,
      created_by: context.userId,
    } as never);
    if (result.error) {
      if (result.error.message.toLowerCase().includes("unique"))
        throw new Error("That promo code already exists.");
      throw result.error;
    }
    await admin.from("activity_logs").insert({
      actor_user_id: context.userId,
      action: "os_promo_code_created",
      entity_type: "os_promo_code",
      safe_metadata: { code, trial_duration_days: data.bonusTrialDays, account_limit: 3 },
    });
    return { created: true };
  });

export const setOsPromoCodeActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { promoId: string; active: boolean }) => data)
  .handler(async ({ data, context }) => {
    const admin = await requireOwner(context.userId);
    const result = await admin
      .from("os_promo_codes" as never)
      .update({ is_active: data.active } as never)
      .eq("id", data.promoId);
    if (result.error) throw result.error;
    await admin.from("activity_logs").insert({
      actor_user_id: context.userId,
      action: "os_promo_code_status_changed",
      entity_type: "os_promo_code",
      entity_id: data.promoId,
      safe_metadata: { active: data.active },
    });
    return { updated: true };
  });

export const listOsAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { search?: string; page?: number; pageSize?: number }) => data)
  .handler(async ({ data, context }) => {
    const admin = await requireOwner(context.userId);
    const page = Math.max(1, data.page ?? 1);
    // The UI uses 30 rows. Owner-only CSV exports may request larger pages so
    // the browser does not repeat the full Auth/profile lookup for every page.
    const pageSize = Math.min(1000, Math.max(10, data.pageSize ?? 30));
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
          .select(
            "workspace_id,plan,status,billing_interval,account_limit,trial_started_at,trial_ends_at,current_period_end,cancel_at_period_end",
          )
          .in("workspace_id", workspaceIds)
      : { data: [] };
    const subscriptions = (rawSubscriptions ?? []) as Array<{
      workspace_id: string;
      plan: string;
      status: string;
      billing_interval: string | null;
      account_limit: number;
      trial_started_at: string | null;
      trial_ends_at: string | null;
      current_period_end: string | null;
      cancel_at_period_end: boolean;
    }>;
    const subscriptionByWorkspace = new Map(subscriptions.map((row) => [row.workspace_id, row]));
    const { data: rawRedemptions } = workspaceIds.length
      ? await admin
          .from("os_promo_redemptions" as never)
          .select("workspace_id,promo_code_id,bonus_trial_days")
          .in("workspace_id", workspaceIds)
      : { data: [] };
    const redemptions = (rawRedemptions ?? []) as Array<{
      workspace_id: string;
      promo_code_id: string;
      bonus_trial_days: number;
    }>;
    const promoIds = [...new Set(redemptions.map((row) => row.promo_code_id))];
    const { data: rawPromos } = promoIds.length
      ? await admin
          .from("os_promo_codes" as never)
          .select("id,code,name")
          .in("id", promoIds)
      : { data: [] };
    const promoById = new Map(
      ((rawPromos ?? []) as Array<{ id: string; code: string; name: string }>).map((row) => [
        row.id,
        row,
      ]),
    );
    const redemptionByWorkspace = new Map(redemptions.map((row) => [row.workspace_id, row]));
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
        const redemption = workspaceId ? redemptionByWorkspace.get(workspaceId) : undefined;
        const promo = redemption ? promoById.get(redemption.promo_code_id) : undefined;
        return {
          id: profile.id,
          workspaceId: workspaceId ?? null,
          email: user?.email ?? "",
          firstName: profile.first_name,
          lastName: profile.last_name,
          createdAt: profile.created_at,
          paymentsEnabled: profile.payments_enabled,
          lastSignInAt: user?.last_sign_in_at ?? null,
          plan: subscription?.plan ?? null,
          planStatus: subscription?.status ?? null,
          billingInterval: subscription?.billing_interval ?? null,
          accountLimit: subscription?.account_limit ?? 0,
          trialStartedAt: subscription?.trial_started_at ?? null,
          trialEndsAt: subscription?.trial_ends_at ?? null,
          currentPeriodEnd: subscription?.current_period_end ?? null,
          cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
          connectedAccounts,
          remainingAccounts: Math.max(0, (subscription?.account_limit ?? 0) - connectedAccounts),
          promoCode: promo?.code ?? null,
          promoName: promo?.name ?? null,
          promoBonusTrialDays: redemption?.bonus_trial_days ?? 0,
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
