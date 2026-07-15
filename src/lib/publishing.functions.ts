import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * prepareMediaForPublishing
 *
 * Produces publishing-safe delivery URLs for a set of workspace-owned media
 * assets, so Ayrshare (or any other publisher) can retrieve them at scheduled
 * post time via a plain HTTPS request — no session, no dashboard route, no
 * localhost, and never a short-lived token that could expire before publish.
 *
 * Because the workspace policy blocks fully-public buckets, we mint long-lived
 * signed URLs (7 days) against the private `media` bucket and store both the
 * URL and its expiry. A separate scheduler job (Phase 3) MUST call this
 * function again for each asset shortly before the intended publish time to
 * ensure the URL is still valid; the function is idempotent and only refreshes
 * when needed.
 *
 * Security:
 * - Requires an authenticated session (requireSupabaseAuth).
 * - Verifies every asset belongs to the caller's active workspace via RLS
 *   (uses the request-scoped supabase client, not service role).
 * - Never returns storage credentials.
 * - Only exposes safe metadata + the delivery URL.
 * - Records publishing state on the asset row, so ownership of the publish
 *   copy is traceable.
 */
export const prepareMediaForPublishing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspace_id: z.string().uuid(),
        media_asset_ids: z.array(z.string().uuid()).min(1).max(20),
        intended_publish_time: z.string().datetime().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Verify workspace permission (RLS also enforces, but we short-circuit
    //    with a clean error).
    const { data: membership, error: memErr } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", data.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (memErr) throw new Error("workspace_lookup_failed");
    if (!membership) throw new Error("forbidden");

    // 2. Load requested assets scoped to this workspace only.
    const { data: assets, error: assetsErr } = await supabase
      .from("media_assets")
      .select(
        "id, workspace_id, storage_path, private_storage_path, publishing_url, publishing_url_expires_at, publishing_status, mime_type, file_size, filename, archived_at",
      )
      .in("id", data.media_asset_ids)
      .eq("workspace_id", data.workspace_id);

    if (assetsErr) throw new Error("asset_lookup_failed");
    if (!assets || assets.length !== data.media_asset_ids.length) {
      throw new Error("asset_workspace_mismatch");
    }

    // 3. Validate file constraints (guard rails; Ayrshare-safe defaults).
    const MAX_BYTES = 500 * 1024 * 1024;
    const ALLOWED = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime|webm))$/;
    for (const a of assets) {
      if (a.archived_at) throw new Error(`asset_archived:${a.id}`);
      if (a.file_size && a.file_size > MAX_BYTES) throw new Error(`asset_too_large:${a.id}`);
      if (a.mime_type && !ALLOWED.test(a.mime_type))
        throw new Error(`asset_unsupported_type:${a.id}`);
    }

    // 4. Determine which need a fresh URL. Idempotent: reuse if we still have
    //    ≥ 24h of TTL after the intended publish time (or from now).
    const target = data.intended_publish_time
      ? new Date(data.intended_publish_time).getTime()
      : Date.now();
    const SAFE_MS_AFTER = 24 * 60 * 60 * 1000;
    const SIGNED_TTL_SEC = 60 * 60 * 24 * 7; // 7 days (Supabase max per call)

    const results: Array<{
      id: string;
      publishing_url: string;
      expires_at: string;
      refreshed: boolean;
    }> = [];

    for (const a of assets) {
      const path = a.private_storage_path ?? a.storage_path;
      if (!path) throw new Error(`asset_missing_path:${a.id}`);

      const stillValid =
        a.publishing_url &&
        a.publishing_url_expires_at &&
        new Date(a.publishing_url_expires_at).getTime() > target + SAFE_MS_AFTER;

      if (stillValid) {
        results.push({
          id: a.id,
          publishing_url: a.publishing_url!,
          expires_at: a.publishing_url_expires_at!,
          refreshed: false,
        });
        continue;
      }

      const { data: signed, error: signErr } = await supabase.storage
        .from("media")
        .createSignedUrl(path, SIGNED_TTL_SEC);

      if (signErr || !signed?.signedUrl) {
        await supabase
          .from("media_assets")
          .update({ publishing_status: "failed", last_accessibility_check: new Date().toISOString() })
          .eq("id", a.id);
        throw new Error(`sign_url_failed:${a.id}`);
      }

      // 5. Verify the URL is actually retrievable without auth. We don't want
      //    to hand Ayrshare a URL that returns 403 five days from now.
      let accessible = false;
      try {
        const head = await fetch(signed.signedUrl, { method: "HEAD" });
        accessible = head.ok || head.status === 200 || head.status === 206;
      } catch {
        accessible = false;
      }

      const expiresAt = new Date(Date.now() + SIGNED_TTL_SEC * 1000).toISOString();

      await supabase
        .from("media_assets")
        .update({
          publishing_storage_path: path,
          publishing_url: signed.signedUrl,
          publishing_url_created_at: new Date().toISOString(),
          publishing_url_expires_at: expiresAt,
          publishing_status: accessible ? "ready" : "failed",
          last_accessibility_check: new Date().toISOString(),
        })
        .eq("id", a.id);

      if (!accessible) throw new Error(`asset_not_publicly_retrievable:${a.id}`);

      results.push({
        id: a.id,
        publishing_url: signed.signedUrl,
        expires_at: expiresAt,
        refreshed: true,
      });
    }

    // 6. Return safe summaries. NEVER include storage credentials, raw paths,
    //    or user PII beyond what belongs in the publishing pipeline.
    return {
      workspace_id: data.workspace_id,
      assets: results.map((r) => {
        const a = assets.find((x) => x.id === r.id)!;
        return {
          id: r.id,
          publishing_url: r.publishing_url,
          expires_at: r.expires_at,
          refreshed: r.refreshed,
          mime_type: a.mime_type,
          filename: a.filename,
        };
      }),
    };
  });
