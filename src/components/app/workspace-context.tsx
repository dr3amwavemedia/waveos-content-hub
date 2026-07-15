import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaces, type WorkspaceSummary } from "@/hooks/use-waveos";

const STORAGE_KEY = "waveos.active-workspace";

interface WorkspaceContextValue {
  workspaces: WorkspaceSummary[];
  activeWorkspace: WorkspaceSummary | null;
  setActiveWorkspaceId: (id: string) => void;
  isLoading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

// Query keys that are scoped to a specific workspace and MUST be cleared when
// the active workspace changes so stale rows from the previous workspace can
// never flash on screen.
const WORKSPACE_SCOPED_KEYS = [
  "media", "media-folders", "media-assets",
  "brand-profile", "activity-logs", "home-stats",
];

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { data: workspaces = [], isLoading } = useWorkspaces();
  const [activeId, setActiveId] = useState<string | null>(null);
  const qc = useQueryClient();
  const prev = useRef<string | null>(null);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored) setActiveId(stored);
  }, []);

  useEffect(() => {
    if (!workspaces.length) return;
    if (!activeId || !workspaces.find((w) => w.id === activeId)) {
      setActiveId(workspaces[0].id);
    }
  }, [workspaces, activeId]);

  // Clear workspace-scoped caches when the active workspace changes so stale
  // rows from the previous workspace can never briefly appear.
  useEffect(() => {
    if (prev.current && prev.current !== activeId) {
      for (const key of WORKSPACE_SCOPED_KEYS) {
        qc.removeQueries({ queryKey: [key] });
      }
    }
    prev.current = activeId;
  }, [activeId, qc]);

  const value = useMemo<WorkspaceContextValue>(() => {
    const active = workspaces.find((w) => w.id === activeId) ?? null;
    return {
      workspaces,
      activeWorkspace: active,
      isLoading,
      setActiveWorkspaceId: (id) => {
        setActiveId(id);
        if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
      },
    };
  }, [workspaces, activeId, isLoading]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}
