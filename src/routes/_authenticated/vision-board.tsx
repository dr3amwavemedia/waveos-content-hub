import { createFileRoute, Link } from "@tanstack/react-router";
import { ChangeEvent, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Camera,
  Copy,
  ImagePlus,
  LayoutPanelTop,
  MapPin,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { useCurrentUser } from "@/hooks/use-waveos";

export const Route = createFileRoute("/_authenticated/vision-board")({
  component: VisionBoard,
});

type StoryboardPage = {
  id: string;
  sceneNumber: string;
  sceneTitle: string;
  location: string;
  description: string;
  shotDescription: string;
  image: string | null;
};

const newPage = (number: number): StoryboardPage => ({
  id: crypto.randomUUID(),
  sceneNumber: String(number),
  sceneTitle: "",
  location: "",
  description: "",
  shotDescription: "",
  image: null,
});

function VisionBoard() {
  const { data: user, isLoading } = useCurrentUser();
  const canUseBoard = Boolean(user?.isDreamWaveOwner || user?.staffType === "media_manager");
  const [projectName, setProjectName] = useState("Untitled production");
  const [pages, setPages] = useState<StoryboardPage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const storageKey = `waveos.vision-board.v1.${user?.userId ?? "loading"}`;

  useEffect(() => {
    if (!user?.userId) return;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as { projectName?: string; pages?: StoryboardPage[] };
        setProjectName(parsed.projectName || "Untitled production");
        setPages(Array.isArray(parsed.pages) && parsed.pages.length ? parsed.pages : [newPage(1)]);
      } else {
        setPages([newPage(1)]);
      }
    } catch {
      setPages([newPage(1)]);
    } finally {
      setLoaded(true);
    }
  }, [storageKey, user?.userId]);

  useEffect(() => {
    if (!loaded || !user?.userId) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ projectName, pages }));
    } catch {
      toast.error("This board is too large for browser storage. Try smaller images.");
    }
  }, [loaded, pages, projectName, storageKey, user?.userId]);

  if (isLoading) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Loading vision board…</div>;
  }

  if (!canUseBoard) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-surface p-8 text-center">
        <LayoutPanelTop className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-4 text-xl font-semibold text-foreground">Vision Board</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This workspace is available to Dream Wave admins and media staff.
        </p>
      </div>
    );
  }

  function updatePage(id: string, patch: Partial<StoryboardPage>) {
    setPages((current) => current.map((page) => (page.id === id ? { ...page, ...patch } : page)));
  }

  function addPage(afterIndex?: number) {
    setPages((current) => {
      const page = newPage(current.length + 1);
      if (afterIndex === undefined) return [...current, page];
      const next = [...current];
      next.splice(afterIndex + 1, 0, page);
      return next;
    });
  }

  function duplicatePage(index: number) {
    setPages((current) => {
      const source = current[index];
      const copy = { ...source, id: crypto.randomUUID(), sceneNumber: String(current.length + 1) };
      const next = [...current];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }

  function removePage(id: string) {
    setPages((current) => (current.length === 1 ? current : current.filter((page) => page.id !== id)));
  }

  async function uploadImage(id: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image or drawing file.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Please use an image smaller than 4 MB.");
      return;
    }
    const image = await readFile(file);
    updatePage(id, { image });
    event.target.value = "";
  }

  return (
    <div className="space-y-6">
      <nav className="flex w-fit items-center gap-1 rounded-xl border border-border bg-surface p-1" aria-label="Production sections">
        <Link
          to="/videographer"
          className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-elevated hover:text-foreground"
        >
          Dashboard
        </Link>
        <Link
          to="/vision-board"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          <LayoutPanelTop className="h-4 w-4" />
          Vision Board
        </Link>
      </nav>

      <header className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              <Camera className="h-4 w-4" />
              Production · Vision Board
            </div>
            <input
              aria-label="Project name"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              className="mt-3 w-full bg-transparent text-3xl font-bold tracking-tight text-foreground outline-none placeholder:text-muted-foreground"
              placeholder="Project name"
            />
            <p className="mt-1 text-sm text-muted-foreground">
              Build the visual story scene by scene. Your board saves automatically on this device.
            </p>
          </div>
          <button
            type="button"
            onClick={() => addPage()}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            Add storyboard page
          </button>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-2">
        {pages.map((page, index) => (
          <StoryboardCard
            key={page.id}
            page={page}
            pageNumber={index + 1}
            canDelete={pages.length > 1}
            onChange={(patch) => updatePage(page.id, patch)}
            onUpload={(event) => uploadImage(page.id, event)}
            onAdd={() => addPage(index)}
            onDuplicate={() => duplicatePage(index)}
            onDelete={() => removePage(page.id)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => addPage()}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/40 bg-primary/5 py-8 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
      >
        <Plus className="h-5 w-5" />
        Add another scene
      </button>
    </div>
  );
}

function StoryboardCard({
  page,
  pageNumber,
  canDelete,
  onChange,
  onUpload,
  onAdd,
  onDuplicate,
  onDelete,
}: {
  page: StoryboardPage;
  pageNumber: number;
  canDelete: boolean;
  onChange: (patch: Partial<StoryboardPage>) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onAdd: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex items-center gap-3 border-b border-border bg-elevated/40 px-4 py-3">
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
          Page {pageNumber}
        </span>
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Scene
          </span>
          <input
            value={page.sceneNumber}
            onChange={(event) => onChange({ sceneNumber: event.target.value })}
            className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-sm font-semibold text-foreground outline-none focus:border-primary"
            aria-label={`Scene number for page ${pageNumber}`}
          />
        </label>
        <button type="button" onClick={onDuplicate} className="rounded-lg p-2 text-muted-foreground hover:bg-background hover:text-foreground" aria-label="Duplicate page">
          <Copy className="h-4 w-4" />
        </button>
        <button type="button" onClick={onDelete} disabled={!canDelete} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30" aria-label="Delete page">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="relative aspect-video overflow-hidden bg-[#f4f1e9]">
        {page.image ? (
          <>
            <img src={page.image} alt={page.sceneTitle || `Storyboard scene ${page.sceneNumber}`} className="h-full w-full object-contain" />
            <button type="button" onClick={() => inputRef.current?.click()} className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-full bg-background/90 px-3 py-2 text-xs font-semibold text-foreground shadow backdrop-blur">
              <Upload className="h-4 w-4" />
              Replace
            </button>
          </>
        ) : (
          <button type="button" onClick={() => inputRef.current?.click()} className="flex h-full w-full flex-col items-center justify-center gap-3 text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary">
            <span className="rounded-2xl border border-dashed border-current p-5">
              <ImagePlus className="h-9 w-9" />
            </span>
            <span className="text-sm font-semibold">Upload image or drawing</span>
            <span className="text-xs">PNG, JPG, WEBP, GIF · up to 4 MB</span>
          </button>
        )}
        <input ref={inputRef} type="file" accept="image/*" onChange={onUpload} className="hidden" />
      </div>

      <div className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,.8fr)]">
          <Field label="Scene title">
            <input value={page.sceneTitle} onChange={(event) => onChange({ sceneTitle: event.target.value })} placeholder="e.g. Exterior arrival" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary" />
          </Field>
          <Field label="Location" icon={<MapPin className="h-3.5 w-3.5" />}>
            <input value={page.location} onChange={(event) => onChange({ location: event.target.value })} placeholder="Location or set" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary" />
          </Field>
        </div>
        <Field label="Scene description">
          <textarea value={page.description} onChange={(event) => onChange({ description: event.target.value })} rows={3} placeholder="What happens in this scene?" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary resize-none" />
        </Field>
        <Field label="Shot description">
          <textarea value={page.shotDescription} onChange={(event) => onChange({ shotDescription: event.target.value })} rows={3} placeholder="Framing, camera movement, lens, lighting, audio, and creative notes…" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary resize-none" />
        </Field>
      </div>

      <div className="border-t border-border px-5 py-3">
        <button type="button" onClick={onAdd} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Plus className="h-3.5 w-3.5" />
          Add scene after this page
        </button>
      </div>
    </article>
  );
}

function Field({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
