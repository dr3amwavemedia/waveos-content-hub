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
    object.subscription
  ) {
    subscription = await stripeRequest<StripeSubscription>(
      `/subscriptions/${encodeURIComponent(String(object.subscription))}`,
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
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "workspace_id" },
  );
  if (result.error) throw result.error;
  return true;
}
