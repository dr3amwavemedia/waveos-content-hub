import { RequireFeature } from "@/components/app/require-feature";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Folder, FolderPlus, Images, Loader2, Search, Tag, Trash2, Upload, Video, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { useWorkspace } from "@/components/app/workspace-context";
import { EmptyState } from "@/components/app/empty-state";
import {
  getSignedMediaUrl,
  useCreateFolder,
  useDeleteAsset,
  useMediaAssets,
  useMediaFolders,
  useUpdateAssetTags,
  useUploadAsset,
  type MediaAsset,
} from "@/hooks/use-media";

export const Route = createFileRoute("/_authenticated/content")({
  component: () => (
    <RequireFeature feature="can_view_media_library" title="Content library isn't included in your plan">
      <ContentLibrary />
    </RequireFeature>
  ),
  head: () => ({ meta: [{ title: "Content — WaveOS" }] }),
});

type FolderFilter = "all" | "root" | string;

function ContentLibrary() {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;

  const [folderFilter, setFolderFilter] = useState<FolderFilter>("all");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | "image" | "video">("all");
  const [tag, setTag] = useState<string | null>(null);
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);

  const foldersQ = useMediaFolders(workspaceId);
  const assetsQ = useMediaAssets(workspaceId, {
    folderId: folderFilter === "all" ? undefined : folderFilter === "root" ? null : folderFilter,
    search: search || undefined,
    tag,
    kind,
  });
  const createFolder = useCreateFolder(workspaceId);
  const upload = useUploadAsset(workspaceId);
  const del = useDeleteAsset(workspaceId);
  const updateTags = useUpdateAssetTags(workspaceId);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    (assetsQ.data ?? []).forEach((a) => a.tags.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [assetsQ.data]);

  if (!activeWorkspace) {
    return (
      <div className="space-y-6">
        <Header title="Content library" />
        <EmptyState
          icon={Images}
          title="No workspace yet"
          body="Create your Brand Workspace to start uploading photos and videos."
          action={{ label: "Create workspace", to: "/onboarding" }}
        />
      </div>
    );
  }

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const folderId = folderFilter === "all" || folderFilter === "root" ? null : folderFilter;
    let ok = 0;
    for (const file of Array.from(files)) {
      try {
        await upload.mutateAsync({ file, folderId, tags: [] });
        ok++;
      } catch (e) {
        toast.error(`Failed: ${file.name}`);
      }
    }
    if (ok) toast.success(`Uploaded ${ok} file${ok === 1 ? "" : "s"}.`);
  }

  return (
    <div className="space-y-6">
      <Header title="Content library">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewFolder(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2 text-sm font-medium text-foreground hover:bg-elevated"
          >
            <FolderPlus className="h-4 w-4" /> New folder
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110">
            {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload
            <input
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.currentTarget.value = "";
              }}
              ref={(el) => {
                fileInputRef.current = el;
              }}
            />
          </label>
        </div>
      </Header>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Folder sidebar */}
        <aside className="surface-card p-3">
          <FolderRow
            active={folderFilter === "all"}
            onClick={() => setFolderFilter("all")}
            label="All media"
            icon={Images}
          />
          <FolderRow
            active={folderFilter === "root"}
            onClick={() => setFolderFilter("root")}
            label="Uncategorized"
            icon={Folder}
          />
          <div className="my-2 h-px bg-border" />
          {(foldersQ.data ?? []).map((f) => (
            <FolderRow
              key={f.id}
              active={folderFilter === f.id}
              onClick={() => setFolderFilter(f.id)}
              label={f.name}
              icon={Folder}
            />
          ))}
          {(foldersQ.data ?? []).length === 0 && (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No folders yet. Create one to keep assets organized.
            </p>
          )}
        </aside>

        {/* Main */}
        <div className="space-y-4">
          {/* Filters */}
          <div className="surface-card flex flex-wrap items-center gap-2 p-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by filename…"
                className="w-full rounded-lg border border-input bg-surface/60 py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
            <SegmentedFilter
              value={kind}
              onChange={(v) => setKind(v as typeof kind)}
              options={[
                { value: "all", label: "All" },
                { value: "image", label: "Photos" },
                { value: "video", label: "Videos" },
              ]}
            />
            {allTags.length > 0 && (
              <select
                value={tag ?? ""}
                onChange={(e) => setTag(e.target.value || null)}
                className="rounded-lg border border-input bg-surface/60 px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="">All tags</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Grid */}
          <DropZone
            onDrop={handleFiles}
            busy={upload.isPending}
            empty={(assetsQ.data ?? []).length === 0 && !assetsQ.isLoading}
          >
            {assetsQ.isLoading ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (assetsQ.data ?? []).length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <Upload className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-base font-semibold text-foreground">Drop photos or videos here</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Or use the Upload button above. Images and videos up to your plan limit.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {(assetsQ.data ?? []).map((asset) => (
                  <AssetCard key={asset.id} asset={asset} onClick={() => setSelected(asset)} />
                ))}
              </div>
            )}
          </DropZone>
        </div>
      </div>

      {showNewFolder && (
        <NewFolderModal
          onClose={() => setShowNewFolder(false)}
          onSubmit={async (name) => {
            try {
              await createFolder.mutateAsync({ name, parentId: null });
              toast.success("Folder created.");
              setShowNewFolder(false);
            } catch (e) {
              toast.error("Couldn't create folder.");
            }
          }}
          busy={createFolder.isPending}
        />
      )}

      {selected && (
        <AssetPreview
          asset={selected}
          folders={foldersQ.data ?? []}
          onClose={() => setSelected(null)}
          onDelete={async () => {
            if (!confirm(`Delete ${selected.name}?`)) return;
            try {
              await del.mutateAsync(selected);
              toast.success("Deleted.");
              setSelected(null);
            } catch (e) {
              toast.error("Couldn't delete.");
            }
          }}
          onSave={async (tags, folderId) => {
            await updateTags.mutateAsync({ id: selected.id, tags, folderId });
            toast.success("Saved.");
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

function Header({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Content</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every photo and video in your brand's world.</p>
      </div>
      {children}
    </header>
  );
}

function FolderRow({
  active,
  onClick,
  label,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: typeof Folder;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors",
        active
          ? "bg-primary/12 text-foreground ring-1 ring-inset ring-primary/30"
          : "text-muted-foreground hover:bg-elevated hover:text-foreground",
      )}
    >
      <Icon className={cn("h-4 w-4", active ? "text-primary" : "")} />
      <span className="truncate">{label}</span>
    </button>
  );
}

function SegmentedFilter({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-border bg-surface/60">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "px-3 py-2 text-xs font-medium transition-colors",
            value === o.value ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DropZone({
  children,
  onDrop,
  busy,
  empty,
}: {
  children: React.ReactNode;
  onDrop: (files: FileList) => void;
  busy: boolean;
  empty: boolean;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDrop(e.dataTransfer.files);
      }}
      className={cn(
        "surface-card relative p-4 transition-all",
        over && "ring-2 ring-primary/60",
        empty && "border-dashed",
      )}
    >
      {busy && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden rounded-t-2xl">
          <div className="h-full w-1/3 animate-pulse bg-primary" />
        </div>
      )}
      {children}
    </div>
  );
}

function AssetCard({ asset, onClick }: { asset: MediaAsset; onClick: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const started = useRef(false);
  if (!started.current) {
    started.current = true;
    getSignedMediaUrl(asset.storage_path, 3600)
      .then(setUrl)
      .catch(() => setUrl(null));
  }
  const isVideo = asset.mime_type.startsWith("video/");
  return (
    <button
      onClick={onClick}
      className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-elevated text-left transition-all hover:border-border-strong hover:shadow-[var(--shadow-glow)]"
    >
      {url ? (
        isVideo ? (
          <video src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
        ) : (
          <img src={url} alt={asset.name} className="h-full w-full object-cover" />
        )
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-6 text-[11px] text-white">
        {isVideo && <Video className="h-3 w-3" />}
        <span className="truncate">{asset.name}</span>
      </div>
      {asset.tags.length > 0 && (
        <div className="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
          {asset.tags.slice(0, 2).map((t) => (
            <span
              key={t}
              className="rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function NewFolderModal({
  onClose,
  onSubmit,
  busy,
}: {
  onClose: () => void;
  onSubmit: (name: string) => void;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  return (
    <ModalShell onClose={onClose} title="New folder">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name.trim());
        }}
        className="space-y-4"
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Reels, Testimonials, Product photos"
          className="w-full rounded-lg border border-input bg-surface/60 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-surface/60 px-3 py-2 text-sm text-foreground hover:bg-elevated"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Create
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function AssetPreview({
  asset,
  folders,
  onClose,
  onDelete,
  onSave,
}: {
  asset: MediaAsset;
  folders: { id: string; name: string }[];
  onClose: () => void;
  onDelete: () => void;
  onSave: (tags: string[], folderId: string | null) => Promise<void>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>(asset.tags);
  const [tagInput, setTagInput] = useState("");
  const [folderId, setFolderId] = useState<string | null>(asset.folder_id);
  const [saving, setSaving] = useState(false);
  const started = useRef(false);
  if (!started.current) {
    started.current = true;
    getSignedMediaUrl(asset.storage_path, 3600)
      .then(setUrl)
      .catch(() => setUrl(null));
  }
  const isVideo = asset.mime_type.startsWith("video/");

  function addTag() {
    const t = tagInput.trim().toLowerCase();
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]);
    setTagInput("");
  }

  return (
    <ModalShell onClose={onClose} title={asset.name} wide>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex items-center justify-center rounded-xl bg-black/60 p-2">
          {url ? (
            isVideo ? (
              <video src={url} className="max-h-[60vh] w-full rounded-lg object-contain" controls />
            ) : (
              <img src={url} alt={asset.name} className="max-h-[60vh] w-full rounded-lg object-contain" />
            )
          ) : (
            <div className="flex h-64 w-full items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <MetaRow label="Type" value={asset.mime_type} />
          <MetaRow label="Size" value={formatBytes(asset.size_bytes)} />
          {asset.width && asset.height && <MetaRow label="Dimensions" value={`${asset.width}×${asset.height}`} />}
          {asset.duration_seconds != null && (
            <MetaRow label="Duration" value={`${asset.duration_seconds.toFixed(1)}s`} />
          )}
          <MetaRow label="Uploaded" value={new Date(asset.created_at).toLocaleString()} />

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Folder</label>
            <select
              value={folderId ?? ""}
              onChange={(e) => setFolderId(e.target.value || null)}
              className="w-full rounded-lg border border-input bg-surface/60 px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="">Uncategorized</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Tags</label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-md bg-primary/12 px-2 py-0.5 text-xs text-foreground ring-1 ring-primary/25"
                >
                  <Tag className="h-3 w-3" />
                  {t}
                  <button
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                    className="ml-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add tag…"
                className="flex-1 rounded-lg border border-input bg-surface/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              <button
                onClick={addTag}
                type="button"
                className="rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs text-foreground hover:bg-elevated"
              >
                Add
              </button>
            </div>
          </div>

          <div className="flex justify-between gap-2 pt-2">
            <button
              onClick={onDelete}
              className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive hover:bg-destructive/20"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
            <button
              onClick={async () => {
                setSaving(true);
                try {
                  await onSave(tags, folderId);
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 pb-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function ModalShell({
  children,
  onClose,
  title,
  wide,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8" role="dialog">
      <div className="absolute inset-0 bg-background/70 backdrop-blur" onClick={onClose} />
      <div className={cn("surface-card relative w-full overflow-hidden p-6", wide ? "max-w-4xl" : "max-w-md")}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="truncate text-base font-semibold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-elevated hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
