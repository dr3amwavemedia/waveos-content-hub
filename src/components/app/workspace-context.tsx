import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaces, type WorkspaceSummary } from "@/hooks/use-waveos";

const STORAGE_KEY = "waveos.active-workspace";
const WORKSPACE_CHANGE_EVENT = "waveos:active-workspace-change";

interface WorkspaceContextValue {
  workspaces: WorkspaceSummary[];
  activeWorkspace: WorkspaceSummary | null;
  setActiveWorkspaceId: (id: string) => void;
  isLoading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

const WORKSPACE_SCOPED_KEYS = [
  "media",
  "media-folders",
  "media-assets",
  "brand-profile",
  "activity-logs",
  "home-stats",
  "social-connections",
  "workspace-ayrshare-status",
  "content-items",
  "content-item",
  "comments",
  "approvals",
  "notifications",
  "client-deliveries",
  "your-content",
  "layer1",
  "phase4-requests",
  "phase4-internal-notes",
  "phase4-checklist",
  "phase4-timeline",
];

function persistActiveWorkspace(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, id);
  window.dispatchEvent(new CustomEvent(WORKSPACE_CHANGE_EVENT, { detail: { id } }));
}

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
      const nextId = workspaces[0].id;
      setActiveId(nextId);
      persistActiveWorkspace(nextId);
    }
  }, [workspaces, activeId]);

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
        persistActiveWorkspace(id);
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
