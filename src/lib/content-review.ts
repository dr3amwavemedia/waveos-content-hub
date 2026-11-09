export function canManageContentReview(globalRoles: string[], workspaceRole: string | null) {
  return globalRoles.includes("dream_wave_owner") || workspaceRole === "owner" || workspaceRole === "admin";
}

export function reviewItemPatch(input: { title: string; caption: string; mediaIds: string[]; scheduledAt: string | null }, metadata: Record<string, unknown>, actor: string, now: string) {
  const request = metadata.approval_request && typeof metadata.approval_request === "object" ? metadata.approval_request : {};
  return {
    title: input.title || null,
    primary_caption: input.caption || null,
    media_asset_ids: [...input.mediaIds],
    scheduled_at: input.scheduledAt,
    metadata: { ...metadata, approval_request: { ...request, action: input.scheduledAt ? "schedule" : "publish_now" }, review_edit: { edited_by: actor, edited_at: now } },
  };
}

export function orderedPostMedia<T extends { id: string }>(ids: string[], assets: T[]): T[] {
  const byId = new Map(assets.map(asset => [asset.id, asset]));
  return ids.map(id => {
    const asset = byId.get(id);
    if (!asset) throw new Error("One or more selected media files are unavailable.");
    return asset;
  });
}

export function reviewVariantCaption(primary: string, previous: string | null, variant: string, explicit?: string) {
  return explicit ?? (variant === (previous ?? "") ? primary : variant);
}