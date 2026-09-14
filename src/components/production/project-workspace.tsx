import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-waveos";
import { errorMessage } from "@/lib/error-message";
import { appendChecklistRow, checklistRows, toggleChecklistRow } from "@/lib/planning-checklist";

const sections = {
  story: "Story",
  script: "Script",
  equipment: "Equipment",
  shot_list: "Shot list",
  organization: "Organization map",
} as const;
type Section = keyof typeof sections;
type Planning = Record<Section, string | null> & {
  vision_board_id: string | null;
  updated_at: string;
};
type Board = { id: string; project_name: string; status: string; public_token: string };
// New columns are additive and generated types follow the staged migration.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };

export function ProjectWorkspace({
  projectId,
  onDirtyChange,
}: {
  projectId: string;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  const [section, setSection] = useState<Section | "vision">("vision");
  const planning = useQuery({
    queryKey: ["project-planning", user?.userId, projectId],
    enabled: !!user?.userId,
    queryFn: async (): Promise<Planning> => {
      const { data, error } = await db
        .from("production_projects")
        .select("story,script,equipment,shot_list,organization,vision_board_id,updated_at")
        .eq("id", projectId)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const boards = useQuery({
    queryKey: ["project-board-options", user?.userId],
    enabled: !!user?.userId && section === "vision",
    queryFn: async (): Promise<Board[]> => {
      const { data, error } = await db
        .from("production_vision_boards")
        .select("id,project_name,status,public_token")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["project-planning", user?.userId, projectId] });
  return (
    <section className="mt-4 space-y-3 border-t border-border pt-4" aria-label="Project planning">
      <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Project tools">
        {(["vision", ...Object.keys(sections)] as Array<Section | "vision">).map((key) => (
          <button
            type="button"
            key={key}
            aria-pressed={section === key}
            onClick={() => {
              if (key === section) return;
              if (dirty && !window.confirm("Discard unsaved project notes?")) return;
              setDirty(false);
              setSection(key);
            }}
            className={`min-h-11 rounded-xl border px-3 py-2 text-sm ${section === key ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
          >
            {key === "vision" ? "Moodboard / Vision" : sections[key]}
          </button>
        ))}
      </nav>
      {planning.isError ? (
        <div role="alert" className="text-sm">
          Project tools are unavailable. Your existing project details are still available.{" "}
          <button
            type="button"
            onClick={() => planning.refetch()}
            className="min-h-11 text-primary"
          >
            Try again
          </button>
        </div>
      ) : !planning.data ? (
        <p role="status">Loading project tools…</p>
      ) : section === "vision" ? (
        <BoardPicker
          key={projectId}
          projectId={projectId}
          current={planning.data.vision_board_id}
          version={planning.data.updated_at}
          boards={boards.data ?? []}
          loading={boards.isLoading}
          failed={boards.isError}
          refresh={refresh}
        />
      ) : (
        <PlanningEditor
          key={`${projectId}-${section}`}
          projectId={projectId}
          field={section}
          initial={planning.data[section]}
          version={planning.data.updated_at}
          refresh={refresh}
          onDirtyChange={setDirty}
        />
      )}
    </section>
  );
}

async function saveField(
  projectId: string,
  field: keyof Planning,
  version: string,
  value: string | null,
) {
  const query = db
    .from("production_projects")
    .update({ [field]: value })
    .eq("id", projectId)
    .eq("updated_at", version);
  const { data, error } = await query.select("updated_at");
  if (error) throw error;
  if (!data?.length)
    throw new Error(
      "This project changed or your access changed. Reload the project before saving again. Your draft is still here.",
    );
  return data[0].updated_at as string;
}

function PlanningEditor({
  projectId,
  field,
  initial,
  version,
  refresh,
  onDirtyChange,
}: {
  projectId: string;
  field: Section;
  initial: string | null;
  version: string;
  refresh: () => Promise<unknown>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [savedVersion, setSavedVersion] = useState(version);
  const [baseline, setBaseline] = useState(initial);
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [newItem, setNewItem] = useState("");
  const checklist = field === "equipment" || field === "shot_list";
  const rows = checklistRows(value);
  const dirty = value !== (baseline ?? "") || !!newItem.trim();
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const nextValue = checklist ? appendChecklistRow(value, newItem) : value;
        if (nextValue.length > (field === "script" ? 40000 : 20000)) {
          toast.error("These notes are too long. Shorten them before saving.");
          return;
        }
        setSaving(true);
        try {
          const nextVersion = await saveField(projectId, field, savedVersion, nextValue || null);
          setSavedVersion(nextVersion);
          setBaseline(nextValue || null);
          setValue(nextValue);
          setNewItem("");
          await refresh();
          toast.success(`${sections[field]} saved.`);
        } catch (error) {
          toast.error(errorMessage(error, "Could not save project notes."));
        } finally {
          setSaving(false);
        }
      }}
    >
      {checklist && (
        <section className="space-y-3" aria-label={`${sections[field]} checklist`}>
          <p className="text-sm text-muted-foreground">
            Add items and check them off as you prepare. Save to keep your progress with this
            project.
          </p>
          <div className="flex gap-2">
            <input
              aria-label={`New ${field === "equipment" ? "equipment" : "shot"} item`}
              value={newItem}
              disabled={saving}
              maxLength={500}
              onChange={(event) => setNewItem(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  const next = appendChecklistRow(value, newItem);
                  if (next.length <= 20000) {
                    setValue(next);
                    setNewItem("");
                  }
                }
              }}
              placeholder={
                field === "equipment" ? "Camera, lens, lighting…" : "Wide establishing shot…"
              }
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-base"
            />
            <button
              type="button"
              disabled={
                saving || !newItem.trim() || appendChecklistRow(value, newItem).length > 20000
              }
              onClick={() => {
                setValue(appendChecklistRow(value, newItem));
                setNewItem("");
              }}
              className="min-h-11 rounded-xl border border-border px-4 disabled:opacity-50"
            >
              Add
            </button>
          </div>
          {!!rows.length && (
            <>
              <p role="status" className="text-xs text-muted-foreground">
                {rows.filter((row) => row.checked).length} of {rows.length} completed
              </p>
              <ul className="space-y-2">
                {rows.map((row) => (
                  <li key={row.index}>
                    <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-3 py-2">
                      <input
                        type="checkbox"
                        disabled={saving}
                        checked={row.checked}
                        onChange={() => setValue(toggleChecklistRow(value, row.index))}
                      />
                      <span
                        className={`min-w-0 break-words text-sm ${row.checked ? "text-muted-foreground line-through" : ""}`}
                      >
                        {row.label}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      <label className="block text-sm font-medium">
        {checklist ? "Notes and checklist text" : sections[field]}
        <textarea
          value={value}
          disabled={saving}
          onChange={(event) => setValue(event.target.value)}
          maxLength={field === "script" ? 40000 : 20000}
          rows={8}
          className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-base"
          placeholder={
            field === "organization"
              ? "Crew roles, responsibilities and project structure"
              : `Add this project's ${sections[field].toLowerCase()}`
          }
        />
      </label>
      {field === "organization" && (
        <p className="text-sm text-muted-foreground">
          Describe who leads each area, who reports to them, and each crew member’s
          responsibilities.
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {dirty ? "Unsaved changes — save before switching tools." : "Saved to this project"}
        </span>
        <button
          disabled={!dirty || saving}
          className="min-h-11 rounded-xl bg-primary px-4 text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function BoardPicker({
  projectId,
  current,
  version,
  boards,
  loading,
  failed,
  refresh,
}: {
  projectId: string;
  current: string | null;
  version: string;
  boards: Board[];
  loading: boolean;
  failed: boolean;
  refresh: () => Promise<unknown>;
}) {
  const [saving, setSaving] = useState(false);
  const board = boards.find((item) => item.id === current);
  return (
    <div className="space-y-3 text-sm">
      <p>Choose the existing board for this project. Its current sharing settings stay in place.</p>
      {failed ? (
        <p role="alert">Boards could not be loaded. Reopen this tool to retry.</p>
      ) : (
        <label className="block">
          Project vision board
          <select
            value={current ?? ""}
            disabled={loading || saving}
            className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3"
            onChange={async (event) => {
              const next = event.target.value || null;
              setSaving(true);
              try {
                await saveField(projectId, "vision_board_id", version, next);
                await refresh();
                toast.success("Project board updated.");
              } catch (error) {
                toast.error(errorMessage(error, "Could not link board."));
              } finally {
                setSaving(false);
              }
            }}
          >
            <option value="">{loading ? "Loading boards…" : "No board linked"}</option>
            {current && !board && <option value={current}>Linked board unavailable</option>}
            {boards.map((item) => (
              <option key={item.id} value={item.id}>
                {item.project_name}
              </option>
            ))}
          </select>
        </label>
      )}
      {board && (
        <div className="flex flex-wrap gap-2">
          <Link
            to="/vision-board/$boardId"
            params={{ boardId: board.id }}
            className="inline-flex min-h-11 items-center rounded-xl border border-border px-3"
          >
            Open board
          </Link>
          {board.status === "published" ? (
            <button
              type="button"
              className="min-h-11 rounded-xl border border-border px-3"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `${window.location.origin}/storyboard/${board.public_token}`,
                  );
                  toast.success("Share link copied.");
                } catch {
                  toast.error("Could not copy. Open the board to access its sharing controls.");
                }
              }}
            >
              Copy freelance share link
            </button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Publish this board from its editor before sharing.
            </p>
          )}
        </div>
      )}
      <Link
        to="/vision-board/$boardId"
        params={{ boardId: "new" }}
        className="inline-flex min-h-11 items-center text-primary"
      >
        Create a vision board
      </Link>
    </div>
  );
}
