import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChangeEvent, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Camera,
  Copy,
  ImagePlus,
  LayoutPanelTop,
  Loader2,
  MapPin,
  Plus,
  Save,
  Send,
  Share2,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { useCurrentUser } from "@/hooks/use-waveos";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/vision-board/$boardId")({
  component: VisionBoardEditor,
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

const db = supabase as unknown as { from: (table: string) => any };

const newPage = (number: number): StoryboardPage => ({
  id: crypto.randomUUID(),
  sceneNumber: String(number),
  sceneTitle: "",
  location: "",
  description: "",
  shotDescription: "",
  image: null,
});

function VisionBoardEditor() {
  const { data: user, isLoading } = useCurrentUser();
  const { boardId: routeBoardId } = Route.useParams();
  const navigate = useNavigate();
  const canUseBoard = Boolean(user?.isDreamWaveOwner || user?.staffType === "crew");
  const [projectName, setProjectName] = useState("Untitled production");
  const [pages, setPages] = useState<StoryboardPage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [saving, setSaving] = useState(false);
  const storageKey = `waveos.vision-board.v2.${user?.userId ?? "loading"}.${routeBoardId}`;

  useEffect(() => {
    if (!user?.userId) return;
    let active = true;
    setLoaded(false);

    async function loadBoard() {
      if (routeBoardId === "new") {
        if (!active) return;
        setProjectName("Untitled production");
        setPages([newPage(1)]);
        setBoardId(null);
        setPublicToken(null);
        setStatus("draft");
        setLoaded(true);
        return;
      }

      const { data, error } = await db
        .from("production_vision_boards")
        .select("id, project_name, pages, status, public_token")
        .eq("id", routeBoardId)
        .eq("created_by", user!.userId)
        .maybeSingle();

      if (!active) return;
      if (error || !data) {
        toast.error("This storyboard could not be opened.");
        navigate({ to: "/vision-board", replace: true });
        return;
      }

      setProjectName(data.project_name || "Untitled production");
      setPages(Array.isArray(data.pages) && data.pages.length ? data.pages : [newPage(1)]);
      setBoardId(data.id);
      setPublicToken(data.public_token);
      setStatus(data.status);
      setLoaded(true);
    }

    void loadBoard();
    return () => {
      active = false;
    };
  }, [navigate, routeBoardId, user?.userId]);

  useEffect(() => {
    if (!loaded || !user?.userId) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ projectName, pages, boardId, publicToken, status }));
    } catch {
      toast.error("This board is too large for browser storage. Try smaller images.");
    }
  }, [boardId, loaded, pages, projectName, publicToken, status, storageKey, user?.userId]);

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

  async function saveBoard(nextStatus: "draft" | "published") {
    if (!user?.userId || saving) return null;
    setSaving(true);
    const payload = {
      project_name: projectName.trim() || "Untitled production",
      pages,
      status: nextStatus,
      published_at: nextStatus === "published" ? new Date().toISOString() : null,
      created_by: user.userId,
    };

    const query = boardId
      ? db.from("production_vision_boards").update(payload).eq("id", boardId)
      : db.from("production_vision_boards").insert(payload);
    const { data, error } = await query.select("id, public_token, status").single();
    setSaving(false);

    if (error) {
      toast.error(error.message || "The vision board could not be saved.");
      return null;
    }

    setBoardId(data.id);
    setPublicToken(data.public_token);
    if (routeBoardId === "new") {
      navigate({
        to: "/vision-board/$boardId",
        params: { boardId: data.id },
        replace: true,
      });
    }
    setStatus(data.status);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({
        projectName,
        pages,
        boardId: data.id,
        publicToken: data.public_token,
        status: data.status,
      }));
    } catch {
      // Database save succeeded even if this device cannot cache another copy.
    }
    toast.success(nextStatus === "published" ? "Vision board published" : "Draft saved");
    return data.public_token as string;
  }

  function boardUrl(token = publicToken) {
    return token ? `${window.location.origin}/storyboard/${token}` : "";
  }

  async function shareBoard() {
    if (!publicToken || status !== "published") {
      toast.error("Publish the vision board before sharing it.");
      return;
    }
    const url = boardUrl();
    if (navigator.share) {
      await navigator.share({ title: projectName, text: `${projectName} storyboard`, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success("Published link copied");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <Link to="/vision-board" className="text-sm font-semibold text-primary hover:underline">← All storyboards</Link>
      </div>

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
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => saveBoard("draft")} disabled={saving} className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save draft
            </button>
            <button type="button" onClick={() => saveBoard("published")} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              <Send className="h-4 w-4" />
              Publish
            </button>
            <button type="button" onClick={shareBoard} disabled={!publicToken || status !== "published"} className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-40">
              <Share2 className="h-4 w-4" />
              Share
            </button>
            <button type="button" onClick={() => addPage()} className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground">
              <Plus className="h-4 w-4" />
              Add page
            </button>
          </div>
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

      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:flex-row sm:items-center">
        <div>
          <h2 className="font-semibold text-foreground">Finished building the storyboard?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Save a working draft, then publish it to create a view-only client link.
          </p>
          {publicToken && status === "published" && (
            <a href={boardUrl()} target="_blank" rel="noreferrer" className="mt-2 block break-all text-xs font-medium text-primary hover:underline">
              {boardUrl()}
            </a>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => saveBoard("draft")} disabled={saving} className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-50">
            <Save className="h-4 w-4" />
            Save draft
          </button>
          <button type="button" onClick={() => saveBoard("published")} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            <Send className="h-4 w-4" />
            Publish link
          </button>
          <button type="button" onClick={shareBoard} disabled={!publicToken || status !== "published"} className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary disabled:opacity-40">
            <Share2 className="h-4 w-4" />
            Share
          </button>
        </div>
      </section>
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
