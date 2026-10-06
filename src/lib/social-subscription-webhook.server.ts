import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SOCIAL_PLANS } from "@/lib/social-plans";
import { stripeRequest } from "@/lib/stripe.server";

type StripeSubscription = {
  id: string;
  customer?: string | null;
  status?: string;
  current_period_end?: number;
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
  } else if (
    (eventType === "invoice.paid" || eventType === "invoice.payment_failed") &&
    subscriptionId
  ) {
    subscription = await stripeRequest<StripeSubscription>(
      `/subscriptions/${encodeURIComponent(subscriptionId)}`,
      { method: "GET" },
    );
    forcedStatus = eventType === "invoice.paid" ? "active" : "past_due";
  } else {
    return false;
  }
  const metadata = { ...objectMetadata, ...(subscription.metadata ?? {}) };
  const workspaceId = metadata.workspace_id;
  const plan = metadata.social_plan as "standard" | "expanded" | undefined;
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
  const isPaid = eventType === "invoice.paid";
  const isFailed = eventType === "invoice.payment_failed";
  // A delayed failed-invoice event must never re-lock a subscription that is
  // already active in Stripe after a successful retry.
  if (isFailed && subscription.status === "active") return true;
  const { data: existing } = await supabaseAdmin
    .from("workspace_social_subscriptions" as never)
    .select("payment_failure_count,service_locked_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
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
  const locked =
    (isFailed && (attemptCount >= 2 || Boolean(previous?.service_locked_at))) || terminal;
  const now = new Date().toISOString();
  const result = await supabaseAdmin.from("workspace_social_subscriptions" as never).upsert(
    {
      workspace_id: workspaceId,
      plan,
      status: forcedStatus ?? localStatus(subscription.status),
      billing_interval: interval ?? null,
      account_limit: SOCIAL_PLANS[plan].accountLimit,
      stripe_customer_id: subscription.customer ?? (String(object.customer ?? "") || null),
      stripe_subscription_id: subscription.id,
      stripe_checkout_session_id:
        eventType === "checkout.session.completed" ? String(object.id ?? "") : undefined,
      current_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
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
