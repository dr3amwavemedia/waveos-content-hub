import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SOCIAL_PLANS } from "@/lib/social-plans";
import { stripeRequest } from "@/lib/stripe.server";

type StripeSubscription = {
  id: string;
  customer?: string | null;
  status?: string;
  current_period_end?: number;
  trial_start?: number;
  trial_end?: number;
  cancel_at_period_end?: boolean;
  metadata?: Record<string, string>;
};

function invoiceSubscriptionId(object: Record<string, unknown>) {
  if (object.subscription) return String(object.subscription);
  const parent = object.parent as
    { subscription_details?: { subscription?: string | null } } | undefined;
  return parent?.subscription_details?.subscription
    ? String(parent.subscription_details.subscription)
    : "";
}

function localStatus(status: string | undefined) {
  if (status === "active") return "active";
  if (status === "trialing") return "trialing";
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  return "past_due";
}

export async function applySocialSubscriptionEvent(
  eventType: string,
  object: Record<string, unknown>,
) {
  const objectMetadata = (object.metadata ?? {}) as Record<string, string>;
  const socialPlan = objectMetadata.social_plan;
  let subscription: StripeSubscription | null = null;
  let forcedStatus: "active" | "past_due" | null = null;
  const subscriptionId = invoiceSubscriptionId(object);
  if (eventType === "checkout.session.completed" && object.mode === "subscription") {
    const id = String(object.subscription ?? "");
    if (!id || !socialPlan) return false;
    subscription = await stripeRequest<StripeSubscription>(
      `/subscriptions/${encodeURIComponent(id)}`,
      { method: "GET" },
    );
  } else if (eventType.startsWith("customer.subscription.")) {
    subscription = object as unknown as StripeSubscription;
  } else if (eventType.startsWith("invoice.") && subscriptionId) {
    subscription = await stripeRequest<StripeSubscription>(
      `/subscriptions/${encodeURIComponent(subscriptionId)}`,
      { method: "GET" },
    );
    forcedStatus =
      eventType === "invoice.paid" && subscription.status === "active"
        ? "active"
        : eventType === "invoice.payment_failed"
          ? "past_due"
          : null;
  } else {
    return false;
  }
  const metadata = { ...objectMetadata, ...(subscription.metadata ?? {}) };
  const workspaceId = metadata.workspace_id;
  const plan = metadata.social_plan as "standard" | "full" | "expanded" | undefined;
  const interval = metadata.billing_interval as "monthly" | "annual" | undefined;
  if (!workspaceId || !plan || !SOCIAL_PLANS[plan]) return false;
  const { data: workspace, error: workspaceError } = await supabaseAdmin
    .from("workspaces")
    .select("data_source")
    .eq("id", workspaceId)
    .maybeSingle();
  if (workspaceError) throw workspaceError;
  // Consume stale social-subscription events for Dream Wave client workspaces
  // without letting them create or update a public WaveOS billing record.
  if (workspace?.data_source !== "os_data") return Boolean(workspace);
  if (eventType.startsWith("invoice.")) {
    const invoiceId = String(object.id ?? "");
    if (invoiceId) {
      const toIso = (value: unknown) => {
        const seconds = Number(value ?? 0);
        return Number.isFinite(seconds) && seconds > 0
          ? new Date(seconds * 1000).toISOString()
          : null;
      };
      const invoiceResult = await supabaseAdmin
        .from("workspace_social_subscription_invoices" as never)
        .upsert(
          {
            workspace_id: workspaceId,
            stripe_invoice_id: invoiceId,
            stripe_subscription_id: subscription.id,
            invoice_number: typeof object.number === "string" ? object.number : null,
            status: String(object.status ?? eventType.replace("invoice.", "")),
            amount_due_cents: Math.max(0, Number(object.amount_due ?? 0) || 0),
            amount_paid_cents: Math.max(0, Number(object.amount_paid ?? 0) || 0),
            currency: String(object.currency ?? "usd").toUpperCase(),
            hosted_invoice_url:
              typeof object.hosted_invoice_url === "string" ? object.hosted_invoice_url : null,
            invoice_pdf_url: typeof object.invoice_pdf === "string" ? object.invoice_pdf : null,
            billing_period_start: toIso(object.period_start),
            billing_period_end: toIso(object.period_end),
            stripe_created_at: toIso(object.created),
            updated_at: new Date().toISOString(),
          } as never,
          { onConflict: "stripe_invoice_id" },
        );
      if (invoiceResult.error) throw invoiceResult.error;
    }
  }
  const isPaid =
    eventType === "invoice.paid" &&
    subscription.status === "active" &&
    Number(object.amount_paid ?? 0) > 0;
  const isFailed = eventType === "invoice.payment_failed";
  // A delayed failed-invoice event must never re-lock a subscription that is
  // already active in Stripe after a successful retry.
  if (isFailed && subscription.status === "active") return true;
  const [{ data: existing }, { data: promoRedemption }] = await Promise.all([
    supabaseAdmin
      .from("workspace_social_subscriptions" as never)
      .select("payment_failure_count,service_locked_at")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabaseAdmin
      .from("os_promo_redemptions" as never)
      .select("id")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);
  const previous = existing as {
    payment_failure_count?: number;
    service_locked_at?: string | null;
  } | null;
  const attemptCount = isFailed
    ? Math.max(1, Number(object.attempt_count ?? 0) || 0, previous?.payment_failure_count ?? 0)
    : 0;
  const terminal = ["canceled", "unpaid", "incomplete_expired"].includes(
    String(subscription.status ?? ""),
  );
  const promoInitialPaymentFailed = Boolean(
    isFailed &&
    promoRedemption &&
    subscription.trial_end &&
    subscription.current_period_end &&
    subscription.current_period_end <= subscription.trial_end + 86_400,
  );
  const locked =
    (isFailed &&
      (promoInitialPaymentFailed || attemptCount >= 2 || Boolean(previous?.service_locked_at))) ||
    terminal;
  const now = new Date().toISOString();
  const promoTrialing = subscription.status === "trialing" && Boolean(metadata.promo_trial_days);
  const effectivePlan = promoTrialing ? "standard" : plan;
  const result = await supabaseAdmin.from("workspace_social_subscriptions" as never).upsert(
    {
      workspace_id: workspaceId,
      plan: effectivePlan,
      status: forcedStatus ?? localStatus(subscription.status),
      billing_interval: interval ?? null,
      account_limit: promoTrialing ? 3 : SOCIAL_PLANS[plan].accountLimit,
      stripe_customer_id: subscription.customer ?? (String(object.customer ?? "") || null),
      stripe_subscription_id: subscription.id,
      stripe_checkout_session_id:
        eventType === "checkout.session.completed" ? String(object.id ?? "") : undefined,
      current_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
      trial_started_at: subscription.trial_start
        ? new Date(subscription.trial_start * 1000).toISOString()
        : null,
      trial_ends_at: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      ...(isPaid
        ? {
            payment_failure_count: 0,
            last_payment_failed_at: null,
            service_locked_at: null,
          }
        : isFailed
          ? {
              payment_failure_count: attemptCount,
              last_payment_failed_at: now,
              service_locked_at: locked ? (previous?.service_locked_at ?? now) : null,
            }
          : terminal
            ? { service_locked_at: now }
            : {}),
      updated_at: now,
    } as never,
    { onConflict: "workspace_id" },
  );
  if (result.error) throw result.error;
  if (isPaid || (!locked && ["active", "trialing"].includes(String(subscription.status ?? "")))) {
    const lifecycle = await supabaseAdmin.from("social_subscription_lifecycle" as never).upsert(
      {
        workspace_id: workspaceId,
        state: "active",
        reason: null,
        inactive_since: null,
        disconnect_at: null,
        disconnected_at: null,
        archive_at: null,
        archived_at: null,
        last_checked_at: now,
        last_error: null,
        updated_at: now,
      } as never,
      { onConflict: "workspace_id" },
    );
    if (lifecycle.error) throw lifecycle.error;
  } else if (locked) {
    const inactiveSince = previous?.service_locked_at ?? now;
    const inactiveMs = new Date(inactiveSince).getTime();
    const lifecycle = await supabaseAdmin.from("social_subscription_lifecycle" as never).upsert(
      {
        workspace_id: workspaceId,
        state: "grace",
        reason: terminal ? String(subscription.status ?? "canceled") : "payment_unresolved",
        inactive_since: inactiveSince,
        disconnect_at: new Date(inactiveMs + 7 * 86_400_000).toISOString(),
        archive_at: new Date(inactiveMs + 183 * 86_400_000).toISOString(),
        last_checked_at: now,
        last_error: null,
        updated_at: now,
      } as never,
      { onConflict: "workspace_id" },
    );
    if (lifecycle.error) throw lifecycle.error;
  }
  if (isPaid || isFailed) {
    try {
      const { sendSocialSubscriptionEmail } =
        await import("@/lib/social-subscription-email.server");
      await sendSocialSubscriptionEmail({
        kind: isPaid ? "paid" : "failed",
        workspaceId,
        customerEmail: typeof object.customer_email === "string" ? object.customer_email : null,
        amountPaid: isPaid ? Number(object.amount_paid ?? 0) : null,
        currency: typeof object.currency === "string" ? object.currency : null,
        attemptCount,
        locked,
      });
    } catch (error) {
      console.error("[social subscription email] delivery failed", error);
    }
  }
  return true;
}
