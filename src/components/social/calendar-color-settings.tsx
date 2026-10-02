import { useEffect, useState } from "react";
import { Palette, RotateCcw, Save, X } from "lucide-react";
import { toast } from "sonner";

import {
  useCalendarCategories,
  useSetPersonalCalendarColor,
  useUpdateCalendarCategory,
  type CalendarCategory,
} from "@/hooks/use-social-planning";

export function CalendarColorSettings({
  workspaceId,
  open,
  onClose,
}: {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
}) {
  const categories = useCalendarCategories(workspaceId);
  const updateShared = useUpdateCalendarCategory(workspaceId);
  const updatePersonal = useSetPersonalCalendarColor(workspaceId);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Calendar colors"
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border bg-surface p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <Palette className="h-5 w-5" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">Calendar legend</p>
            </div>
            <h2 className="mt-2 text-xl font-semibold text-foreground">Names and colors</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Shared names keep the team consistent. Your personal color changes only how this
              calendar looks to you.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-elevated hover:text-foreground"
            aria-label="Close calendar colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {categories.isLoading ? (
          <div className="mt-6 rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">
            Loading colors…
          </div>
        ) : categories.error ? (
          <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5 text-sm text-amber-100">
            Calendar color storage is waiting for the new database migration. Existing calendar
            events are unchanged.
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {(categories.data ?? []).map((category) => (
              <CategoryEditor
                key={category.id}
                category={category}
                saving={updateShared.isPending || updatePersonal.isPending}
                onSaveShared={async (name, color) => {
                  try {
                    await updateShared.mutateAsync({ id: category.id, name, color });
                    toast.success("Shared calendar meaning updated");
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Could not update this category.",
                    );
                  }
                }}
                onSavePersonal={async (color) => {
                  try {
                    await updatePersonal.mutateAsync({ categoryKey: category.category_key, color });
                    toast.success("Your calendar color was saved");
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Could not save your color.",
                    );
                  }
                }}
              />
            ))}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryEditor({
  category,
  saving,
  onSaveShared,
  onSavePersonal,
}: {
  category: CalendarCategory;
  saving: boolean;
  onSaveShared: (name: string, color: string) => Promise<void>;
  onSavePersonal: (color: string) => Promise<void>;
}) {
  const [name, setName] = useState(category.name);
  const [sharedColor, setSharedColor] = useState(category.color);
  const [personalColor, setPersonalColor] = useState(category.effective_color);

  useEffect(() => {
    setName(category.name);
    setSharedColor(category.color);
    setPersonalColor(category.effective_color);
  }, [category]);

  return (
    <article className="rounded-2xl border border-border bg-background/35 p-4">
      <div className="flex items-center gap-3">
        <span
          className="h-4 w-4 shrink-0 rounded-full ring-2 ring-white/10"
          style={{ backgroundColor: personalColor }}
          aria-hidden
        />
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
          aria-label={`Shared name for ${category.name}`}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface/60 px-3 py-2 text-sm font-semibold text-foreground outline-none focus:border-primary/50"
        />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <ColorField label="Shared team color" color={sharedColor} onChange={setSharedColor} />
        <ColorField label="My display color" color={personalColor} onChange={setPersonalColor} />
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => setPersonalColor(sharedColor)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Match shared
        </button>
        <button
          type="button"
          disabled={saving || !name.trim()}
          onClick={() => void onSaveShared(name.trim(), sharedColor)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" /> Save shared
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void onSavePersonal(personalColor)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Palette className="h-3.5 w-3.5" /> Save mine
        </button>
      </div>
    </article>
  );
}

function ColorField({
  label,
  color,
  onChange,
}: {
  label: string;
  color: string;
  onChange: (color: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/45 px-3 py-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">{color.toUpperCase()}</span>
        <input
          type="color"
          value={color}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
        />
      </span>
    </label>
  );
}
