import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TEMPORARY_TAG = "temporary-post-upload";

/**
 * Removes camera-roll originals only after every Zernio destination confirms
 * success. Permanent Media Library uploads and external provider references
 * are never removed here.
 */
export async function cleanupConfirmedTemporaryMedia(contentItemId: string) {
  const [{ data: item, error: itemError }, { data: attempts, error: attemptsError }] =
    await Promise.all([
      supabaseAdmin
        .from("content_items")
        .select("id,media_asset_ids,metadata")
        .eq("id", contentItemId)
        .maybeSingle(),
      supabaseAdmin.from("publish_attempts").select("status").eq("content_item_id", contentItemId),
    ]);
  if (itemError || attemptsError) throw itemError ?? attemptsError;
  if (!item?.media_asset_ids?.length || !attempts?.length) return { deleted: 0 };
  if (attempts.some((attempt) => attempt.status !== "success")) return { deleted: 0 };

  const { data: assets, error: assetsError } = await supabaseAdmin
    .from("media_assets")
    .select("id,storage_path,source_provider,tags")
    .in("id", item.media_asset_ids);
  if (assetsError) throw assetsError;

  const deletedIds: string[] = [];
  for (const asset of assets ?? []) {
    if (
      asset.source_provider !== "waveos" ||
      !asset.storage_path ||
      !asset.tags.includes(TEMPORARY_TAG)
    ) {
      continue;
    }

    const { data: otherReference, error: referenceError } = await supabaseAdmin
      .from("content_items")
      .select("id")
      .contains("media_asset_ids", [asset.id])
      .neq("id", contentItemId)
      .in("status", ["draft", "approved", "scheduled", "publishing", "failed"])
      .limit(1)
      .maybeSingle();
    if (referenceError) throw referenceError;
    if (otherReference) continue;

    const { error: storageError } = await supabaseAdmin.storage
      .from("media")
      .remove([asset.storage_path]);
    if (storageError) {
      console.error("[temporary media cleanup] storage removal failed", storageError);
      continue;
    }

    const { error: archiveError } = await supabaseAdmin
      .from("media_assets")
      .update({
        archived_at: new Date().toISOString(),
        storage_path: null,
        size_bytes: 0,
        publishing_storage_path: null,
        publishing_url: null,
        publishing_url_created_at: null,
        publishing_url_expires_at: null,
        publishing_status: "expired",
      })
      .eq("id", asset.id);
    if (archiveError) throw archiveError;
    deletedIds.push(asset.id);
  }

  if (deletedIds.length) {
    const currentMetadata =
      item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
        ? item.metadata
        : {};
    await supabaseAdmin
      .from("content_items")
      .update({
        media_asset_ids: item.media_asset_ids.filter((id) => !deletedIds.includes(id)),
        metadata: {
          ...currentMetadata,
          temporary_media_deleted_at: new Date().toISOString(),
          temporary_media_deleted_count: deletedIds.length,
        },
      })
      .eq("id", contentItemId);
  }

  return { deleted: deletedIds.length };
}
