import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Public, token-gated logo URL resolver for the Vision Studio public route.
// Verifies the share token maps to a live, ready deck AND that the requested
// storage path is actually referenced by that deck's branding, then returns
// a short-lived signed URL from the vision-deck-assets bucket.
export const Route = createFileRoute("/api/public/vision-asset")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token") ?? "";
        const path = url.searchParams.get("path") ?? "";
        if (!/^[a-f0-9]{64}$/i.test(token) || !path || path.length > 512) {
          return new Response(JSON.stringify({ error: "invalid" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const supabaseUrl = process.env.SUPABASE_URL!;
        const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const anon = createClient(supabaseUrl, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });

        const { data: deckRows, error: deckError } = await anon.rpc(
          "get_public_vision_deck",
          { _share_token: token },
        );
        if (deckError || !deckRows || deckRows.length === 0) {
          return new Response(JSON.stringify({ error: "not_found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        const deck = deckRows[0] as { content: unknown };
        const branding = (deck.content as { branding?: { companyLogo?: { storagePath?: string } } })
          ?.branding?.companyLogo;
        if (!branding || branding.storagePath !== path) {
          return new Response(JSON.stringify({ error: "not_referenced" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: signed, error: signError } = await supabaseAdmin.storage
          .from("vision-deck-assets")
          .createSignedUrl(path, 3600);
        if (signError || !signed?.signedUrl) {
          return new Response(JSON.stringify({ error: "sign_failed" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ url: signed.signedUrl }), {
          headers: { "content-type": "application/json", "cache-control": "private, max-age=300" },
        });
      },
    },
  },
});
