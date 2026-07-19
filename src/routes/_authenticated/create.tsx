import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  CalendarClock,
  Check,
  FileText,
  ImagePlus,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { publishContentItem } from "@/lib/publish.functions";

import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/app/empty-state";
import { useWorkspace } from "@/components/app/workspace-context";
import { getSignedMediaUrl, useMediaAssets } from "@/hooks/use-media";
import type { MediaAsset } from "@/hooks/use-media";
import {
  ALL_PLATFORMS,
  PLATFORM_LABEL,
  useContentItem,
  useCreateContentItem,
  useDeleteContentItem,
  useUpdateContentItem,
  useUpdateVariant,
  type PostVariant,
  type SocialPlatform,
} from "@/hooks/use-content";
import { PenSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/create")({
  component: CreatePost,
  validateSearch: (s: Record<string, unknown>) => ({
    id: typeof s.id === "string" ? s.id : undefined,
  }),
  head: () => ({ meta: [{ title: "Create Post — WaveOS" }, { name: "robots", content: "noindex" }] }),
});

function CreatePost() {
  const { activeWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const qc = useQueryClient();

  const workspaceId = activeWorkspace?.id ?? null;
  const [savedId, setSavedId] = useState<string | null>(search.id ?? null);
  const existing = useContentItem(search.id ?? savedId ?? null);
  const create = useCreateContentItem(workspaceId);
  const update = useUpdateContentItem();
  const updateVariant = useUpdateVariant();
  const del = useDeleteContentItem();
  const submit = useSubmitForApproval();

  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(["instagram"]);
  const [pickedMedia, setPickedMedia] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [activePlatform, setActivePlatform] = useState<SocialPlatform>("instagram");
  const [showLibrary, setShowLibrary] = useState(false);

  const draftStorageKey = workspaceId ? `waveos-create-draft-${workspaceId}` : null;

  useEffect(() => {
    if (!draftStorageKey || savedId) return;

    const storedDraft = window.localStorage.getItem(draftStorageKey);

    if (!storedDraft) return;

    try {
      const parsed = JSON.parse(storedDraft);

      if (typeof parsed.title === "string") {
        setTitle(parsed.title);
      }

      if (typeof parsed.caption === "string") {
        setCaption(parsed.caption);
      }

      if (Array.isArray(parsed.platforms)) {
        const validPlatforms = parsed.platforms.filter(
          (platform: unknown): platform is SocialPlatform =>
            typeof platform === "string" && ALL_PLATFORMS.includes(platform as SocialPlatform),
        );

        if (validPlatforms.length > 0) {
          setPlatforms(validPlatforms);
          setActivePlatform(validPlatforms[0]);
        }
      }

      if (Array.isArray(parsed.pickedMedia)) {
        setPickedMedia(parsed.pickedMedia.filter((mediaId: unknown): mediaId is string => typeof mediaId === "string"));
      }

      if (typeof parsed.scheduledAt === "string") {
        setScheduledAt(parsed.scheduledAt);
      }
    } catch {
      window.localStorage.removeItem(draftStorageKey);
    }
  }, [draftStorageKey, savedId]);
  useEffect(() => {
    if (!draftStorageKey || savedId) return;

    const timeout = window.setTimeout(() => {
      const hasDraftContent =
        title.trim().length > 0 || caption.trim().length > 0 || pickedMedia.length > 0 || scheduledAt.length > 0;

      if (!hasDraftContent) {
        window.localStorage.removeItem(draftStorageKey);
        return;
      }

      window.localStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          title,
          caption,
          platforms,
          pickedMedia,
          scheduledAt,
        }),
      );
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [draftStorageKey, savedId, title, caption, platforms, pickedMedia, scheduledAt]);
  useEffect(() => {
    if (!existing.data?.item) return;
    const it = existing.data.item;
    setTitle(it.title ?? "");
    setCaption(it.primary_caption ?? "");
    setPickedMedia(it.media_asset_ids ?? []);
    setScheduledAt(it.scheduled_at ? it.scheduled_at.slice(0, 16) : "");
    const vp = existing.data.variants.map((v) => v.platform);
    if (vp.length) {
      setPlatforms(vp);
      setActivePlatform(vp[0]);
    }
    setSavedId(it.id);
  }, [existing.data?.item?.id]);

  const publishFn = useServerFn(publishContentItem);

  const [publishing, setPublishing] = useState<null | "now" | "schedule">(null);

  const status = existing.data?.item?.status ?? "draft";
  const locked = status === "published" || status === "publishing";

  if (!activeWorkspace) {
    return (
      <EmptyState
        icon={PenSquare}
        title="No workspace selected"
        body="Ask Dream Wave Media to add you to a workspace to start creating posts."
      />
    );
  }

  async function ensureSaved(): Promise<string | null> {
    if (!workspaceId) return null;
    if (savedId) {
      await update.mutateAsync({
        id: savedId,
        patch: {
          title: title || null,
          primary_caption: caption || null,
          media_asset_ids: pickedMedia,
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        },
      });
      return savedId;
    }
    const item = await create.mutateAsync({
      title,
      primary_caption: caption,
      media_asset_ids: pickedMedia,
      platforms,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    });
    setSavedId(item.id);
    return item.id;
  }

  async function handleSaveDraft() {
    if (!workspaceId) return;

    try {
      const wasNewDraft = !savedId;
      const id = await ensureSaved();

      if (!id) return;

      if (wasNewDraft) {
        navigate({
          to: "/create",
          search: { id },
          replace: true,
        });
      }

      await qc.invalidateQueries({
        queryKey: ["content-item", id],
      });

      if (draftStorageKey) {
        window.localStorage.removeItem(draftStorageKey);
      }
      toast.success("Draft saved. You can now edit each platform caption.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleScheduleLater() {
    if (!workspaceId) return;
    if (!caption.trim()) return toast.error("Add a caption before scheduling");
    if (!platforms.length) return toast.error("Pick at least one platform");
    if (!scheduledAt) return toast.error("Choose a publish date and time");
    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 60_000) {
      return toast.error("Schedule time must be in the future");
    }
    setPublishing("schedule");
    try {
      const id = await ensureSaved();
      if (!id) return;
      await update.mutateAsync({
        id,
        patch: { status: "scheduled", scheduled_at: when.toISOString() },
      });
      qc.invalidateQueries({ queryKey: ["content-items"] });
      toast.success(`Scheduled for ${when.toLocaleString()}`);
      navigate({ to: "/calendar" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPublishing(null);
    }
  }

  async function handlePublishNow() {
    if (!workspaceId) return;
    if (!caption.trim()) return toast.error("Add a caption before publishing");
    if (!platforms.length) return toast.error("Pick at least one platform");
    if (!confirm("Publish this post to the selected channels right now?")) return;
    setPublishing("now");
    try {
      const id = await ensureSaved();
      if (!id) return;
      // Self-service: mark approved so the publisher accepts it.
      await update.mutateAsync({
        id,
        patch: { status: "approved", scheduled_at: null },
      });
      const res = await publishFn({ data: { contentId: id } });
      qc.invalidateQueries({ queryKey: ["content-items"] });
      qc.invalidateQueries({ queryKey: ["content-item", id] });
      if (res.failed === 0) toast.success(`Published to ${res.success} channel${res.success === 1 ? "" : "s"}`);
      else toast.warning(`Published to ${res.success}, ${res.failed} failed — see Content for details`);
      navigate({ to: "/content" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPublishing(null);
    }
  }

  async function handleDelete() {
    if (!savedId) {
      navigate({ to: "/content" });
      return;
    }
    if (!confirm("Delete this draft?")) return;
    await del.mutateAsync(savedId);
    toast.success("Draft deleted");
    navigate({ to: "/content" });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate({ to: "/content" })}
            className="rounded-lg border border-border bg-elevated p-2 text-muted-foreground hover:text-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-foreground">{savedId ? "Edit post" : "Create post"}</h1>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              {activeWorkspace.name} · Status: {status.replace("_", " ")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {savedId && (
            <button
              onClick={handleDelete}
              className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}
          <button
            disabled={locked || create.isPending || update.isPending || publishing !== null}
            onClick={handleSaveDraft}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-elevated px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
          >
            {(create.isPending || update.isPending) && publishing === null ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Save draft
          </button>
          <button
            disabled={locked || publishing !== null || !caption.trim() || !scheduledAt}
            onClick={handleScheduleLater}
            className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            {publishing === "schedule" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CalendarClock className="h-4 w-4" />
            )}
            Schedule later
          </button>
          <button
            disabled={locked || publishing !== null || !caption.trim() || !platforms.length}
            onClick={handlePublishNow}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
          >
            {publishing === "now" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Publish now
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <div className="surface-card space-y-4 p-5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Internal title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Launch day carousel"
              className="w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
            />

            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Primary caption
            </label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={5}
              placeholder="Write the base caption. You can tailor per platform below."
              className="w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{caption.length} chars</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-1 text-primary">
                <Sparkles className="h-3 w-3" /> Wave Assistant coming soon
              </span>
            </div>
          </div>

          <div className="surface-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-foreground">Media</div>
                <div className="text-xs text-muted-foreground">
                  Choose from your library. Same media applies to all platforms.
                </div>
              </div>
              <button
                onClick={() => setShowLibrary(true)}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-elevated px-3 py-2 text-xs font-medium hover:bg-surface-2"
              >
                <ImagePlus className="h-4 w-4" /> Pick media
              </button>
            </div>
            <MediaPreviewRow
              workspaceId={workspaceId}
              picked={pickedMedia}
              onRemove={(id) => setPickedMedia((cur) => cur.filter((x) => x !== id))}
            />
          </div>

          <div className="surface-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">Per-platform captions</div>
                <div className="text-xs text-muted-foreground">
                  Edit each caption independently. Confirmation appears before an overwrite.
                </div>
              </div>
            </div>
            <PlatformTabs
              platforms={platforms}
              active={activePlatform}
              onActive={setActivePlatform}
              onTogglePlatform={(p) => {
                setPlatforms((current) => {
                  const isEnabled = current.includes(p);

                  const nextPlatforms = isEnabled ? current.filter((platform) => platform !== p) : [...current, p];

                  if (activePlatform === p && isEnabled) {
                    setActivePlatform(nextPlatforms[0] ?? "instagram");
                  }

                  if (!isEnabled) {
                    setActivePlatform(p);
                  }

                  return nextPlatforms;
                });
              }}
              locked={locked}
            />
            <div className="mt-4">
              <VariantEditor
                contentId={savedId}
                variants={existing.data?.variants ?? []}
                platform={activePlatform}
                primaryCaption={caption}
                locked={locked}
                onUpdate={async (id, patch) => {
                  await updateVariant.mutateAsync({ id, patch });
                }}
              />
              {!savedId && (
                <p className="mt-3 rounded-lg border border-dashed border-border bg-elevated/40 p-3 text-xs text-muted-foreground">
                  Per-platform captions become editable after you save the draft.
                </p>
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="surface-card space-y-3 p-5">
            <div className="text-sm font-semibold text-foreground">Schedule</div>
            <label className="block text-xs uppercase tracking-wider text-muted-foreground">
              Publish at ({activeWorkspace.timezone})
            </label>
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">Leave empty to publish immediately after approval.</p>
          </div>

          <div className="surface-card space-y-3 p-5">
            <div className="text-sm font-semibold text-foreground">Publishing checklist</div>
            <CheckRow line={caption.trim().length > 0} label="Caption written" />
            <CheckRow line={pickedMedia.length > 0} label="Media attached" />
            <CheckRow line={platforms.length > 0} label="Platform selected" />
            <CheckRow line={!!savedId} label="Draft saved" />
          </div>
        </aside>
      </div>

      {showLibrary && (
        <MediaPicker
          workspaceId={workspaceId!}
          picked={pickedMedia}
          onClose={() => setShowLibrary(false)}
          onConfirm={(ids) => {
            setPickedMedia(ids);
            setShowLibrary(false);
          }}
        />
      )}
    </div>
  );
}

function CheckRow({ line, label }: { line: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-full border",
          line ? "border-primary bg-primary/20 text-primary" : "border-border text-muted-foreground",
        )}
      >
        {line ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />}
      </span>
      <span className={cn(line ? "text-foreground" : "text-muted-foreground")}>{label}</span>
    </div>
  );
}

function PlatformTabs({
  platforms,
  active,
  onActive,
  onTogglePlatform,
  locked,
}: {
  platforms: SocialPlatform[];
  active: SocialPlatform;
  onActive: (p: SocialPlatform) => void;
  onTogglePlatform: (p: SocialPlatform) => void;
  locked: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {ALL_PLATFORMS.map((p) => {
          const enabled = platforms.includes(p);
          return (
            <button
              key={p}
              disabled={locked}
              onClick={() => onTogglePlatform(p)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                enabled
                  ? "border-primary/40 bg-primary/15 text-foreground"
                  : "border-border bg-elevated text-muted-foreground hover:text-foreground",
              )}
            >
              {PLATFORM_LABEL[p]}
            </button>
          );
        })}
      </div>
      {platforms.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          {platforms.map((p) => (
            <button
              key={p}
              onClick={() => onActive(p)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors",
                active === p ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {PLATFORM_LABEL[p]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function VariantEditor({
  contentId,
  variants,
  platform,
  primaryCaption,
  locked,
  onUpdate,
}: {
  contentId: string | null;
  variants: PostVariant[];
  platform: SocialPlatform;
  primaryCaption: string;
  locked: boolean;
  onUpdate: (id: string, patch: Partial<PostVariant>) => Promise<void>;
}) {
  const variant = variants.find((v) => v.platform === platform);
  const [text, setText] = useState(variant?.caption ?? "");

  useEffect(() => {
    setText(variant?.caption ?? "");
  }, [variant?.id]);

  if (!contentId) {
    return (
      <textarea
        disabled
        placeholder={`${PLATFORM_LABEL[platform]} caption — save draft to edit`}
        className="w-full rounded-lg border border-border bg-elevated/30 px-3 py-2 text-sm text-muted-foreground"
        rows={5}
      />
    );
  }

  if (!variant) {
    return <p className="text-xs text-muted-foreground">This platform is not enabled.</p>;
  }

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={locked}
        rows={6}
        className="w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
      />
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{text.length} chars</span>
        <div className="flex items-center gap-2">
          <button
            disabled={locked}
            onClick={() => {
              if (variant.caption.trim() && variant.caption !== primaryCaption) {
                if (!confirm("Overwrite this platform's caption with the primary caption?")) return;
              }
              setText(primaryCaption);
              void onUpdate(variant.id, { caption: primaryCaption });
            }}
            className="rounded-md border border-border bg-elevated px-3 py-1.5 text-xs hover:bg-surface-2"
          >
            Use primary
          </button>
          <button
            disabled={locked || text === variant.caption}
            onClick={() => onUpdate(variant.id, { caption: text })}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
          >
            Save caption
          </button>
        </div>
      </div>
    </div>
  );
}

function MediaPreviewRow({
  workspaceId,
  picked,
  onRemove,
}: {
  workspaceId: string | null;
  picked: string[];
  onRemove: (id: string) => void;
}) {
  const assets = useMediaAssets(workspaceId, {});
  const map = useMemo(() => {
    const m = new Map<string, MediaAsset>();
    (assets.data ?? []).forEach((a) => m.set(a.id, a));
    return m;
  }, [assets.data]);

  if (!picked.length) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-elevated/30 p-6 text-center text-sm text-muted-foreground">
        No media selected yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
      {picked.map((id) => {
        const a = map.get(id);
        return <MediaThumb key={id} asset={a} onRemove={() => onRemove(id)} />;
      })}
    </div>
  );
}

function MediaThumb({ asset, onRemove }: { asset?: MediaAsset; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!asset) return;
    void getSignedMediaUrl(asset.storage_path, 600).then(setUrl);
  }, [asset?.id]);
  if (!asset) return <div className="aspect-square rounded-lg border border-border bg-elevated" />;
  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-elevated">
      {url && asset.mime_type.startsWith("image/") ? (
        <img src={url} alt={asset.name} className="h-full w-full object-cover" loading="lazy" />
      ) : url && asset.mime_type.startsWith("video/") ? (
        <video src={url} className="h-full w-full object-cover" muted />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">{asset.name}</div>
      )}
      <button
        onClick={onRemove}
        className="absolute right-1 top-1 rounded-full bg-background/80 p-1 text-foreground opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
        aria-label="Remove"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function MediaPicker({
  workspaceId,
  picked,
  onClose,
  onConfirm,
}: {
  workspaceId: string;
  picked: string[];
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>(picked);
  const [search, setSearch] = useState("");
  const assets = useMediaAssets(workspaceId, { search: search || undefined });
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const items = assets.data ?? [];
      const entries = await Promise.all(
        items.map(async (a) => [a.id, await getSignedMediaUrl(a.storage_path, 600)] as const),
      );
      setUrls(Object.fromEntries(entries));
    })();
  }, [assets.data]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur">
      <div className="surface-card w-full max-w-4xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <div className="text-base font-semibold text-foreground">Pick from library</div>
            <div className="text-xs text-muted-foreground">{selected.length} selected</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="border-b border-border p-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or tag"
            className="w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm outline-none focus:border-primary/60"
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {assets.isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (assets.data ?? []).length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No media yet. Upload some in the Content library.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {(assets.data ?? []).map((a) => {
                const isSel = selected.includes(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => setSelected((s) => (isSel ? s.filter((x) => x !== a.id) : [...s, a.id]))}
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-lg border bg-elevated",
                      isSel ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/40",
                    )}
                  >
                    {urls[a.id] && a.mime_type.startsWith("image/") ? (
                      <img src={urls[a.id]} alt={a.name} className="h-full w-full object-cover" loading="lazy" />
                    ) : urls[a.id] && a.mime_type.startsWith("video/") ? (
                      <video src={urls[a.id]} className="h-full w-full object-cover" muted />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center p-2 text-center text-[10px] text-muted-foreground">
                        {a.name}
                      </div>
                    )}
                    {isSel && (
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border p-4">
          <button onClick={onClose} className="rounded-full border border-border px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selected)}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Use {selected.length} item{selected.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}
