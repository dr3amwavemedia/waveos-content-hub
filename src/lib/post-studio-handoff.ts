export type PostStudioSnapshot = {
  workspaceId: string; postId: string | null; title: string; caption: string; platforms: string[];
  pickedMedia: string[]; scheduledAt: string; activePlatform: string; platformOptions: Record<string, unknown>;
  sourceMedia: string | null;
};
export function attachStudioResult(snapshot: PostStudioSnapshot, mediaId: string): PostStudioSnapshot {
  const source = snapshot.sourceMedia;
  const pickedMedia = source && snapshot.pickedMedia.includes(source)
    ? snapshot.pickedMedia.map(id => id === source ? mediaId : id)
    : [...snapshot.pickedMedia.filter(id => id !== mediaId), mediaId];
  return { ...snapshot, pickedMedia };
}
