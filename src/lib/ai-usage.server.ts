type ProviderUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
};

export async function recordAiUsage(input: {
  workspaceId: string;
  userId: string;
  feature: string;
  model: string;
  durationMs: number;
  status: "succeeded" | "provider_error" | "invalid_response";
  usage?: ProviderUsage | null;
  safeErrorCode?: string | null;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const usage = input.usage ?? {};
    await (
      supabaseAdmin as unknown as {
        from: (table: string) => {
          insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
        };
      }
    )
      .from("ai_usage_events")
      .insert({
        workspace_id: input.workspaceId,
        user_id: input.userId,
        feature: input.feature,
        provider: "lovable_gateway",
        model: input.model,
        input_tokens: usage.prompt_tokens ?? usage.input_tokens ?? null,
        output_tokens: usage.completion_tokens ?? usage.output_tokens ?? null,
        estimated_cost_micros: null,
        duration_ms: Math.max(0, Math.round(input.durationMs)),
        status: input.status,
        safe_error_code: input.safeErrorCode ?? null,
      });
  } catch (error) {
    // Telemetry must never turn a successful customer action into a failure.
    console.warn(
      "AI usage telemetry unavailable",
      error instanceof Error ? error.message : "unknown",
    );
  }
}
