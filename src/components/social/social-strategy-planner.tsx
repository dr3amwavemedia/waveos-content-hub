import { useMemo, useState } from "react";
import {
  BadgePercent,
  Boxes,
  CalendarDays,
  Check,
  ChevronDown,
  Lightbulb,
  Megaphone,
  Package,
  Pencil,
  Plus,
  Rocket,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  useCreateStrategyItem,
  useDeleteStrategyItem,
  useStrategyItems,
  useUpdateStrategyItem,
  type SocialStrategyItem,
  type StrategyKind,
  type StrategyStatus,
} from "@/hooks/use-social-planning";
import { ALL_PLATFORMS, PLATFORM_LABEL, type SocialPlatform } from "@/hooks/use-content";
import { cn } from "@/lib/utils";

const KIND_META: Record<StrategyKind, { label: string; icon: LucideIcon; tone: string }> = {
  idea: { label: "Idea", icon: Lightbulb, tone: "text-sky-300 bg-sky-400/10 border-sky-400/25" },
  campaign: {
    label: "Campaign",
    icon: Megaphone,
    tone: "text-violet-300 bg-violet-400/10 border-violet-400/25",
  },
  product: {
    label: "Product",
    icon: Package,
    tone: "text-teal-300 bg-teal-400/10 border-teal-400/25",
  },
  promotion: {
    label: "Deal",
    icon: BadgePercent,
    tone: "text-amber-300 bg-amber-400/10 border-amber-400/25",
  },
  launch: {
    label: "Launch",
    icon: Rocket,
    tone: "text-rose-300 bg-rose-400/10 border-rose-400/25",
  },
  announcement: {
    label: "Announcement",
    icon: Boxes,
    tone: "text-indigo-300 bg-indigo-400/10 border-indigo-400/25",
  },
};

const STATUS_META: Array<{ id: StrategyStatus; label: string; dot: string }> = [
  { id: "idea", label: "Ideas", dot: "bg-sky-400" },
  { id: "planned", label: "Planned", dot: "bg-violet-400" },
  { id: "in_progress", label: "In progress", dot: "bg-indigo-400" },
  { id: "awaiting_approval", label: "Approval", dot: "bg-amber-400" },
  { id: "scheduled", label: "Scheduled", dot: "bg-teal-400" },
  { id: "completed", label: "Complete", dot: "bg-emerald-400" },
];

interface StrategyDraft {
  title: string;
  details: string;
  item_kind: StrategyKind;
  status: StrategyStatus;
  priority: "low" | "normal" | "high";
  start_date: string;
  end_date: string;
  platforms: string[];
}

function monthDateValue(month: Date) {
  const today = new Date();
  const day =
    today.getFullYear() === month.getFullYear() && today.getMonth() === month.getMonth()
      ? today.getDate()
      : 1;
  return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function emptyDraft(month: Date): StrategyDraft {
  return {
    title: "",
    details: "",
    item_kind: "idea",
    status: "idea",
    priority: "normal",
    start_date: monthDateValue(month),
    end_date: "",
    platforms: [],
  };
}

export function SocialStrategyPlanner({
  workspaceId,
  month,
}: {
  workspaceId: string;
  month: Date;
}) {
  const itemsQuery = useStrategyItems(workspaceId, month);
  const createItem = useCreateStrategyItem(workspaceId);
  const updateItem = useUpdateStrategyItem(workspaceId);
  const deleteItem = useDeleteStrategyItem(workspaceId);
  const [editing, setEditing] = useState<SocialStrategyItem | "new" | null>(null);
  const [draft, setDraft] = useState<StrategyDraft>(() => emptyDraft(month));

  const grouped = useMemo(() => {
    const map = new Map<StrategyStatus, SocialStrategyItem[]>(
      STATUS_META.map((status) => [status.id, []]),
    );
    (itemsQuery.data ?? []).forEach((item) => map.get(item.status)?.push(item));
    return map;
  }, [itemsQuery.data]);

  function openNew(status: StrategyStatus = "idea") {
    setDraft({ ...emptyDraft(month), status });
    setEditing("new");
  }

  function openEdit(item: SocialStrategyItem) {
    setDraft({
      title: item.title,
      details: item.details ?? "",
      item_kind: item.item_kind,
      status: item.status,
      priority: item.priority,
      start_date: item.start_date,
      end_date: item.end_date ?? "",
      platforms: item.platforms,
    });
    setEditing(item);
  }

  async function save() {
    if (!draft.title.trim()) {
      toast.error("Give this plan item a title.");
      return;
    }
    try {
      const payload = {
        ...draft,
        title: draft.title.trim(),
        details: draft.details.trim() || null,
        end_date: draft.end_date || null,
      };
      if (editing === "new") {
        await createItem.mutateAsync(payload);
        toast.success("Plan item added");
      } else if (editing) {
        await updateItem.mutateAsync({ id: editing.id, patch: payload });
        toast.success("Plan item updated");
      }
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this plan item.");
    }
  }

  async function move(item: SocialStrategyItem, status: StrategyStatus) {
    try {
      await updateItem.mutateAsync({ id: item.id, patch: { status } });
      toast.success(
        `Moved to ${STATUS_META.find((option) => option.id === status)?.label ?? status}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the status.");
    }
  }

  async function remove(item: SocialStrategyItem) {
    if (!window.confirm(`Delete “${item.title}”? This cannot be undone.`)) return;
    try {
      await deleteItem.mutateAsync(item.id);
      setEditing(null);
      toast.success("Plan item deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete this plan item.");
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">
            Monthly organizer
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-foreground">Ideas & strategy</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Keep products, deals, launches and content direction where the whole authorized team can
            find them.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openNew()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400"
        >
          <Plus className="h-4 w-4" /> Add plan item
        </button>
      </div>

      {itemsQuery.isLoading ? (
        <div className="rounded-2xl border border-border bg-surface/55 p-8 text-center text-sm text-muted-foreground">
          Loading the monthly plan…
        </div>
      ) : itemsQuery.error ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-6 text-sm text-rose-200">
          The monthly plan could not be loaded. No information was changed.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {STATUS_META.map((status) => {
            const items = grouped.get(status.id) ?? [];
            return (
              <div key={status.id} className="rounded-2xl border border-border bg-surface/45 p-3.5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", status.dot)} aria-hidden />
                    <h3 className="text-sm font-semibold text-foreground">{status.label}</h3>
                    <span className="rounded-full bg-elevated px-2 py-0.5 text-[10px] text-muted-foreground">
                      {items.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => openNew(status.id)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-elevated hover:text-foreground"
                    aria-label={`Add to ${status.label}`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  {items.map((item) => (
                    <StrategyCard
                      key={item.id}
                      item={item}
                      onEdit={() => openEdit(item)}
                      onMove={(next) => move(item, next)}
                    />
                  ))}
                  {items.length === 0 && (
                    <button
                      type="button"
                      onClick={() => openNew(status.id)}
                      className="w-full rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground hover:border-violet-400/30 hover:text-foreground"
                    >
                      Add something here
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <StrategyEditor
          draft={draft}
          setDraft={setDraft}
          isNew={editing === "new"}
          saving={createItem.isPending || updateItem.isPending}
          deleting={deleteItem.isPending}
          onSave={save}
          onClose={() => setEditing(null)}
          onDelete={editing === "new" ? undefined : () => remove(editing)}
        />
      )}
    </section>
  );
}

function StrategyCard({
  item,
  onEdit,
  onMove,
}: {
  item: SocialStrategyItem;
  onEdit: () => void;
  onMove: (status: StrategyStatus) => void;
}) {
  const meta = KIND_META[item.item_kind];
  const Icon = meta.icon;
  return (
    <article className="rounded-xl border border-border bg-background/35 p-3">
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
            meta.tone,
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
          <p className="line-clamp-2 text-sm font-semibold text-foreground">{item.title}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {new Date(`${item.start_date}T12:00:00`).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
            {item.priority === "high" ? " · High priority" : ""}
          </p>
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          aria-label={`Edit ${item.title}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
      {item.platforms.length > 0 && (
        <p className="mt-2 truncate text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          {item.platforms
            .map((platform) => PLATFORM_LABEL[platform as SocialPlatform] ?? platform)
            .join(" · ")}
        </p>
      )}
      <label className="relative mt-3 block">
        <span className="sr-only">Move {item.title}</span>
        <select
          value={item.status}
          onChange={(event) => onMove(event.target.value as StrategyStatus)}
          className="w-full appearance-none rounded-lg border border-border bg-elevated/60 px-2.5 py-1.5 pr-8 text-xs text-foreground outline-none"
        >
          {STATUS_META.map((status) => (
            <option key={status.id} value={status.id} className="bg-background">
              {status.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
      </label>
    </article>
  );
}

function StrategyEditor({
  draft,
  setDraft,
  isNew,
  saving,
  deleting,
  onSave,
  onClose,
  onDelete,
}: {
  draft: StrategyDraft;
  setDraft: (draft: StrategyDraft) => void;
  isNew: boolean;
  saving: boolean;
  deleting: boolean;
  onSave: () => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const togglePlatform = (platform: SocialPlatform) => {
    setDraft({
      ...draft,
      platforms: draft.platforms.includes(platform)
        ? draft.platforms.filter((value) => value !== platform)
        : [...draft.platforms, platform],
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={isNew ? "Add plan item" : "Edit plan item"}
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border bg-surface p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">
              Ideas & strategy
            </p>
            <h2 className="mt-1 text-xl font-semibold text-foreground">
              {isNew ? "Add to the monthly plan" : "Edit plan item"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-elevated hover:text-foreground"
            aria-label="Close editor"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="text-xs font-semibold text-muted-foreground">Title</span>
            <input
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              maxLength={180}
              autoFocus
              placeholder="Holiday offer, product launch, customer story…"
              className="mt-1.5 w-full rounded-xl border border-border bg-background/45 px-3 py-2.5 text-sm text-foreground outline-none focus:border-violet-400/50"
            />
          </label>
          <FieldSelect
            label="Type"
            value={draft.item_kind}
            onChange={(value) => setDraft({ ...draft, item_kind: value as StrategyKind })}
            options={Object.entries(KIND_META).map(([value, meta]) => ({
              value,
              label: meta.label,
            }))}
          />
          <FieldSelect
            label="Status"
            value={draft.status}
            onChange={(value) => setDraft({ ...draft, status: value as StrategyStatus })}
            options={STATUS_META.map((status) => ({ value: status.id, label: status.label }))}
          />
          <label>
            <span className="text-xs font-semibold text-muted-foreground">Start date</span>
            <input
              type="date"
              value={draft.start_date}
              onChange={(event) => setDraft({ ...draft, start_date: event.target.value })}
              className="mt-1.5 w-full rounded-xl border border-border bg-background/45 px-3 py-2.5 text-sm text-foreground"
            />
          </label>
          <label>
            <span className="text-xs font-semibold text-muted-foreground">End date (optional)</span>
            <input
              type="date"
              min={draft.start_date}
              value={draft.end_date}
              onChange={(event) => setDraft({ ...draft, end_date: event.target.value })}
              className="mt-1.5 w-full rounded-xl border border-border bg-background/45 px-3 py-2.5 text-sm text-foreground"
            />
          </label>
          <FieldSelect
            label="Priority"
            value={draft.priority}
            onChange={(value) =>
              setDraft({ ...draft, priority: value as StrategyDraft["priority"] })
            }
            options={[
              { value: "low", label: "Low" },
              { value: "normal", label: "Normal" },
              { value: "high", label: "High" },
            ]}
          />
          <div className="sm:col-span-2">
            <span className="text-xs font-semibold text-muted-foreground">Platforms</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {ALL_PLATFORMS.map((platform) => {
                const selected = draft.platforms.includes(platform);
                return (
                  <button
                    key={platform}
                    type="button"
                    onClick={() => togglePlatform(platform)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs",
                      selected
                        ? "border-violet-400/40 bg-violet-400/15 text-foreground"
                        : "border-border bg-background/35 text-muted-foreground",
                    )}
                  >
                    {selected && <Check className="h-3 w-3" />} {PLATFORM_LABEL[platform]}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="sm:col-span-2">
            <span className="text-xs font-semibold text-muted-foreground">
              Details staff and the client should know
            </span>
            <textarea
              value={draft.details}
              onChange={(event) => setDraft({ ...draft, details: event.target.value })}
              rows={5}
              placeholder="Product details, offer terms, links, talking points, restrictions…"
              className="mt-1.5 w-full resize-y rounded-xl border border-border bg-background/45 px-3 py-2.5 text-sm text-foreground outline-none focus:border-violet-400/50"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <div>
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-400/30 px-3 py-2 text-sm text-rose-300 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-10 rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <CalendarDays className="h-4 w-4" /> {saving ? "Saving…" : "Save item"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-xl border border-border bg-background/45 px-3 py-2.5 text-sm text-foreground"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-background">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
