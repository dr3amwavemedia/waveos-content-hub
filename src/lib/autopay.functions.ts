import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicReturnOrigin } from "@/lib/public-origin.server";
import {
  stripeIsTestMode,
  stripeModeMatches,
  stripeRequest,
  type StripeCheckoutSession,
} from "@/lib/stripe.server";

type StripeCustomer = { id: string; livemode?: boolean };

export const createAutopayAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { scheduleId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: schedule, error } = await context.supabase
      .from("invoice_autopay_schedules")
      .select("*")
      .eq("id", data.scheduleId)
      .maybeSingle();
    if (error) throw error;
    if (!schedule || !schedule.enabled) throw new Error("Automatic payments are not available.");
    if (schedule.status === "completed" || schedule.status === "cancelled") {
      throw new Error("This automatic payment schedule is closed.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let customerId = schedule.stripe_customer_id;
    if (!customerId) {
      const customer = await stripeRequest<StripeCustomer>("/customers", {
        body: {
          email: typeof context.claims.email === "string" ? context.claims.email : undefined,
          metadata: { workspace_id: schedule.workspace_id, autopay_schedule_id: schedule.id },
        },
        idempotencyKey: `autopay-customer:${schedule.id}`,
      });
      if (!stripeModeMatches(customer.livemode)) throw new Error("Stripe mode mismatch.");
      customerId = customer.id;
    }

    const origin = publicReturnOrigin();
    const session = await stripeRequest<StripeCheckoutSession>("/checkout/sessions", {
      body: {
        mode: "setup",
        customer: customerId,
        payment_method_types: ["card"],
        success_url: `${origin}/home?autopay=authorized#invoices`,
        cancel_url: `${origin}/home?autopay=cancelled#invoices`,
        client_reference_id: schedule.source_invoice_id,
        metadata: {
          autopay_schedule_id: schedule.id,
          invoice_id: schedule.source_invoice_id,
          workspace_id: schedule.workspace_id,
        },
      },
      idempotencyKey: `autopay-setup:${schedule.id}:${crypto.randomUUID()}`,
    });
    if (!session.url || session.status !== "open" || !stripeModeMatches(session.livemode)) {
      throw new Error("Stripe did not return an authorization page.");
    }
    await supabaseAdmin
      .from("invoice_autopay_schedules")
      .update({
        stripe_customer_id: customerId,
        stripe_setup_session_id: session.id,
        status: "pending_authorization",
        last_error: null,
      })
      .eq("id", schedule.id);
    return { url: session.url, testMode: stripeIsTestMode() };
  });
