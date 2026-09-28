type AdminClient = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

type WebhookClaim = {
  source: string;
  eventType: string;
  externalId: string | null;
  payload: unknown;
};

/**
 * Claim a provider event atomically once the production migration is present.
 * The compatibility path preserves webhook processing while a managed backend
 * is still applying that migration.
 */
export async function claimWebhookEvent(supabaseAdmin: AdminClient, event: WebhookClaim) {
  const processedAt = new Date().toISOString();
  const claim = await supabaseAdmin.rpc("claim_webhook_event", {
    _source: event.source,
    _event_type: event.eventType,
    // The SQL argument accepts NULL; the generated types omit that nullability.
    _external_id: event.externalId as unknown as string,
    _payload: event.payload as never,
    _processed_at: processedAt,
  });
  if (!claim.error) return { claimed: Boolean(claim.data), error: null };

  // Lovable can deploy application code before its managed Supabase migration
  // is visible. The database RPC becomes the only path as soon as it exists.
  if (claim.error.code !== "PGRST202") return { claimed: false, error: claim.error };

  if (event.externalId) {
    const seen = await supabaseAdmin
      .from("webhook_events")
      .select("id")
      .eq("source", event.source)
      .eq("external_id", event.externalId)
      .maybeSingle();
    if (seen.error) return { claimed: false, error: seen.error };
    if (seen.data) return { claimed: false, error: null };
  }

  const inserted = await supabaseAdmin.from("webhook_events").insert({
    source: event.source,
    event_type: event.eventType,
    external_id: event.externalId,
    payload: event.payload as never,
    processed_at: processedAt,
  });
  if (inserted.error?.code === "23505") return { claimed: false, error: null };
  return { claimed: !inserted.error, error: inserted.error };
}
