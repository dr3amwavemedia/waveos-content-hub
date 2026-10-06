import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  SOCIAL_PLANS,
  socialPlanAllowsBillingInterval,
  socialPlanPrice,
  type SocialBillingInterval,
} from "@/lib/social-plans";

type SocialSubscriptionRow = {
  workspace_id: string;
  plan: "trial" | "standard" | "expanded";
  status: string;
  billing_interval: SocialBillingInterval | null;
  account_limit: number;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  payment_failure_count: number;
  last_payment_failed_at: string | null;
  service_locked_at: string | null;
  stripe_customer_id: string | null;
};

async function requireWorkspaceAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
) {
  const [{ data: membership }, { data: roles }] = await Promise.all([
    supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const staff = (roles ?? []).some((row: { role: string }) =>
    ["dream_wave_owner", "dream_wave_team"].includes(row.role),
  );
  if (!staff && !["owner", "admin"].includes(membership?.role ?? ""))
    throw new Error("workspace_admin_required");
}

async function requirePublicOsWorkspace(workspaceId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: workspace, error } = await supabaseAdmin
    .from("workspaces")
    .select("id,data_source")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (workspace?.data_source !== "os_data") {
    throw new Error("public_subscription_workspace_required");
  }
  return workspace;
}

export const getSocialSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { workspaceId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: member } = await context.supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const staff = (roles ?? []).some((row) =>
      ["dream_wave_owner", "dream_wave_team"].includes(row.role),
    );
    if (!member && !staff) throw new Error("forbidden");
    await requirePublicOsWorkspace(data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin
      .from("workspace_social_subscriptions" as never)
      .select(
        "workspace_id,plan,status,billing_interval,account_limit,trial_ends_at,current_period_end,cancel_at_period_end,payment_failure_count,last_payment_failed_at,service_locked_at,stripe_customer_id",
      )
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (result.error) throw result.error;
    const subscription = result.data as SocialSubscriptionRow | null;
    const { count } = await supabaseAdmin
      .from("social_connections")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", data.workspaceId)
      .eq("provider", "zernio")
      .eq("connected", true);
    return { subscription, connectedAccounts: count ?? 0, plans: SOCIAL_PLANS };
  });

export const startSocialTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { workspaceId: string }) => data)
  .handler(async ({ data, context }) => {
    await requireWorkspaceAdmin(context.supabase, context.userId, data.workspaceId);
    await requirePublicOsWorkspace(data.workspaceId);
    const result = await (
      context.supabase.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: Error | null }>
    )("start_workspace_social_trial", {
      _workspace_id: data.workspaceId,
    });
    if (result.error) throw result.error;
    return { started: true };
  });

export const createSocialSubscriptionCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: {
      workspaceId: string;
      plan: "standard" | "expanded";
      interval: SocialBillingInterval;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    await requireWorkspaceAdmin(context.supabase, context.userId, data.workspaceId);
    await requirePublicOsWorkspace(data.workspaceId);
    if (!socialPlanAllowsBillingInterval(data.plan, data.interval))
      throw new Error("Expanded is available with annual billing only.");
    const { stripePublicSubscriptionsEnabled, stripeRequest } = await import("@/lib/stripe.server");
    if (!stripePublicSubscriptionsEnabled())
      throw new Error(
        "Live social subscriptions are not enabled yet. Use Stripe test mode in preview or enable live subscriptions at launch.",
      );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: workspace } = await supabaseAdmin
      .from("workspaces")
      .select("name,data_source")
      .eq("id", data.workspaceId)
      .single();
    if (workspace?.data_source !== "os_data")
      throw new Error("public_subscription_workspace_required");
    const amount = socialPlanPrice(data.plan, data.interval);
    const origin = process.env.WAVEOS_APP_URL || "https://waveos.dreamwavemedia.co";
    const session = await stripeRequest<{ id: string; url?: string | null }>("/checkout/sessions", {
      body: {
        mode: "subscription",
        client_reference_id: data.workspaceId,
        success_url: `${origin}/settings?social_checkout=success`,
        cancel_url: `${origin}/settings?social_checkout=cancelled`,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: amount,
              recurring: { interval: data.interval === "annual" ? "year" : "month" },
              product_data: { name: `WaveOS Social ${SOCIAL_PLANS[data.plan].name}` },
            },
          },
        ],
        metadata: {
          workspace_id: data.workspaceId,
          social_plan: data.plan,
          billing_interval: data.interval,
          workspace_name: workspace?.name ?? "WaveOS workspace",
        },
        subscription_data: {
          metadata: {
            workspace_id: data.workspaceId,
            social_plan: data.plan,
            billing_interval: data.interval,
          },
        },
      },
    });
    await supabaseAdmin.from("workspace_social_subscriptions" as never).upsert(
      {
        workspace_id: data.workspaceId,
        plan: data.plan,
        status: "checkout_pending",
        billing_interval: data.interval,
        account_limit: SOCIAL_PLANS[data.plan].accountLimit,
        stripe_checkout_session_id: session.id,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "workspace_id" },
    );
    return { url: session.url ?? null };
  });

export const createSocialBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { workspaceId: string }) => data)
  .handler(async ({ data, context }) => {
    await requireWorkspaceAdmin(context.supabase, context.userId, data.workspaceId);
    await requirePublicOsWorkspace(data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin
      .from("workspace_social_subscriptions" as never)
      .select("stripe_customer_id")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (result.error) throw result.error;
    const customerId = (result.data as { stripe_customer_id?: string | null } | null)
      ?.stripe_customer_id;
    if (!customerId) throw new Error("No Stripe billing account is connected yet.");
    const { stripeRequest } = await import("@/lib/stripe.server");
    const origin = process.env.WAVEOS_APP_URL || "https://waveos.dreamwavemedia.co";
    const portal = await stripeRequest<{ url?: string | null }>("/billing_portal/sessions", {
      body: { customer: customerId, return_url: `${origin}/settings?billing=updated` },
    });
    if (!portal.url) throw new Error("Stripe did not return a billing portal link.");
    return { url: portal.url };
  });
