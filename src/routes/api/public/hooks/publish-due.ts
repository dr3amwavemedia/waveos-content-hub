import { timingSafeEqual } from "crypto";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/publish-due")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) return new Response("cron_not_configured", { status: 503 });
        const provided =
          request.headers.get("x-cron-secret") ??
          (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        const suppliedBuffer = Buffer.from(provided, "utf8");
        const expectedBuffer = Buffer.from(cronSecret, "utf8");
        if (
          suppliedBuffer.length !== expectedBuffer.length ||
          !timingSafeEqual(suppliedBuffer, expectedBuffer)
        ) {
          return new Response("unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: due, error } = await supabaseAdmin
          .from("content_items")
          .select("id")
          .in("status", ["approved", "scheduled"])
          .lte("scheduled_at", new Date().toISOString())
          .limit(20);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        const { publishContentItemWithZernio } = await import("@/lib/zernio-publish.server");
        let processed = 0;
        let failed = 0;
        for (const item of due ?? []) {
          try {
            await publishContentItemWithZernio(item.id);
            processed += 1;
          } catch (reason) {
            failed += 1;
            console.error("Scheduled Zernio publish failed", {
              contentId: item.id,
              message: reason instanceof Error ? reason.message : "Unknown error",
            });
          }
        }
        let maintenance: unknown = null;
        try {
          const maintenanceUrl = new URL(
            "/api/public/hooks/maintain-social-operations",
            request.url,
          );
          const response = await fetch(maintenanceUrl, {
            method: "POST",
            headers: { "x-cron-secret": cronSecret },
          });
          maintenance = response.ok ? await response.json() : { error: `HTTP ${response.status}` };
        } catch (error) {
          maintenance = { error: error instanceof Error ? error.message : "maintenance_failed" };
        }
        return Response.json({ processed, failed, maintenance });
      },
    },
  },
});
