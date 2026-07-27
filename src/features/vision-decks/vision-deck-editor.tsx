import {
  Archive,
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  Eye,
  ImageIcon,
  Loader2,
  Plus,
  Save,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { URL_VALIDATION_MESSAGE, isValidHttpsUrl } from "@/lib/url-validation";
import { supabase } from "@/integrations/supabase/client";
import { VisionPresentation } from "./vision-presentation";
import { VisionLogo } from "./vision-logo";
import {
  newVisionId,
  VISION_ASSETS_BUCKET,
  type VisionDeck,
  type VisionDeckContent,
  type VisionReferenceKind,
} from "./types";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const ACCEPTED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export interface VisionDeckSavePayload {
  title: string;
  company_name: string;
  prospect_name: string | null;
  prospect_email: string | null;
  accent_color: string;
  content: VisionDeckContent;
}

interface VisionDeckEditorProps {
  deck: VisionDeck;
  isSaving: boolean;
  onSave: (payload: VisionDeckSavePayload) => Promise<void>;
  onPublish: (payload: VisionDeckSavePayload) => Promise<void>;
  onDisableShare: () => Promise<void>;
  onArchive: () => Promise<void>;
  onDuplicate: () => Promise<unknown>;
}

export function VisionDeckEditor({
  deck,
  isSaving,
  onSave,
  onPublish,
  onDisableShare,
  onArchive,
  onDuplicate,
}: VisionDeckEditorProps) {
  const [draft, setDraft] = useState(deck);
  const [previewing, setPreviewing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(deck);
    setDirty(false);
  }, [deck]);

  const updateDeck = <K extends keyof VisionDeck>(key: K, value: VisionDeck[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const updateContent = <K extends keyof VisionDeckContent>(
    key: K,
    value: VisionDeckContent[K],
  ) => {
    setDraft((current) => ({
      ...current,
      content: { ...current.content, [key]: value },
    }));
    setDirty(true);
  };

  const branding = draft.content.branding;
  const companyLogo = branding?.companyLogo;

  const setCompanyLogo = (logo: NonNullable<VisionDeckContent["branding"]>["companyLogo"] | undefined) => {
    updateContent("branding", {
      ...(draft.content.branding ?? {}),
      companyLogo: logo,
    });
  };

  const handleLogoFile = async (file: File) => {
    if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
      toast.error("Use a PNG, JPG, WEBP, or SVG image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Logo must be 5 MB or smaller.");
      return;
    }
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const path = `${deck.id}/logos/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from(VISION_ASSETS_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      setCompanyLogo({
        storagePath: path,
        alt: companyLogo?.alt || `${draft.company_name} logo`,
        fit: companyLogo?.fit || "contain",
      });
      toast.success("Logo uploaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const payload: VisionDeckSavePayload = {
    title: draft.title.trim() || "Untitled vision",
    company_name: draft.company_name.trim() || "Untitled prospect",
    prospect_name: draft.prospect_name?.trim() || null,
    prospect_email: draft.prospect_email?.trim() || null,
    accent_color: draft.accent_color,
    content: draft.content,
  };

  const save = async () => {
    await onSave(payload);
    setDirty(false);
  };

  const publish = async () => {
    await onPublish(payload);
    setDirty(false);
  };

  const shareUrl =
    typeof window === "undefined"
      ? `/vision/${deck.share_token}`
      : `${window.location.origin}/vision/${deck.share_token}`;

  return (
    <>
      <div className="space-y-5">
        <div className="surface-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1",
                    deck.share_enabled
                      ? "bg-success/12 text-success ring-success/30"
                      : "bg-elevated text-muted-foreground ring-border",
                  )}
                >
                  {deck.share_enabled ? "Live" : "Draft"}
                </span>
                {dirty && <span className="text-[10px] text-warning">Unsaved changes</span>}
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Updated {new Date(deck.updated_at).toLocaleString()}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setPreviewing(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-2"
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
              </button>
              <button
                onClick={save}
                disabled={isSaving || !dirty}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-40"
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save
              </button>
              <button
                onClick={publish}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                {deck.share_enabled ? "Update live deck" : "Publish link"}
              </button>
            </div>
          </div>

          {deck.share_enabled && (
            <div className="flex flex-col gap-3 border-b border-border/60 bg-success/[0.035] px-4 py-3 sm:flex-row sm:items-center sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-success">
                  Private prospect link
                </p>
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{shareUrl}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(shareUrl)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground hover:bg-elevated"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground hover:bg-elevated"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open
                </a>
                <button
                  onClick={onDisableShare}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Disable
                </button>
              </div>
            </div>
          )}
        </div>

        <Tabs defaultValue="story" className="w-full">
          <TabsList className="grid h-auto w-full grid-cols-3 sm:inline-flex sm:w-auto">
            <TabsTrigger value="story">Story</TabsTrigger>
            <TabsTrigger value="experience">Experience</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="story" className="mt-4 space-y-4">
            <EditorSection title="Deck identity" description="Internal organization and prospect details." defaultOpen>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Internal title">
                  <Input value={draft.title} onChange={(value) => updateDeck("title", value)} placeholder="Acme 2026 content vision" />
                </Field>
                <Field label="Company name">
                  <Input value={draft.company_name} onChange={(value) => updateDeck("company_name", value)} placeholder="Acme Company" />
                </Field>
                <Field label="Prospect name">
                  <Input value={draft.prospect_name ?? ""} onChange={(value) => updateDeck("prospect_name", value)} placeholder="Jordan Lee" />
                </Field>
                <Field label="Prospect email" hint="Internal only; never exposed in the presentation.">
                  <Input type="email" value={draft.prospect_email ?? ""} onChange={(value) => updateDeck("prospect_email", value)} placeholder="jordan@example.com" />
                </Field>
              </div>
            </EditorSection>

            <EditorSection title="Opening" description="The first impression and core promise." defaultOpen>
              <div className="space-y-4">
                <Field label="Eyebrow">
                  <Input value={draft.content.cover.eyebrow} onChange={(eyebrow) => updateContent("cover", { ...draft.content.cover, eyebrow })} />
                </Field>
                <Field label="Headline">
                  <Textarea value={draft.content.cover.headline} onChange={(headline) => updateContent("cover", { ...draft.content.cover, headline })} rows={3} />
                </Field>
                <Field label="Supporting statement">
                  <Textarea value={draft.content.cover.subhead} onChange={(subhead) => updateContent("cover", { ...draft.content.cover, subhead })} rows={3} />
                </Field>
              </div>
            </EditorSection>

            <EditorSection title="What we heard" description="Meeting summary, goals, obstacles, and target audience.">
              <div className="space-y-4">
                <Field label="Meeting summary">
                  <Textarea value={draft.content.discovery.summary} onChange={(summary) => updateContent("discovery", { ...draft.content.discovery, summary })} rows={5} />
                </Field>
                <Field label="Audience">
                  <Textarea value={draft.content.discovery.audience} onChange={(audience) => updateContent("discovery", { ...draft.content.discovery, audience })} rows={2} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Goals" hint="One item per line.">
                    <Textarea value={draft.content.discovery.goals.join("\n")} onChange={(value) => updateContent("discovery", { ...draft.content.discovery, goals: lines(value) })} rows={6} />
                  </Field>
                  <Field label="Challenges" hint="One item per line.">
                    <Textarea value={draft.content.discovery.challenges.join("\n")} onChange={(value) => updateContent("discovery", { ...draft.content.discovery, challenges: lines(value) })} rows={6} />
                  </Field>
                </div>
              </div>
            </EditorSection>

            <EditorSection title="Creative direction" description="Define the feeling, narrative, and reference material.">
              <div className="space-y-4">
                <Field label="Direction title">
                  <Input value={draft.content.direction.title} onChange={(title) => updateContent("direction", { ...draft.content.direction, title })} />
                </Field>
                <Field label="Creative narrative">
                  <Textarea value={draft.content.direction.narrative} onChange={(narrative) => updateContent("direction", { ...draft.content.direction, narrative })} rows={4} />
                </Field>
                <Field label="Creative keywords" hint="Separate with commas.">
                  <Input
                    value={draft.content.direction.keywords.join(", ")}
                    onChange={(value) =>
                      updateContent("direction", {
                        ...draft.content.direction,
                        keywords: value.split(",").map((item) => item.trim()).filter(Boolean),
                      })
                    }
                  />
                </Field>
                <RepeaterHeader
                  title="References"
                  actionLabel="Add reference"
                  onAdd={() =>
                    updateContent("direction", {
                      ...draft.content.direction,
                      references: [
                        ...draft.content.direction.references,
                        { id: newVisionId("reference"), kind: "image", label: "New reference", url: "", note: "" },
                      ],
                    })
                  }
                />
                <div className="space-y-3">
                  {draft.content.direction.references.map((reference, referenceIndex) => (
                    <div key={reference.id} className="rounded-2xl border border-border bg-elevated/35 p-4">
                      <div className="grid gap-3 sm:grid-cols-[8rem_1fr_1fr_auto]">
                        <select
                          value={reference.kind}
                          onChange={(event) => {
                            const references = [...draft.content.direction.references];
                            references[referenceIndex] = { ...reference, kind: event.target.value as VisionReferenceKind };
                            updateContent("direction", { ...draft.content.direction, references });
                          }}
                          className={inputClass}
                        >
                          <option value="image">Image</option>
                          <option value="video">Video</option>
                          <option value="link">Link</option>
                        </select>
                        <input
                          value={reference.label}
                          onChange={(event) => {
                            const references = [...draft.content.direction.references];
                            references[referenceIndex] = { ...reference, label: event.target.value };
                            updateContent("direction", { ...draft.content.direction, references });
                          }}
                          placeholder="Reference label"
                          className={inputClass}
                        />
                        <input
                          value={reference.url}
                          onChange={(event) => {
                            const references = [...draft.content.direction.references];
                            references[referenceIndex] = { ...reference, url: event.target.value };
                            updateContent("direction", { ...draft.content.direction, references });
                          }}
                          placeholder="https://…"
                          className={inputClass}
                        />
                        <button
                          onClick={() =>
                            updateContent("direction", {
                              ...draft.content.direction,
                              references: draft.content.direction.references.filter((item) => item.id !== reference.id),
                            })
                          }
                          className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Remove reference"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <textarea
                        value={reference.note}
                        onChange={(event) => {
                          const references = [...draft.content.direction.references];
                          references[referenceIndex] = { ...reference, note: event.target.value };
                          updateContent("direction", { ...draft.content.direction, references });
                        }}
                        placeholder="Why this reference matters…"
                        rows={2}
                        className={cn(inputClass, "mt-3 resize-y")}
                      />
                      {reference.url && !isValidHttpsUrl(reference.url) && (
                        <p className="mt-2 text-[11px] text-warning">{URL_VALIDATION_MESSAGE}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </EditorSection>
          </TabsContent>

          <TabsContent value="experience" className="mt-4 space-y-4">
            <EditorSection title="Content system" description="Show how the proposed deliverables work together." defaultOpen>
              <div className="space-y-4">
                <Field label="Content-system narrative">
                  <Textarea value={draft.content.plan.narrative} onChange={(narrative) => updateContent("plan", { ...draft.content.plan, narrative })} rows={4} />
                </Field>
                <RepeaterHeader
                  title="Deliverables"
                  actionLabel="Add deliverable"
                  onAdd={() =>
                    updateContent("plan", {
                      ...draft.content.plan,
                      deliverables: [
                        ...draft.content.plan.deliverables,
                        { id: newVisionId("deliverable"), quantity: 1, title: "New deliverable", description: "", platform: "Cross-platform" },
                      ],
                    })
                  }
                />
                <div className="space-y-3">
                  {draft.content.plan.deliverables.map((item, itemIndex) => (
                    <div key={item.id} className="rounded-2xl border border-border bg-elevated/35 p-4">
                      <div className="grid gap-3 sm:grid-cols-[5rem_1fr_1fr_auto]">
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(event) => {
                            const deliverables = [...draft.content.plan.deliverables];
                            deliverables[itemIndex] = { ...item, quantity: Math.max(1, Number(event.target.value) || 1) };
                            updateContent("plan", { ...draft.content.plan, deliverables });
                          }}
                          className={inputClass}
                        />
                        <input
                          value={item.title}
                          onChange={(event) => {
                            const deliverables = [...draft.content.plan.deliverables];
                            deliverables[itemIndex] = { ...item, title: event.target.value };
                            updateContent("plan", { ...draft.content.plan, deliverables });
                          }}
                          placeholder="Deliverable"
                          className={inputClass}
                        />
                        <input
                          value={item.platform}
                          onChange={(event) => {
                            const deliverables = [...draft.content.plan.deliverables];
                            deliverables[itemIndex] = { ...item, platform: event.target.value };
                            updateContent("plan", { ...draft.content.plan, deliverables });
                          }}
                          placeholder="Platform"
                          className={inputClass}
                        />
                        <button
                          onClick={() =>
                            updateContent("plan", {
                              ...draft.content.plan,
                              deliverables: draft.content.plan.deliverables.filter((deliverable) => deliverable.id !== item.id),
                            })
                          }
                          className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Remove deliverable"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <textarea
                        value={item.description}
                        onChange={(event) => {
                          const deliverables = [...draft.content.plan.deliverables];
                          deliverables[itemIndex] = { ...item, description: event.target.value };
                          updateContent("plan", { ...draft.content.plan, deliverables });
                        }}
                        placeholder="What this deliverable does…"
                        rows={2}
                        className={cn(inputClass, "mt-3 resize-y")}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </EditorSection>

            <EditorSection title="Vertical social preview" description="Configure the interactive phone concept.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Social handle">
                  <Input value={draft.content.social.handle} onChange={(handle) => updateContent("social", { ...draft.content.social, handle })} />
                </Field>
                <Field label="Button label">
                  <Input value={draft.content.social.callToAction} onChange={(callToAction) => updateContent("social", { ...draft.content.social, callToAction })} />
                </Field>
                <Field label="Hook">
                  <Textarea value={draft.content.social.hook} onChange={(hook) => updateContent("social", { ...draft.content.social, hook })} rows={3} />
                </Field>
                <Field label="Caption">
                  <Textarea value={draft.content.social.caption} onChange={(caption) => updateContent("social", { ...draft.content.social, caption })} rows={3} />
                </Field>
                <Field label="Direct MP4/WebM URL" hint="YouTube and Vimeo URLs open as references.">
                  <Input value={draft.content.social.videoUrl} onChange={(videoUrl) => updateContent("social", { ...draft.content.social, videoUrl })} placeholder="https://…/concept.mp4" />
                </Field>
                <Field label="Poster image URL">
                  <Input value={draft.content.social.posterUrl} onChange={(posterUrl) => updateContent("social", { ...draft.content.social, posterUrl })} placeholder="https://…/poster.webp" />
                </Field>
              </div>
            </EditorSection>

            <EditorSection title="ROI scenario" description="Set transparent, editable planning assumptions—not promises.">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {(
                  [
                    ["investment", "Investment", 500],
                    ["months", "Months", 1],
                    ["videosPerMonth", "Videos / month", 1],
                    ["averageViews", "Average views", 100],
                    ["clickRate", "Click rate (%)", 0.1],
                    ["leadRate", "Inquiry rate (%)", 0.1],
                    ["closeRate", "Close rate (%)", 0.1],
                    ["customerValue", "Customer value", 100],
                  ] as const
                ).map(([key, label, step]) => (
                  <Field key={key} label={label}>
                    <input
                      type="number"
                      min={0}
                      step={step}
                      value={draft.content.roi[key]}
                      onChange={(event) =>
                        updateContent("roi", { ...draft.content.roi, [key]: Math.max(0, Number(event.target.value) || 0) })
                      }
                      className={inputClass}
                    />
                  </Field>
                ))}
              </div>
              <p className="mt-4 rounded-xl border border-warning/20 bg-warning/[0.04] px-3 py-2 text-xs leading-relaxed text-warning">
                The published presentation labels all ROI figures as scenarios. Only use assumptions your team can explain and defend.
              </p>
            </EditorSection>
<EditorSection
  title="Package comparison"
            <EditorSection title="Roadmap" description="Explain how Dream Wave moves the concept into production.">
              <RepeaterHeader
                title="Phases"
                actionLabel="Add phase"
                onAdd={() =>
                  updateContent("timeline", [
                    ...draft.content.timeline,
                    { id: newVisionId("timeline"), phase: "New phase", timing: "TBD", detail: "" },
                  ])
                }
              />
              <div className="mt-3 space-y-3">
                {draft.content.timeline.map((step, stepIndex) => (
                  <div key={step.id} className="rounded-2xl border border-border bg-elevated/35 p-4">
                    <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto]">
                      <input
                        value={step.phase}
                        onChange={(event) => {
                          const timeline = [...draft.content.timeline];
                          timeline[stepIndex] = { ...step, phase: event.target.value };
                          updateContent("timeline", timeline);
                        }}
                        className={inputClass}
                      />
                      <input
                        value={step.timing}
                        onChange={(event) => {
                          const timeline = [...draft.content.timeline];
                          timeline[stepIndex] = { ...step, timing: event.target.value };
                          updateContent("timeline", timeline);
                        }}
                        className={inputClass}
                      />
                      <div className="flex items-center gap-1">
                        <OrderButton
                          icon={ArrowUp}
                          label="Move phase up"
                          disabled={stepIndex === 0}
                          onClick={() => updateContent("timeline", move(draft.content.timeline, stepIndex, stepIndex - 1))}
                        />
                        <OrderButton
                          icon={ArrowDown}
                          label="Move phase down"
                          disabled={stepIndex === draft.content.timeline.length - 1}
                          onClick={() => updateContent("timeline", move(draft.content.timeline, stepIndex, stepIndex + 1))}
                        />
                        <button
                          onClick={() => updateContent("timeline", draft.content.timeline.filter((item) => item.id !== step.id))}
                          className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Remove phase"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={step.detail}
                      onChange={(event) => {
                        const timeline = [...draft.content.timeline];
                        timeline[stepIndex] = { ...step, detail: event.target.value };
                        updateContent("timeline", timeline);
                      }}
                      rows={2}
                      className={cn(inputClass, "mt-3 resize-y")}
                    />
                  </div>
                ))}
              </div>
            </EditorSection>

            <EditorSection title="Closing" description="End with a confident, specific next step.">
              <div className="space-y-4">
                <Field label="Headline">
                  <Textarea value={draft.content.close.headline} onChange={(headline) => updateContent("close", { ...draft.content.close, headline })} rows={3} />
                </Field>
                <Field label="Supporting statement">
                  <Textarea value={draft.content.close.body} onChange={(body) => updateContent("close", { ...draft.content.close, body })} rows={3} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Button label">
                    <Input value={draft.content.close.callToActionLabel} onChange={(callToActionLabel) => updateContent("close", { ...draft.content.close, callToActionLabel })} />
                  </Field>
                  <Field label="Button URL">
                    <Input value={draft.content.close.callToActionUrl} onChange={(callToActionUrl) => updateContent("close", { ...draft.content.close, callToActionUrl })} placeholder="https://cal.com/…" />
                  </Field>
                </div>
              </div>
            </EditorSection>
          </TabsContent>

          <TabsContent value="settings" className="mt-4 space-y-4">
            <div className="surface-card p-5">
              <h2 className="text-sm font-semibold text-foreground">Client branding</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Upload the prospect's logo (PNG, JPG, WEBP, or SVG, up to 5 MB). Stored in the private
                <span className="mx-1 font-mono text-[11px] text-foreground">vision-deck-assets</span>
                bucket and served through a signed, token-gated URL on the shared presentation.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-[10rem_1fr]">
                <div className="flex h-40 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-elevated/40 p-3">
                  {companyLogo?.storagePath ? (
                    <VisionLogo
                      storagePath={companyLogo.storagePath}
                      alt={companyLogo.alt}
                      fit={companyLogo.fit}
                      className="max-h-full max-w-full"
                    />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <ImageIcon className="mx-auto h-6 w-6 opacity-60" />
                      <p className="mt-2 text-[11px]">No logo uploaded</p>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED_LOGO_TYPES.join(",")}
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void handleLogoFile(file);
                      }}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingLogo}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
                    >
                      {uploadingLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      {companyLogo?.storagePath ? "Replace logo" : "Upload logo"}
                    </button>
                    {companyLogo?.storagePath && (
                      <button
                        onClick={() => setCompanyLogo(undefined)}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    )}
                  </div>
                  <Field label="Alt text" hint="Describes the logo for screen readers.">
                    <Input
                      value={companyLogo?.alt ?? ""}
                      onChange={(alt) => {
                        if (!companyLogo) return;
                        setCompanyLogo({ ...companyLogo, alt });
                      }}
                      placeholder={`${draft.company_name} logo`}
                    />
                  </Field>
                  <Field label="Fit">
                    <select
                      value={companyLogo?.fit ?? "contain"}
                      onChange={(event) => {
                        if (!companyLogo) return;
                        setCompanyLogo({ ...companyLogo, fit: event.target.value as "contain" | "cover" });
                      }}
                      disabled={!companyLogo}
                      className={inputClass}
                    >
                      <option value="contain">Contain (letterbox)</option>
                      <option value="cover">Cover (fill)</option>
                    </select>
                  </Field>
                  <p className="text-[11px] text-muted-foreground">
                    Removing the logo here only clears the reference; the file is preserved so duplicated decks keep working.
                  </p>
                </div>
              </div>
            </div>

            <div className="surface-card p-5">
              <h2 className="text-sm font-semibold text-foreground">Presentation theme</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose a six-digit hex color for this prospect's visual accent.
              </p>
              <div className="mt-4 flex max-w-md items-center gap-3">
                <input
                  type="color"
                  value={draft.accent_color}
                  onChange={(event) => updateDeck("accent_color", event.target.value)}
                  className="h-11 w-14 cursor-pointer rounded-lg border border-input bg-surface p-1"
                />
                <Input
                  value={draft.accent_color}
                  onChange={(value) => {
                    if (/^#[0-9a-f]{0,6}$/i.test(value)) updateDeck("accent_color", value);
                  }}
                />
              </div>
            </div>

            <div className="surface-card p-5">
              <h2 className="text-sm font-semibold text-foreground">Deck actions</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Duplicate creates an independent draft. Archive removes this deck from the active studio list and disables its prospect link.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={onDuplicate}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-2"
                >
                  <Copy className="h-3.5 w-3.5" /> Duplicate deck
                </button>
                <button
                  onClick={onArchive}
                  className="inline-flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/[0.05] px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10"
                >
                  <Archive className="h-3.5 w-3.5" /> Archive deck
                </button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {previewing && (
        <VisionPresentation deck={{ ...draft, ...payload }} onClose={() => setPreviewing(false)} />
      )}
    </>
  );
}

function EditorSection({
  title,
  description,
  defaultOpen,
  children,
}: {
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Accordion type="single" collapsible defaultValue={defaultOpen ? "content" : undefined}>
      <AccordionItem value="content" className="surface-card border-b-0 px-5">
        <AccordionTrigger className="hover:no-underline">
          <div>
            <div className="text-left text-sm font-semibold text-foreground">{title}</div>
            <div className="mt-0.5 text-left text-xs font-normal text-muted-foreground">{description}</div>
          </div>
        </AccordionTrigger>
        <AccordionContent>{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {hint && <span className="ml-2 text-[10px] text-muted-foreground">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={inputClass}
    />
  );
}

function Textarea({ value, onChange, rows }: { value: string; onChange: (value: string) => void; rows: number }) {
  return (
    <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} className={cn(inputClass, "resize-y")} />
  );
}

function RepeaterHeader({ title, actionLabel, onAdd }: { title: string; actionLabel: string; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-elevated px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-surface-2"
      >
        <Plus className="h-3.5 w-3.5" /> {actionLabel}
      </button>
    </div>
  );
}

function OrderButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof ArrowUp;
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg p-2 text-muted-foreground hover:bg-elevated hover:text-foreground disabled:opacity-25"
      aria-label={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

const inputClass =
  "w-full rounded-lg border border-input bg-surface/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/35";

function lines(value: string): string[] {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
