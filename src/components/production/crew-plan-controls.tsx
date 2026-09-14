import { crewRows, removeCrewRow, saveCrewRow, type CrewMember } from "@/lib/crew-plan";

export function CrewPlanControls({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const rows = crewRows(value);
  const leaders = [...new Set(rows.map((row) => row.reportsTo.trim()))];
  const enter = (initial?: CrewMember) => {
    const name = window.prompt("Crew member name", initial?.name ?? "");
    if (!name?.trim()) return;
    const role = window.prompt("Role", initial?.role ?? "");
    if (role === null) return;
    const reportsTo = window.prompt(
      "Reports to (leave blank for project lead)",
      initial?.reportsTo ?? "",
    );
    if (reportsTo === null) return;
    const responsibilities = window.prompt("Responsibilities", initial?.responsibilities ?? "");
    if (responsibilities === null) return;
    return {
      name: name.trim(),
      role: role.trim(),
      reportsTo: reportsTo.trim(),
      responsibilities: responsibilities.trim(),
    };
  };
  const save = (member: CrewMember | undefined, index?: number) => {
    if (member) {
      const next = saveCrewRow(value, member, index);
      if (next.length <= 20000) onChange(next);
      else window.alert("Shorten the organization notes before adding more crew.");
    }
  };
  return (
    <section aria-label="Crew organization layout" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Crew organization</h3>
        <button
          type="button"
          disabled={disabled}
          onClick={() => save(enter())}
          className="min-h-11 rounded-xl border border-border px-3 text-sm"
        >
          Add crew member
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        Group crew by who they report to. Save the project notes to keep this layout.
      </p>
      {leaders.map((leader) => (
        <div key={leader} className="rounded-xl border border-border p-3">
          <p className="mb-3 [overflow-wrap:anywhere] text-sm font-semibold text-primary">
            {leader ? `↓ Reports to ${leader}` : "Project leads / independent roles"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {rows
              .filter((row) => row.reportsTo.trim() === leader)
              .map((row) => (
                <article key={row.index} className="min-w-0 rounded-xl bg-surface p-3">
                  <h4 className="break-words font-semibold">{row.name}</h4>
                  <p className="break-words text-sm text-primary">{row.role}</p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                    {row.responsibilities}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label={`Edit crew ${row.name}`}
                      onClick={() => save(enter(row), row.index)}
                      className="min-h-11 px-2 text-sm text-primary"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label={`Remove crew ${row.name}`}
                      onClick={() => {
                        if (window.confirm(`Remove ${row.name} from this crew layout?`))
                          onChange(removeCrewRow(value, row.index));
                      }}
                      className="min-h-11 px-2 text-sm text-destructive"
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
          </div>
        </div>
      ))}
    </section>
  );
}
