import {
  checklistRows,
  editChecklistRow,
  removeChecklistRow,
  toggleChecklistRow,
} from "@/lib/planning-checklist";

export function PlanningChecklistControls({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const rows = checklistRows(value);
  if (!rows.length) return null;
  return (
    <div className="space-y-2">
      <p role="status" className="text-xs text-muted-foreground">
        {rows.filter((row) => row.checked).length} of {rows.length} completed
      </p>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.index}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-border px-3 py-2"
          >
            <label className="flex min-h-11 min-w-0 flex-1 items-center gap-3">
              <input
                type="checkbox"
                disabled={disabled}
                checked={row.checked}
                onChange={() => onChange(toggleChecklistRow(value, row.index))}
              />
              <span
                className={`min-w-0 break-words text-sm ${row.checked ? "text-muted-foreground line-through" : ""}`}
              >
                {row.label}
              </span>
            </label>
            <button
              type="button"
              disabled={disabled}
              aria-label={`Edit ${row.label}`}
              onClick={() => {
                const text = window.prompt("Edit checklist item", row.label);
                if (text !== null) {
                  const next = editChecklistRow(value, row.index, text);
                  if (next.length <= 20000) onChange(next);
                }
              }}
              className="min-h-11 px-2 text-sm text-primary"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={disabled}
              aria-label={`Remove ${row.label}`}
              onClick={() => {
                if (window.confirm(`Remove "${row.label}" from the checklist?`))
                  onChange(removeChecklistRow(value, row.index));
              }}
              className="min-h-11 px-2 text-sm text-destructive"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
