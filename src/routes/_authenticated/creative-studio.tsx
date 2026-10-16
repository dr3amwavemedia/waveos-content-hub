import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BringToFront,
  Circle,
  Copy,
  Download,
  Image as ImageIcon,
  ImagePlus,
  Layers3,
  Loader2,
  Redo2,
  Save,
  SendToBack,
  Square,
  Trash2,
  Type,
  Undo2,
  Upload,
  WandSparkles,
  Crop,
  SlidersHorizontal,
  RotateCw,
  Maximize2,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { RequireFeature } from "@/components/app/require-feature";
import { UnsavedChangesGuard } from "@/components/app/unsaved-changes-guard";
import { useWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { useWorkflowDraft } from "@/hooks/use-workflow-draft";
import { getMediaPreviewUrl, useMediaAssets, useUploadAsset } from "@/hooks/use-media";
import { useWorkspaceBranding, workspacePalette } from "@/hooks/use-workspace-branding";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { MobileToolPanel } from "@/components/app/mobile-tool-panel";
import { Slider } from "@/components/ui/slider";

export const Route = createFileRoute("/_authenticated/creative-studio")({
  component: () => (
    <RequireFeature
      feature="can_use_creative_studio"
      title="Creative Studio isn't included in this plan"
      description="Static image design is available with Current, Tidal, Full Retainer, and Social Management access."
    >
      <CreativeStudioPage />
    </RequireFeature>
  ),
  head: () => ({
    meta: [
      { title: "Creative Studio — WaveOS" },
      {
        name: "description",
        content: "Create and export static social graphics using workspace brand colors.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Creative Studio — WaveOS" },
      { property: "og:description", content: "Create and edit branded social graphics in your workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const db = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

const FORMATS = {
  square: { label: "Square", width: 1080, height: 1080 },
  portrait: { label: "Portrait", width: 1080, height: 1350 },
  story: { label: "Story", width: 1080, height: 1920 },
  landscape: { label: "Landscape", width: 1200, height: 628 },
} as const;

type DesignFormat = keyof typeof FORMATS;
type TextElement = {
  id: string;
  type: "text";
  name: string;
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  fontWeight: 400 | 600 | 700;
  align: CanvasTextAlign;
  opacity: number;
  rotation: number;
};
type ShapeElement = {
  id: string;
  type: "shape";
  name: string;
  shape: "rectangle" | "circle";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
  rotation: number;
};
type ImageElement = {
  id: string;
  type: "image";
  name: string;
  sourceType: "media" | "workspace-logo";
  assetId: string | null;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  crop?: { x: number; y: number; width: number; height: number };
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  rotation: number;
};
type DesignElement = TextElement | ShapeElement | ImageElement;
type DesignDocument = {
  version: 1;
  format: DesignFormat;
  background: string;
  elements: DesignElement[];
};

interface DesignRow {
  id: string;
  name: string;
  format: DesignFormat;
  document: DesignDocument;
  updated_at: string;
}

const DEFAULT_DOCUMENT: DesignDocument = {
  version: 1,
  format: "square",
  background: "#0b1220",
  elements: [],
};

const TEMPLATE_NAMES = [
  "Sale",
  "Grand Opening",
  "New Product",
  "Testimonial",
  "Event",
  "Weekend Special",
  "Announcement",
  "Holiday",
  "Before / After",
] as const;

function templateDocument(
  template: (typeof TEMPLATE_NAMES)[number],
  accent: string,
): DesignDocument {
  const headline =
    template === "Testimonial"
      ? "“An experience worth sharing.”"
      : template === "Before / After"
        ? "Before → After"
        : template;
  return {
    version: 1,
    format: template === "Event" ? "portrait" : "square",
    background: "#0b1220",
    elements: [
      {
        id: crypto.randomUUID(),
        type: "shape",
        name: "Brand block",
        shape: "rectangle",
        x: 0.5,
        y: 0.78,
        width: 900,
        height: 210,
        color: accent,
        opacity: 1,
        rotation: 0,
      },
      {
        id: crypto.randomUUID(),
        type: "text",
        name: "Headline",
        text: headline,
        x: 0.5,
        y: 0.43,
        color: "#ffffff",
        fontSize: template === "Testimonial" ? 68 : 96,
        fontWeight: 700,
        align: "center",
        opacity: 1,
        rotation: 0,
      },

    ],
  };
}

function cloneDocument(document: DesignDocument): DesignDocument {
  return JSON.parse(JSON.stringify(document)) as DesignDocument;
}

function normalizeDocument(document: DesignDocument): DesignDocument {
  const cloned = cloneDocument(document);
  return {
    ...cloned,
    elements: cloned.elements.map((element) => ({
      ...element,
      opacity: element.opacity ?? 1,
      rotation: element.rotation ?? 0,
    })) as DesignElement[],
  };
}

function loadCanvasImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image_load_failed"));
    image.src = url;
  });
}

function CreativeStudioPage() {
  const navigate = useNavigate();
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;
  const branding = useWorkspaceBranding(activeWorkspace?.id);
  const palette = workspacePalette(branding.data?.accentColor);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const dragHistoryIndexRef = useRef<number | null>(null);
  const queryClient = useQueryClient();
  const [name, setName] = useState("Untitled graphic");
  const [designId, setDesignId] = useState<string | null>(null);
  const [history, setHistory] = useState<DesignDocument[]>([cloneDocument(DEFAULT_DOCUMENT)]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [mobileStarted, setMobileStarted] = useState(false);
  const [mobileTool, setMobileTool] = useState<string | null>(null);
  const [photoMode, setPhotoMode] = useState(false);
  const document = history[historyIndex];
  const format = FORMATS[document.format];
  const mediaAssets = useMediaAssets(workspaceId, { kind: "image" });
  const uploadAsset = useUploadAsset(workspaceId);

  const workflowDraft = useWorkflowDraft<{
    name: string;
    designId: string | null;
    document: DesignDocument;
  }>({
    workspaceId,
    workflowKey: "creative-studio",
    entityId: designId,
  });

  const designs = useQuery({
    queryKey: ["creative-designs", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await db
        .from("creative_designs")
        .select("id,name,format,document,updated_at")
        .eq("workspace_id", workspaceId!)
        .order("updated_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as DesignRow[];
    },
  });

  const saveDesign = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("Select a workspace first.");
      if (!name.trim()) throw new Error("Add a design name.");
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw authError ?? new Error("Sign in to save this design.");
      const payload = {
        workspace_id: workspaceId,
        created_by: auth.user.id,
        name: name.trim(),
        format: document.format,
        document,
      };
      if (designId) {
        const { data, error } = await db
          .from("creative_designs")
          .update({ name: payload.name, format: payload.format, document: payload.document })
          .eq("id", designId)
          .eq("workspace_id", workspaceId)
          .select("id")
          .single();
        if (error) throw error;
        return data.id as string;
      }
      const { data, error } = await db
        .from("creative_designs")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: async (id) => {
      setDesignId(id);
      setDirty(false);
      await workflowDraft.discard.mutateAsync();
      await queryClient.invalidateQueries({ queryKey: ["creative-designs", workspaceId] });
      toast.success("Design saved.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Design could not be saved."),
  });

  useEffect(() => {
    let cancelled = false;
    const missingIds = document.elements.flatMap((element) =>
      element.type === "image" &&
      element.sourceType === "media" &&
      element.assetId &&
      !assetUrls[element.assetId]
        ? [element.assetId]
        : [],
    );
    if (!missingIds.length || !mediaAssets.data) return;
    void Promise.all(
      Array.from(new Set(missingIds)).map(async (assetId) => {
        const asset = mediaAssets.data?.find((candidate) => candidate.id === assetId);
        if (!asset) return null;
        try {
          return [assetId, await getMediaPreviewUrl(asset, 60 * 60 * 6)] as const;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setAssetUrls((current) => ({
        ...current,
        ...Object.fromEntries(
          entries.filter((entry): entry is readonly [string, string] => Boolean(entry)),
        ),
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [assetUrls, document.elements, mediaAssets.data]);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = format.width;
    canvas.height = format.height;
    const context = canvas.getContext("2d");
    if (!context) return;

    async function paint(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = document.background;
      context.fillRect(0, 0, canvas.width, canvas.height);
      for (const element of document.elements) {
        if (cancelled) return;
        context.save();
        const x = element.x * canvas.width;
        const y = element.y * canvas.height;
        context.translate(x, y);
        context.rotate(((element.rotation ?? 0) * Math.PI) / 180);
        if (element.type === "shape") {
          context.globalAlpha = element.opacity;
          context.fillStyle = element.color;
          if (element.shape === "circle") {
            context.beginPath();
            context.ellipse(0, 0, element.width / 2, element.height / 2, 0, 0, Math.PI * 2);
            context.fill();
          } else {
            context.fillRect(
              -element.width / 2,
              -element.height / 2,
              element.width,
              element.height,
            );
          }
        } else if (element.type === "image") {
          const url =
            element.sourceType === "workspace-logo"
              ? branding.data?.logoUrl
              : element.assetId
                ? assetUrls[element.assetId]
                : null;
          if (url) {
            try {
              const image = await loadCanvasImage(url);
              if (cancelled) return;
              context.globalAlpha = element.opacity;
              context.filter = `brightness(${element.brightness ?? 100}%) contrast(${element.contrast ?? 100}%) saturate(${element.saturation ?? 100}%)`;
              const crop = element.crop ?? { x: 0, y: 0, width: 1, height: 1 };
              context.drawImage(
                image,
                image.naturalWidth * crop.x,
                image.naturalHeight * crop.y,
                image.naturalWidth * crop.width,
                image.naturalHeight * crop.height,
                -element.width / 2,
                -element.height / 2,
                element.width,
                element.height,
              );
            } catch {
              context.strokeStyle = "#ef4444";
              context.lineWidth = 4;
              context.strokeRect(
                -element.width / 2,
                -element.height / 2,
                element.width,
                element.height,
              );
            }
          }
        } else {
          context.globalAlpha = element.opacity ?? 1;
          context.fillStyle = element.color;
          context.font = `${element.fontWeight} ${element.fontSize}px Inter, Arial, sans-serif`;
          context.textAlign = element.align;
          context.textBaseline = "middle";
          const maxWidth = canvas.width * 0.88;
          const lines = element.text.split("\n").slice(0, 8);
          const lineHeight = element.fontSize * 1.18;
          const startY = -((lines.length - 1) * lineHeight) / 2;
          lines.forEach((line, index) => {
            context.fillText(line, 0, startY + index * lineHeight, maxWidth);
          });
        }
        context.restore();
      }
    }
    void paint(canvas, context);
    return () => {
      cancelled = true;
    };
  }, [assetUrls, branding.data?.logoUrl, document, format.height, format.width, mobileStarted]);

  function commit(next: DesignDocument) {
    const nextHistory = [...history.slice(0, historyIndex + 1), cloneDocument(next)].slice(-50);
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
    setDirty(true);
  }

  function changeDocument(update: (current: DesignDocument) => DesignDocument) {
    commit(update(cloneDocument(document)));
  }

  function addText() {
    const element: TextElement = {
      id: crypto.randomUUID(),
      type: "text",
      name: `Text ${document.elements.filter((item) => item.type === "text").length + 1}`,
      text: "New message",
      x: 0.5,
      y: 0.5,
      color: "#ffffff",
      fontSize: 72,
      fontWeight: 700,
      align: "center",
      opacity: 1,
      rotation: 0,
    };
    changeDocument((current) => ({ ...current, elements: [...current.elements, element] }));
    setSelectedId(element.id);
  }

  function addShape(shape: ShapeElement["shape"]) {
    const element: ShapeElement = {
      id: crypto.randomUUID(),
      type: "shape",
      name: shape === "circle" ? "Circle" : "Rectangle",
      shape,
      x: 0.5,
      y: 0.5,
      width: Math.round(format.width * 0.35),
      height: Math.round(format.height * 0.18),
      color: palette.primary,
      opacity: 1,
      rotation: 0,
    };
    changeDocument((current) => ({ ...current, elements: [...current.elements, element] }));
    setSelectedId(element.id);
  }

  function addImage(assetId: string) {
    const asset = mediaAssets.data?.find((candidate) => candidate.id === assetId);
    const sourceWidth = asset?.width ?? 800;
    const sourceHeight = asset?.height ?? 800;
    const maxWidth = format.width * 0.72;
    const maxHeight = format.height * 0.58;
    const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
    const element: ImageElement = {
      id: crypto.randomUUID(),
      type: "image",
      name: asset?.name ?? "Media image",
      sourceType: "media",
      assetId,
      x: 0.5,
      y: 0.5,
      width: Math.max(80, Math.round(sourceWidth * scale)),
      height: Math.max(80, Math.round(sourceHeight * scale)),
      opacity: 1,
      rotation: 0,
    };
    changeDocument((current) => ({ ...current, elements: photoMode ? [{ ...element, x: 0.5, y: 0.5, width: format.width, height: format.height }] : [...current.elements, element] }));
    setSelectedId(element.id);
    setMobileStarted(true);
    setMobileTool(null);
  }

  function addWorkspaceLogo() {
    if (!branding.data?.logoUrl) {
      toast.error("Add a workspace logo in Settings before placing it here.");
      return;
    }
    const element: ImageElement = {
      id: crypto.randomUUID(),
      type: "image",
      name: "Workspace logo",
      sourceType: "workspace-logo",
      assetId: null,
      x: 0.5,
      y: 0.15,
      width: Math.round(format.width * 0.28),
      height: Math.round(format.height * 0.12),
      opacity: 1,
      rotation: 0,
    };
    changeDocument((current) => ({ ...current, elements: [...current.elements, element] }));
    setSelectedId(element.id);
  }

  function applyBrand() {
    changeDocument((current) => {
      const hasLogo = current.elements.some(
        (element) => element.type === "image" && element.sourceType === "workspace-logo",
      );
      const elements = current.elements.map((element) =>
        element.type === "shape"
          ? { ...element, color: palette.primary }
          : element.type === "text"
            ? { ...element, color: "#ffffff" }
            : element,
      ) as DesignElement[];
      if (!hasLogo && branding.data?.logoUrl) {
        elements.push({
          id: crypto.randomUUID(),
          type: "image",
          name: "Workspace logo",
          sourceType: "workspace-logo",
          assetId: null,
          x: 0.5,
          y: 0.14,
          width: Math.round(FORMATS[current.format].width * 0.28),
          height: Math.round(FORMATS[current.format].height * 0.1),
          opacity: 1,
          rotation: 0,
        });
      }
      return { ...current, background: "#0b1220", elements };
    });
    toast.success("Workspace colors applied. Undo restores the previous design.");
  }

  async function uploadImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Creative Studio accepts still images only.");
      return;
    }
    try {
      const asset = await uploadAsset.mutateAsync({
        file,
        folderId: null,
        tags: ["creative-studio"],
      });
      const url = await getMediaPreviewUrl(asset, 60 * 60 * 6);
      if (!url) throw new Error("The uploaded image does not have a preview URL.");
      setAssetUrls((current) => ({ ...current, [asset.id]: url }));
      addImage(asset.id);
      toast.success("Image uploaded to the Media Library and added to this design.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Image could not be uploaded.");
    } finally {
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  }

  function updateElement(id: string, patch: Partial<DesignElement>) {
    changeDocument((current) => ({
      ...current,
      elements: current.elements.map((element) =>
        element.id === id ? ({ ...element, ...patch } as DesignElement) : element,
      ),
    }));
  }

  function moveLayer(id: string, direction: -1 | 1) {
    changeDocument((current) => {
      const index = current.elements.findIndex((element) => element.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.elements.length) return current;
      const elements = [...current.elements];
      [elements[index], elements[target]] = [elements[target], elements[index]];
      return { ...current, elements };
    });
  }

  function removeElement(id: string) {
    changeDocument((current) => ({
      ...current,
      elements: current.elements.filter((element) => element.id !== id),
    }));
    setSelectedId(null);
  }

  function duplicateElement(id: string) {
    const source = document.elements.find((element) => element.id === id);
    if (!source) return;
    const duplicate = {
      ...cloneDocument({ ...document, elements: [source] }).elements[0],
      id: crypto.randomUUID(),
      name: `${source.name} copy`,
      x: Math.min(0.92, source.x + 0.04),
      y: Math.min(0.92, source.y + 0.04),
    } as DesignElement;
    changeDocument((current) => ({ ...current, elements: [...current.elements, duplicate] }));
    setSelectedId(duplicate.id);
  }

  function loadDesign(row: DesignRow) {
    const safe = normalizeDocument(row.document);
    setName(row.name);
    setDesignId(row.id);
    setHistory([safe]);
    setHistoryIndex(0);
    setSelectedId(safe.elements.at(-1)?.id ?? null);
    setDirty(false);
    setMobileStarted(true);
    setMobileTool(null);
  }

  function exportPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error("The PNG could not be created.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `${
        name
          .trim()
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-|-$/g, "")
          .toLowerCase() || "waveos-design"
      }.png`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${format.width} × ${format.height} PNG.`);
    }, "image/png");
  }

  async function sendToPost(destination: "feed" | "story" = "feed") {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (created) =>
            created ? resolve(created) : reject(new Error("The PNG could not be created.")),
          "image/png",
        ),
      );
      const filename = `${
        name
          .trim()
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-|-$/g, "")
          .toLowerCase() || "waveos-design"
      }.png`;
      const asset = await uploadAsset.mutateAsync({
        file: new File([blob], filename, { type: "image/png" }),
        folderId: null,
        tags: ["creative-studio", "export"],
      });
      toast.success(
        destination === "story"
          ? "Design saved. Opening an Instagram Story draft…"
          : "Design saved. Opening a feed post draft…",
      );
      void navigate({
        to: "/create",
        search: { media: asset.id, destination },
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The design could not be sent to a post.",
      );
    }
  }

  function canvasPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const bounds = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  }

  function hitElement(point: { x: number; y: number }) {
    const px = point.x * format.width;
    const py = point.y * format.height;
    return [...document.elements].reverse().find((element) => {
      const centerX = element.x * format.width;
      const centerY = element.y * format.height;
      const width =
        element.type === "text"
          ? Math.min(
              format.width * 0.88,
              Math.max(element.fontSize * 2, element.text.length * element.fontSize * 0.5),
            )
          : element.width;
      const height =
        element.type === "text"
          ? Math.max(
              element.fontSize * 1.2,
              element.text.split("\n").length * element.fontSize * 1.2,
            )
          : element.height;
      return Math.abs(px - centerX) <= width / 2 && Math.abs(py - centerY) <= height / 2;
    });
  }

  function beginCanvasMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const point = canvasPoint(event);
    const element = hitElement(point);
    if (!element) {
      setSelectedId(null);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const nextHistory = [...history.slice(0, historyIndex + 1), cloneDocument(document)].slice(-50);
    const nextIndex = nextHistory.length - 1;
    setHistory(nextHistory);
    setHistoryIndex(nextIndex);
    dragHistoryIndexRef.current = nextIndex;
    dragRef.current = {
      id: element.id,
      offsetX: point.x - element.x,
      offsetY: point.y - element.y,
    };
    setSelectedId(element.id);
  }

  function moveCanvasElement(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    const targetIndex = dragHistoryIndexRef.current;
    if (!drag || targetIndex === null) return;
    const point = canvasPoint(event);
    setHistory((current) =>
      current.map((item, index) =>
        index !== targetIndex
          ? item
          : {
              ...item,
              elements: item.elements.map((element) =>
                element.id === drag.id
                  ? {
                      ...element,
                      x: Math.max(0, Math.min(1, point.x - drag.offsetX)),
                      y: Math.max(0, Math.min(1, point.y - drag.offsetY)),
                    }
                  : element,
              ),
            },
      ),
    );
    setDirty(true);
  }

  function endCanvasMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (dragRef.current && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    dragHistoryIndexRef.current = null;
  }

  async function saveServerDraft() {
    try {
      await workflowDraft.save.mutateAsync({ name, designId, document });
      setDirty(false);
      toast.success("Private server draft saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Draft could not be saved.");
    }
  }

  const selected = document.elements.find((element) => element.id === selectedId) ?? null;
  const selectedIndex = selected
    ? document.elements.findIndex((element) => element.id === selected.id)
    : -1;

  if (!activeWorkspace) return null;

  return (
    <div className="space-y-5">
      <UnsavedChangesGuard dirty={dirty} subject="this design" />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="hidden items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary sm:flex">
            <ImageIcon className="h-4 w-4" /> Static images only
          </div>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Creative Studio</h1>
          <p className="mt-2 hidden max-w-3xl text-sm text-muted-foreground sm:block">
            Compose branded text and shapes, save editable designs, and export a high-resolution
            PNG. Video timelines and generative credits are not used.
          </p>
        </div>
        <div className="hidden flex-wrap gap-2 sm:flex">
          <Button
            variant="outline"
            onClick={() => void saveServerDraft()}
            disabled={workflowDraft.save.isPending}
          >
            {workflowDraft.save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Save draft
          </Button>
          <Button variant="outline" onClick={exportPng}>
            <Download /> Export PNG
          </Button>
          <Button
            variant="outline"
            onClick={() => void sendToPost("feed")}
            disabled={uploadAsset.isPending}
          >
            {uploadAsset.isPending ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            Post to feed
          </Button>
          <Button
            variant="outline"
            onClick={() => void sendToPost("story")}
            disabled={uploadAsset.isPending}
          >
            {uploadAsset.isPending ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            Post to story
          </Button>
          <Button onClick={() => saveDesign.mutate()} disabled={saveDesign.isPending}>
            {saveDesign.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Save design
          </Button>
        </div>
      </header>

      {!mobileStarted && <section className="grid grid-cols-2 gap-3 sm:hidden" aria-label="Start a design">
        {[
          { label: "Create Graphic", icon: WandSparkles, tool: "Templates", photo: false },
          { label: "Edit Photo", icon: ImageIcon, tool: "Media", photo: true },
          { label: "Resize Content", icon: Maximize2, tool: "Canvas", photo: false },
          { label: "Brand Template", icon: Layers3, tool: "Templates", photo: false },
        ].map(({ label, icon: Icon, tool, photo }) => <Button key={label} variant="outline" className="min-h-32 flex-col gap-3 whitespace-normal rounded-2xl border-border-strong bg-gradient-to-br from-secondary to-surface text-center" onClick={() => { setPhotoMode(photo); setMobileStarted(true); setMobileTool(tool); }}><Icon className="size-8 text-primary" /><span>{label}</span></Button>)}
      </section>}

      {workflowDraft.data?.payload && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold">A private server draft is available</div>
            <div className="text-xs text-muted-foreground">
              Last saved {new Date(workflowDraft.data.updated_at).toLocaleString()}.
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const restored = workflowDraft.data?.payload;
                if (!restored) return;
                setName(restored.name);
                setDesignId(restored.designId);
                setHistory([normalizeDocument(restored.document)]);
                setHistoryIndex(0);
                setDirty(false);
                setMobileStarted(true);
              }}
            >
              Restore
            </Button>
            <Button size="sm" variant="ghost" onClick={() => workflowDraft.discard.mutate()}>
              Discard
            </Button>
          </div>
        </div>
      )}

      <section className={cn("flex flex-wrap items-end gap-3 sm:rounded-2xl sm:border sm:border-border sm:bg-card sm:p-4", !mobileStarted && "hidden sm:flex")}>
        <Field label="Design name">
          <input
            className={`${inputClass} min-w-0 sm:min-w-56`}
            value={name}
            maxLength={120}
            onChange={(event) => {
              setName(event.target.value);
              setDirty(true);
            }}
          />
        </Field>
        <Field label="Format">
          <select
            className={inputClass}
            value={document.format}
            onChange={(event) =>
              changeDocument((current) => ({
                ...current,
                format: event.target.value as DesignFormat,
              }))
            }
          >
            {Object.entries(FORMATS).map(([value, item]) => (
              <option key={value} value={value}>
                {item.label} · {item.width}×{item.height}
              </option>
            ))}
          </select>
        </Field>
        <div className="ml-auto flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Undo"
            disabled={historyIndex === 0}
            onClick={() => {
              setHistoryIndex((index) => Math.max(0, index - 1));
              setDirty(true);
            }}
          >
            <Undo2 />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Redo"
            disabled={historyIndex === history.length - 1}
            onClick={() => {
              setHistoryIndex((index) => Math.min(history.length - 1, index + 1));
              setDirty(true);
            }}
          >
            <Redo2 />
          </Button>
        </div>
      </section>

      <div className={cn("grid gap-5 xl:grid-cols-[14rem_minmax(0,1fr)_18rem]", !mobileStarted && "hidden sm:grid")}>
        <MobileToolPanel open={["Add", "Media", "Brand", "Templates", "Layers"].includes(mobileTool ?? "")} title={mobileTool ?? "Tools"} onClose={() => setMobileTool(null)}>
          <section className={cn("surface-card p-4", mobileTool && !["Add", "Brand"].includes(mobileTool) && "hidden sm:block")}>
            <h2 className="text-sm font-semibold">Add</h2>
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="sr-only"
              onChange={(event) => void uploadImage(event.target.files?.[0])}
            />
            <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-1">
              <ToolButton icon={Type} label="Text" onClick={addText} />
              <ToolButton icon={Square} label="Rectangle" onClick={() => addShape("rectangle")} />
              <ToolButton icon={Circle} label="Circle" onClick={() => addShape("circle")} />
              <ToolButton
                icon={Upload}
                label="Upload image"
                onClick={() => uploadInputRef.current?.click()}
              />
              <ToolButton icon={ImageIcon} label="Workspace logo" onClick={addWorkspaceLogo} />
              <ToolButton icon={WandSparkles} label="Apply my brand" onClick={applyBrand} />
            </div>
          </section>
          <section className={cn("surface-card p-4", mobileTool !== "Templates" && "hidden sm:block")}>
            <h2 className="text-sm font-semibold">Templates</h2>
            <div className="mt-3 max-h-48 space-y-1 overflow-y-auto">
              {TEMPLATE_NAMES.map((template) => (
                <button
                  key={template}
                  type="button"
                  className="min-h-10 w-full rounded-lg px-3 text-left text-xs text-muted-foreground hover:bg-elevated hover:text-foreground"
                  onClick={() => {
                    const next = templateDocument(template, palette.primary);
                    commit(next);
                    setName(`${template} graphic`);
                    setDesignId(null);
                    setSelectedId(next.elements.at(-1)?.id ?? null);
                  }}
                >
                  {template}
                </button>
              ))}
            </div>
          </section>
          <section className={cn("surface-card p-4", mobileTool !== "Media" && "hidden sm:block")}>
            <h2 className="text-sm font-semibold">Media Library</h2>
            <Button variant="outline" className="mt-3 min-h-11 w-full sm:hidden" onClick={() => uploadInputRef.current?.click()}><Upload /> Upload image</Button>
            <div className="mt-3 max-h-48 space-y-1 overflow-y-auto">
              {(mediaAssets.data ?? []).slice(0, 30).map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs text-muted-foreground hover:bg-elevated hover:text-foreground"
                  onClick={() => addImage(asset.id)}
                >
                  <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{asset.name}</span>
                </button>
              ))}
              {!mediaAssets.isLoading && !mediaAssets.data?.length && (
                <p className="text-xs text-muted-foreground">Upload a JPG or PNG to get started.</p>
              )}
            </div>
          </section>
          <section className={cn("surface-card p-4", mobileTool !== "Layers" && "hidden sm:block")}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Layers3 className="h-4 w-4" /> Layers
            </div>
            <div className="mt-3 space-y-1">
              {[...document.elements].reverse().map((element) => (
                <button
                  key={element.id}
                  type="button"
                  onClick={() => setSelectedId(element.id)}
                  className={cn(
                    "flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs",
                    selectedId === element.id
                      ? "bg-primary/15 text-foreground"
                      : "text-muted-foreground hover:bg-elevated",
                  )}
                >
                  {element.type === "text" ? (
                    <Type className="h-3.5 w-3.5" />
                  ) : element.type === "image" ? (
                    <ImageIcon className="h-3.5 w-3.5" />
                  ) : element.shape === "circle" ? (
                    <Circle className="h-3.5 w-3.5" />
                  ) : (
                    <Square className="h-3.5 w-3.5" />
                  )}
                  <span className="truncate">{element.name}</span>
                </button>
              ))}
            </div>
          </section>
          <section className={cn("surface-card p-4", mobileTool !== "Templates" && "hidden sm:block")}>
            <h2 className="text-sm font-semibold">Saved designs</h2>
            <div className="mt-3 space-y-1">
              {(designs.data ?? []).map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="w-full rounded-lg px-3 py-2 text-left hover:bg-elevated"
                  onClick={() => loadDesign(row)}
                >
                  <div className="truncate text-xs font-semibold">{row.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {FORMATS[row.format]?.label ?? row.format}
                  </div>
                </button>
              ))}
              {!designs.isLoading && !designs.data?.length && (
                <p className="text-xs text-muted-foreground">No saved designs yet.</p>
              )}
            </div>
          </section>
        </MobileToolPanel>

        <section className="relative flex min-h-64 items-center justify-center overflow-hidden sm:surface-card sm:min-h-[30rem] sm:p-6">
          <div className="w-full max-w-3xl">
            {document.elements.length === 0 && <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center"><div className="rounded-full border border-border/80 bg-background/80 px-4 py-2 text-xs text-muted-foreground backdrop-blur">Tap Add, Media, or Templates to start creating</div></div>}
            <canvas
              ref={canvasRef}
              aria-label={`${name} design preview`}
              className="mx-auto h-auto max-h-[48dvh] w-auto max-w-full touch-none cursor-move ring-1 ring-border-strong sm:max-h-none sm:w-full sm:rounded-lg"
              style={{ aspectRatio: `${format.width}/${format.height}` }}
              onPointerDown={beginCanvasMove}
              onPointerMove={moveCanvasElement}
              onPointerUp={endCanvasMove}
              onPointerCancel={endCanvasMove}
            />
            <div className="mt-3 hidden text-center text-xs text-muted-foreground sm:block">
              Preview scaled to fit · export is {format.width} × {format.height}px
            </div>
          </div>
        </section>

        <MobileToolPanel open={["Canvas", "Adjust", "Crop", "Edit"].includes(mobileTool ?? "")} title={mobileTool ?? "Canvas"} onClose={() => setMobileTool(null)}>
          <section className={cn("surface-card space-y-4 p-4", mobileTool !== "Canvas" && "hidden sm:block")}>
            <h2 className="text-sm font-semibold">Canvas</h2>
            <Field label="Background">
              <input
                type="color"
                className="h-11 w-full rounded-lg border border-border bg-background p-1"
                value={document.background}
                onChange={(event) =>
                  changeDocument((current) => ({ ...current, background: event.target.value }))
                }
              />
            </Field>
            <div>
              <div className="text-xs text-muted-foreground">Workspace palette</div>
              <div className="mt-2 flex gap-2">
                {[palette.primary, "#fbbf24", "#34d399", "#ffffff", "#0b1220"].map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Use ${color} background`}
                    className="h-9 w-9 rounded-full border border-white/20"
                    style={{ background: color }}
                    onClick={() => changeDocument((current) => ({ ...current, background: color }))}
                  />
                ))}
              </div>
            </div>
          </section>

          {selected?.type === "image" && <section className="space-y-5 rounded-xl border border-border p-4">
            {mobileTool === "Crop" ? <>
              <div className="grid grid-cols-3 gap-2">
                {[{label:"Original",ratio:null},{label:"Square",ratio:1},{label:"Portrait",ratio:0.8}].map(({label,ratio}) => <Button key={label} variant="outline" className="min-h-11" onClick={() => {
                  const asset = mediaAssets.data?.find((item) => item.id === selected.assetId);
                  const sourceRatio = (asset?.width ?? selected.width) / (asset?.height ?? selected.height);
                  const width = ratio && sourceRatio > ratio ? ratio / sourceRatio : 1;
                  const height = ratio && sourceRatio < ratio ? sourceRatio / ratio : 1;
                  updateElement(selected.id, { crop: { x: (1-width)/2, y: (1-height)/2, width, height }, ...(ratio ? { height: selected.width / ratio } : {}) });
                }}>{label}</Button>)}
              </div>
              <Button variant="outline" className="min-h-11 w-full" onClick={() => updateElement(selected.id, { rotation: ((selected.rotation ?? 0) + 90) % 360 })}><RotateCw /> Rotate 90°</Button>
            </> : ["brightness", "contrast", "saturation"].map((key) => {
              const metric = key as "brightness" | "contrast" | "saturation";
              return <label key={key} className="block space-y-3"><span className="flex justify-between text-sm capitalize">{key}<span className="text-primary">{selected[metric] ?? 100}%</span></span><Slider aria-label={key} value={[selected[metric] ?? 100]} min={0} max={200} step={1} onValueChange={([value]) => updateElement(selected.id, { [key]: value })} /></label>;
            })}
          </section>}

          <div className={cn(mobileTool !== "Edit" && "hidden sm:block")}>
          {selected ? (
            <ElementInspector
              element={selected}
              canvasWidth={format.width}
              canvasHeight={format.height}
              onChange={(patch) => updateElement(selected.id, patch)}
              onDuplicate={() => duplicateElement(selected.id)}
              onRemove={() => removeElement(selected.id)}
              canMoveBack={selectedIndex > 0}
              canMoveFront={selectedIndex < document.elements.length - 1}
              onMoveBack={() => moveLayer(selected.id, -1)}
              onMoveFront={() => moveLayer(selected.id, 1)}
            />
          ) : (
            <section className="surface-card p-4 text-sm text-muted-foreground">
              Select a layer to edit it.
            </section>
          )}
          </div>
        </MobileToolPanel>
      </div>

      {mobileStarted && <div className="space-y-4 sm:hidden">
        <div className="grid grid-cols-4 gap-1" aria-label="Editing tools">
          {(photoMode ? [{label:"Media",icon:ImageIcon},{label:"Crop",icon:Crop},{label:"Adjust",icon:SlidersHorizontal},{label:"Brand",icon:WandSparkles},{label:"Layers",icon:Layers3},{label:"Edit",icon:SlidersHorizontal},{label:"Canvas",icon:Square}] : [{label:"Add",icon:Plus},{label:"Media",icon:ImageIcon},{label:"Brand",icon:WandSparkles},{label:"Templates",icon:Square},{label:"Layers",icon:Layers3},{label:"Edit",icon:SlidersHorizontal},{label:"Canvas",icon:Crop}]).map(({label,icon:Icon}) => <Button key={label} variant="ghost" className="h-auto min-h-16 flex-col gap-2 px-1 text-[10px]" onClick={() => setMobileTool(label)}><span className="grid size-10 place-items-center rounded-xl border border-border-strong bg-elevated"><Icon className="text-primary" /></span>{label}</Button>)}
        </div>
        <div className="rounded-2xl border border-border-strong bg-gradient-to-br from-primary/10 to-surface p-4">
          <p className="mb-3 text-sm font-semibold">Done with your design?</p>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" className="min-h-20 flex-col gap-2 whitespace-normal px-1 text-xs" onClick={() => void saveServerDraft()} disabled={workflowDraft.save.isPending}><Save /> Save Draft</Button>
            <Button variant="outline" className="min-h-20 flex-col gap-2 whitespace-normal px-1 text-xs" onClick={() => void sendToPost("feed")} disabled={uploadAsset.isPending}><ImagePlus /> Post to Feed</Button>
            <Button variant="outline" className="min-h-20 flex-col gap-2 whitespace-normal px-1 text-xs" onClick={() => void sendToPost("story")} disabled={uploadAsset.isPending}><ImagePlus /> Post to Story</Button>
          </div>
          <Button variant="outline" className="mt-3 min-h-11 w-full" onClick={exportPng}><Download /> Export PNG</Button>
          <Button variant="ghost" className="mt-2 min-h-11 w-full" onClick={() => saveDesign.mutate()} disabled={saveDesign.isPending}><Save /> Save editable design</Button>
        </div>
      </div>}
    </div>
  );
}

function ElementInspector({
  element,
  canvasWidth,
  canvasHeight,
  onChange,
  onDuplicate,
  onRemove,
  canMoveBack,
  canMoveFront,
  onMoveBack,
  onMoveFront,
}: {
  element: DesignElement;
  canvasWidth: number;
  canvasHeight: number;
  onChange: (patch: Partial<DesignElement>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  canMoveBack: boolean;
  canMoveFront: boolean;
  onMoveBack: () => void;
  onMoveFront: () => void;
}) {
  const number = (event: ChangeEvent<HTMLInputElement>) => Number(event.target.value);
  return (
    <section className="surface-card space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="truncate text-sm font-semibold">{element.name}</h2>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" aria-label="Duplicate layer" onClick={onDuplicate}>
            <Copy />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Delete layer" onClick={onRemove}>
            <Trash2 />
          </Button>
        </div>
      </div>
      {element.type === "text" ? (
        <>
          <Field label="Text">
            <textarea
              className={textareaClass}
              rows={3}
              value={element.text}
              onChange={(event) => onChange({ text: event.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Size">
              <input
                className={inputClass}
                type="number"
                min={12}
                max={240}
                value={element.fontSize}
                onChange={(event) => onChange({ fontSize: number(event) })}
              />
            </Field>
            <Field label="Weight">
              <select
                className={inputClass}
                value={element.fontWeight}
                onChange={(event) =>
                  onChange({ fontWeight: Number(event.target.value) as TextElement["fontWeight"] })
                }
              >
                <option value={400}>Regular</option>
                <option value={600}>Semibold</option>
                <option value={700}>Bold</option>
              </select>
            </Field>
            <Field label="Alignment">
              <select
                className={inputClass}
                value={element.align}
                onChange={(event) => onChange({ align: event.target.value as CanvasTextAlign })}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </Field>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Width">
            <input
              className={inputClass}
              type="number"
              min={20}
              max={canvasWidth}
              value={element.width}
              onChange={(event) => onChange({ width: number(event) })}
            />
          </Field>
          <Field label="Height">
            <input
              className={inputClass}
              type="number"
              min={20}
              max={canvasHeight}
              value={element.height}
              onChange={(event) => onChange({ height: number(event) })}
            />
          </Field>
        </div>
      )}
      {element.type !== "image" && (
        <Field label="Color">
          <input
            type="color"
            className="h-11 w-full rounded-lg border border-border bg-background p-1"
            value={element.color}
            onChange={(event) => onChange({ color: event.target.value })}
          />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Opacity">
          <input
            className={inputClass}
            type="number"
            min={0.05}
            max={1}
            step={0.05}
            value={element.opacity ?? 1}
            onChange={(event) => onChange({ opacity: number(event) })}
          />
        </Field>
        <Field label="Rotation">
          <input
            className={inputClass}
            type="number"
            min={-180}
            max={180}
            value={element.rotation ?? 0}
            onChange={(event) => onChange({ rotation: number(event) })}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="X position">
          <input
            className={inputClass}
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={element.x}
            onChange={(event) => onChange({ x: number(event) })}
          />
        </Field>
        <Field label="Y position">
          <input
            className={inputClass}
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={element.y}
            onChange={(event) => onChange({ y: number(event) })}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" disabled={!canMoveBack} onClick={onMoveBack}>
          <SendToBack /> Back
        </Button>
        <Button variant="outline" size="sm" disabled={!canMoveFront} onClick={onMoveFront}>
          <BringToFront /> Front
        </Button>
      </div>
    </section>
  );
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Type;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button variant="outline"
      type="button"
      onClick={onClick}
      className="flex min-h-12 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-elevated"
    >
      <Icon className="h-4 w-4 text-primary" /> {label}
    </Button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

const inputClass =
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";
const textareaClass =
  "w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary";
