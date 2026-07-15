import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useWorkspaces, type WorkspaceSummary } from "@/hooks/use-waveos";

const STORAGE_KEY = "waveos.active-workspace";

interface WorkspaceContextValue {
  workspaces: WorkspaceSummary[];
  activeWorkspace: WorkspaceSummary | null;
  setActiveWorkspaceId: (id: string) => void;
  isLoading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { data: workspaces = [], isLoading } = useWorkspaces();
  const [activeId, setActiveId] = useState<string | null>(null);

  // hydrate from localStorage on client
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored) setActiveId(stored);
  }, []);

  // ensure activeId is valid; default to first
  useEffect(() => {
    if (!workspaces.length) return;
    if (!activeId || !workspaces.find((w) => w.id === activeId)) {
      setActiveId(workspaces[0].id);
    }
  }, [workspaces, activeId]);

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
