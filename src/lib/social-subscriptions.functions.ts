import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { StripeCheckoutSession } from "@/lib/stripe.server";
import {
  SOCIAL_PLANS,
  socialPlanAllowsBillingInterval,
  socialPlanPrice,
  type SocialBillingInterval,
} from "@/lib/social-plans";

type SocialSubscriptionRow = {
  workspace_id: string;
  plan: "trial" | "standard" | "full" | "expanded";
  status: string;
  internal_test_access: boolean;
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

type SocialSubscriptionInvoiceRow = {
  stripe_invoice_id: string;
  invoice_number: string | null;
  status: string;
  amount_due_cents: number;
  amount_paid_cents: number;
  currency: string;
  hosted_invoice_url: string | null;
  invoice_pdf_url: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  created_at: string;
};

function safeStripeCheckoutUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

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
      .select("workspace_id,role")
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
    const canSeeBilling = staff || member?.role === "owner" || member?.role === "admin";
    await requirePublicOsWorkspace(data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin
      .from("workspace_social_subscriptions" as never)
      .select(
        "workspace_id,plan,status,internal_test_access,billing_interval,account_limit,trial_ends_at,current_period_end,cancel_at_period_end,payment_failure_count,last_payment_failed_at,service_locked_at,stripe_customer_id",
      )
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (result.error) throw result.error;
    const subscription = result.data as SocialSubscriptionRow | null;
    const [{ count }, invoiceResult] = await Promise.all([
      supabaseAdmin
        .from("social_connections")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", data.workspaceId)
        .eq("provider", "zernio")
        .eq("connected", true),
      canSeeBilling
        ? supabaseAdmin
            .from("workspace_social_subscription_invoices" as never)
            .select(
              "stripe_invoice_id,invoice_number,status,amount_due_cents,amount_paid_cents,currency,hosted_invoice_url,invoice_pdf_url,billing_period_start,billing_period_end,created_at",
            )
            .eq("workspace_id", data.workspaceId)
            .order("created_at", { ascending: false })
            .limit(24)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (invoiceResult.error) throw invoiceResult.error;
    return {
      subscription:
        subscription && !canSeeBilling
          ? ({ ...subscription, stripe_customer_id: null } as SocialSubscriptionRow)
          : subscription,
      connectedAccounts: count ?? 0,
      plans: SOCIAL_PLANS,
      invoices: canSeeBilling ? ((invoiceResult.data ?? []) as SocialSubscriptionInvoiceRow[]) : [],
    };
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
      plan: "standard" | "full" | "expanded";
      interval: SocialBillingInterval;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    await requireWorkspaceAdmin(context.supabase, context.userId, data.workspaceId);
    await requirePublicOsWorkspace(data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existingSubscription, error: existingSubscriptionError } = await supabaseAdmin
      .from("workspace_social_subscriptions" as never)
      .select("internal_test_access,status,stripe_subscription_id,stripe_checkout_session_id")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (existingSubscriptionError) throw existingSubscriptionError;
    const existing = existingSubscription as {
      internal_test_access?: boolean;
      status?: string;
      stripe_subscription_id?: string | null;
      stripe_checkout_session_id?: string | null;
    } | null;
    if (existing?.internal_test_access)
      throw new Error("Internal test accounts do not use Stripe checkout.");
    if (
      existing?.stripe_subscription_id &&
      ["active", "trialing", "past_due"].includes(existing.status ?? "")
    ) {
      throw new Error("This workspace already has a Stripe subscription. Manage billing instead.");
    }
    if (!socialPlanAllowsBillingInterval(data.plan, data.interval))
      throw new Error("That billing interval is not available for this plan.");
    const { stripeModeMatches, stripePublicSubscriptionsEnabled, stripeRequest } =
      await import("@/lib/stripe.server");
    if (!stripePublicSubscriptionsEnabled())
      throw new Error(
        "Live social subscriptions are not enabled yet. Use Stripe test mode in preview or enable live subscriptions at launch.",
      );

    // Reuse an unfinished Checkout Session instead of creating a second one.
    // If Stripe completed the stored session before its webhook reached WaveOS,
    // reconcile it here and stop: a customer must never be able to buy the same
    // subscription twice just because the return screen loaded first.
    if (existing?.stripe_checkout_session_id) {
      let priorSession: StripeCheckoutSession | null = null;
      try {
        priorSession = await stripeRequest<StripeCheckoutSession>(
          `/checkout/sessions/${encodeURIComponent(existing.stripe_checkout_session_id)}`,
          { method: "GET" },
        );
      } catch {
        throw new Error(
          "WaveOS could not verify your existing checkout. Please wait a moment and try again; do not pay twice.",
        );
      }
      const belongsToWorkspace = Boolean(
        priorSession &&
        priorSession.mode === "subscription" &&
        stripeModeMatches(priorSession.livemode) &&
        priorSession.client_reference_id === data.workspaceId &&
        priorSession.metadata?.workspace_id === data.workspaceId,
      );
      if (priorSession && !belongsToWorkspace) {
        throw new Error(
          "WaveOS could not verify your existing checkout. Please contact support before trying again.",
        );
      }
      if (priorSession && belongsToWorkspace && priorSession.status === "complete") {
        if (!priorSession.subscription) {
          throw new Error(
            "Stripe is still finishing this checkout. Refresh shortly; do not submit another payment.",
          );
        }
        const { applySocialSubscriptionEvent } =
          await import("@/lib/social-subscription-webhook.server");
        const applied = await applySocialSubscriptionEvent(
          "checkout.session.completed",
          priorSession as unknown as Record<string, unknown>,
          { sendCheckoutWelcome: true },
        );
        if (!applied) {
          throw new Error(
            "Stripe confirmed this checkout, but WaveOS is still activating it. Refresh shortly; do not pay again.",
          );
        }
        throw new Error(
          "This workspace already has a Stripe subscription. Manage billing instead.",
        );
      }
      if (priorSession && belongsToWorkspace && priorSession.status === "open") {
        const sameSelection =
          priorSession.metadata?.social_plan === data.plan &&
          priorSession.metadata?.billing_interval === data.interval;
        const priorUrl = safeStripeCheckoutUrl(priorSession.url);
        if (sameSelection && priorUrl) return { url: priorUrl };
        try {
          await stripeRequest(`/checkout/sessions/${encodeURIComponent(priorSession.id)}/expire`);
        } catch {
          throw new Error(
            "Your existing checkout is still open. Reopen it or wait a moment before changing plans.",
          );
        }
      }
    }
    const { data: workspace } = await supabaseAdmin
      .from("workspaces")
      .select("name,data_source")
      .eq("id", data.workspaceId)
      .single();
    if (workspace?.data_source !== "os_data")
      throw new Error("public_subscription_workspace_required");
    const amount = socialPlanPrice(data.plan, data.interval);
    const { data: promoRedemption, error: promoError } = await supabaseAdmin
      .from("os_promo_redemptions" as never)
      .select("bonus_trial_days")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (promoError) throw promoError;
    const promoTrialDays = Math.min(
      30,
      Math.max(
        0,
        Number((promoRedemption as { bonus_trial_days?: number } | null)?.bonus_trial_days ?? 0),
      ),
    );
    const origin = new URL(process.env.WAVEOS_APP_URL || "https://waveos.dreamwavemedia.co").origin;
    const session = await stripeRequest<StripeCheckoutSession>("/checkout/sessions", {
      body: {
        mode: "subscription",
        client_reference_id: data.workspaceId,
        success_url: `${origin}/settings?subscription=started&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/settings?social_checkout=cancelled`,
        payment_method_collection: "always",
        ...(promoTrialDays
          ? {
              custom_text: {
                submit: {
                  message: `Your ${promoTrialDays}-day WaveOS promo makes today's total $0. A card is required and your selected plan begins automatically after the trial unless you cancel.`,
                },
              },
            }
          : {}),
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
          promo_trial_days: promoTrialDays || "",
        },
        subscription_data: {
          ...(promoTrialDays ? { trial_period_days: promoTrialDays } : {}),
          metadata: {
            workspace_id: data.workspaceId,
            social_plan: data.plan,
            billing_interval: data.interval,
            promo_trial_days: promoTrialDays || "",
          },
        },
      },
    });
    if (
      !session.url ||
      session.status !== "open" ||
      !stripeModeMatches(session.livemode) ||
      !safeStripeCheckoutUrl(session.url)
    ) {
      throw new Error("Stripe did not return a valid subscription checkout link.");
    }
    const pendingSubscription = {
      workspace_id: data.workspaceId,
      plan: promoTrialDays ? "standard" : data.plan,
      status: "checkout_pending",
      billing_interval: data.interval,
      account_limit: promoTrialDays ? 3 : SOCIAL_PLANS[data.plan].accountLimit,
      stripe_checkout_session_id: session.id,
      updated_at: new Date().toISOString(),
    };
    let claimResult: { data: Array<{ workspace_id: string }> | null; error: unknown };
    if (existing) {
      let claim = supabaseAdmin
        .from("workspace_social_subscriptions" as never)
        .update(pendingSubscription as never)
        .eq("workspace_id", data.workspaceId);
      claim = existing.stripe_checkout_session_id
        ? claim.eq("stripe_checkout_session_id", existing.stripe_checkout_session_id)
        : claim.is("stripe_checkout_session_id", null);
      claimResult = (await claim.select("workspace_id")) as unknown as typeof claimResult;
    } else {
      claimResult = (await supabaseAdmin
        .from("workspace_social_subscriptions" as never)
        .insert(pendingSubscription as never)
        .select("workspace_id")) as unknown as typeof claimResult;
    }
    if (claimResult.error || !claimResult.data?.length) {
      await stripeRequest(`/checkout/sessions/${encodeURIComponent(session.id)}/expire`).catch(
        () => undefined,
      );
      throw new Error("Checkout changed while loading. Refresh and use the existing checkout.");
    }
    return { url: session.url };
  });

export const confirmSocialSubscriptionCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { workspaceId: string; sessionId: string }) => data)
  .handler(async ({ data, context }) => {
    await requireWorkspaceAdmin(context.supabase, context.userId, data.workspaceId);
    await requirePublicOsWorkspace(data.workspaceId);
    const { stripeModeMatches, stripeRequest } = await import("@/lib/stripe.server");
    const session = await stripeRequest<StripeCheckoutSession>(
      `/checkout/sessions/${encodeURIComponent(data.sessionId)}`,
      { method: "GET" },
    );
    if (
      session.status !== "complete" ||
      session.mode !== "subscription" ||
      !stripeModeMatches(session.livemode) ||
      session.client_reference_id !== data.workspaceId ||
      session.metadata?.workspace_id !== data.workspaceId ||
      !session.subscription
    ) {
      throw new Error("Stripe has not confirmed this subscription checkout.");
    }
    const { applySocialSubscriptionEvent } =
      await import("@/lib/social-subscription-webhook.server");
    const applied = await applySocialSubscriptionEvent(
      "checkout.session.completed",
      session as unknown as Record<string, unknown>,
      { sendCheckoutWelcome: true },
    );
    if (!applied) throw new Error("Subscription confirmation could not be applied.");
    return { confirmed: true };
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
      .select("stripe_customer_id,internal_test_access")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (result.error) throw result.error;
    const subscription = result.data as {
      stripe_customer_id?: string | null;
      internal_test_access?: boolean;
    } | null;
    if (subscription?.internal_test_access)
      throw new Error("Internal test accounts do not have Stripe billing.");
    const customerId = subscription?.stripe_customer_id;
    if (!customerId) throw new Error("No Stripe billing account is connected yet.");
    const { stripeRequest } = await import("@/lib/stripe.server");
    const origin = new URL(process.env.WAVEOS_APP_URL || "https://waveos.dreamwavemedia.co").origin;
    const portal = await stripeRequest<{ url?: string | null }>("/billing_portal/sessions", {
      body: { customer: customerId, return_url: `${origin}/settings?billing=updated` },
    });
    if (!portal.url) throw new Error("Stripe did not return a billing portal link.");
    return { url: portal.url };
  });
