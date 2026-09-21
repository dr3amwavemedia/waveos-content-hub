import { createFileRoute } from "@tanstack/react-router";
import { stripeRequest, type StripePaymentIntent } from "@/lib/stripe.server";
import { nextMonthlyChargeAt } from "@/lib/date-time";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const provided =
    request.headers.get("x-cron-secret") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || secret.length !== provided.length) return false;
  let difference = 0;
  for (let i = 0; i < secret.length; i++)
    difference |= secret.charCodeAt(i) ^ provided.charCodeAt(i);
  return difference === 0;
}

export const Route = createFileRoute("/api/public/hooks/charge-autopay-due")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const readiness = await supabaseAdmin.rpc("record_autopay_payment", {
          _schedule_id: "00000000-0000-0000-0000-000000000000",
          _invoice_id: "00000000-0000-0000-0000-000000000000",
          _payment_id: "readiness-check",
          _amount_cents: 1,
          _currency: "USD",
          _occurred_at: new Date().toISOString(),
          _next_charge_at: null,
        });
        if (!readiness.error?.message.includes("autopay_schedule_missing")) {
          return new Response("autopay_backend_not_ready", { status: 503 });
        }
        const { data: schedules } = await supabaseAdmin
          .from("invoice_autopay_schedules")
          .select("*")
          .eq("enabled", true)
          .eq("status", "active")
          .lte("charge_at", new Date().toISOString())
          .limit(20);
        let processed = 0;
        for (const schedule of schedules ?? []) {
          if (!schedule.stripe_customer_id || !schedule.stripe_payment_method_id) {
            await supabaseAdmin
              .from("invoice_autopay_schedules")
              .update({ status: "action_required", last_error: "card_authorization_missing" })
              .eq("id", schedule.id)
              .eq("status", "active");
            continue;
          }
          const claim = await supabaseAdmin
            .from("invoice_autopay_schedules")
            .update({ status: "processing", last_attempt_at: new Date().toISOString() })
            .eq("id", schedule.id)
            .eq("status", "active")
            .select("id");
          if (!claim.data?.length) continue;
          try {
            let invoiceId = schedule.current_invoice_id ?? schedule.source_invoice_id;
            if (
              schedule.frequency === "monthly" &&
              schedule.last_succeeded_at &&
              !schedule.current_invoice_id
            ) {
              const number = await supabaseAdmin.rpc("next_service_invoice_number", {
                _workspace_id: schedule.workspace_id,
              });
              if (number.error || !number.data) throw new Error("invoice_number_failed");
              const created = await supabaseAdmin
                .from("client_invoices")
                .insert({
                  workspace_id: schedule.workspace_id,
                  number: number.data,
                  description: schedule.description,
                  amount_cents: schedule.amount_cents,
                  subtotal_cents: schedule.amount_cents - schedule.service_fee_cents,
                  service_fee_percent: schedule.service_fee_percent,
                  service_fee_cents: schedule.service_fee_cents,
                  amount_paid_cents: 0,
                  currency: schedule.currency,
                  status: "unpaid",
                  payment_plan: "monthly_retainer",
                  billing_month: schedule.charge_at.slice(0, 7) + "-01",
                  issued_at: schedule.charge_at,
                  due_at: schedule.charge_at,
                  published_at: new Date().toISOString(),
                  checkout_payment_type: "remaining",
                })
                .select("id")
                .single();
              if (created.error || !created.data) throw new Error("invoice_create_failed");
              invoiceId = created.data.id;
              await supabaseAdmin
                .from("invoice_autopay_schedules")
                .update({ current_invoice_id: invoiceId })
                .eq("id", schedule.id);
            }
            const target = await supabaseAdmin
              .from("client_invoices")
              .select("amount_cents,amount_paid_cents,currency,workspace_id")
              .eq("id", invoiceId)
              .eq("workspace_id", schedule.workspace_id)
              .maybeSingle();
            if (target.error || !target.data) throw new Error("invoice_missing");
            const remaining = Math.max(
              0,
              (target.data.amount_cents ?? 0) - (target.data.amount_paid_cents ?? 0),
            );
            if (
              remaining !== schedule.amount_cents ||
              target.data.currency.toUpperCase() !== schedule.currency.toUpperCase()
            ) {
              throw new Error("invoice_balance_changed");
            }
            const intent = await stripeRequest<StripePaymentIntent>("/payment_intents", {
              body: {
                amount: schedule.amount_cents,
                currency: schedule.currency.toLowerCase(),
                customer: schedule.stripe_customer_id,
                payment_method: schedule.stripe_payment_method_id,
                confirm: true,
                off_session: true,
                description:
                  schedule.frequency === "monthly"
                    ? `Monthly retainer · ${schedule.description ?? "Dream Wave Media"}`
                    : schedule.description,
                metadata: {
                  autopay_schedule_id: schedule.id,
                  invoice_id: invoiceId,
                  workspace_id: schedule.workspace_id,
                  next_charge_at:
                    schedule.frequency === "monthly"
                      ? nextMonthlyChargeAt(schedule.charge_at, schedule.timezone)
                      : "",
                },
              },
              idempotencyKey: `autopay:${schedule.id}:${schedule.charge_at}`,
            });
            const needsClientAction = [
              "requires_action",
              "requires_payment_method",
              "canceled",
            ].includes(intent.status);
            await supabaseAdmin
              .from("invoice_autopay_schedules")
              .update({
                stripe_last_payment_intent_id: intent.id,
                ...(needsClientAction
                  ? { status: "action_required", last_error: `stripe_${intent.status}` }
                  : {}),
              })
              .eq("id", schedule.id);
            processed++;
          } catch (error) {
            await supabaseAdmin
              .from("invoice_autopay_schedules")
              .update({
                status: "action_required",
                last_error: error instanceof Error ? error.message.slice(0, 200) : "charge_failed",
              })
              .eq("id", schedule.id);
          }
        }
        return Response.json({ processed });
      },
    },
  },
});
