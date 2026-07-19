import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  Home,
  Images,
  Calendar,
  PenSquare,
  BarChart3,
  Share2,
  Sparkles,
  MessageSquare,
  Settings,
  Users2,
  ShieldCheck,
  CheckSquare,
  ChevronsUpDown,
  LogOut,
  Menu,
  X,
  Check,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { NotificationsBell } from "./notifications-bell";

import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { WaveLogo } from "@/components/branding/wave-logo";
import { useCurrentUser } from "@/hooks/use-waveos";
import { WorkspaceProvider, useWorkspace } from "./workspace-context";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  staffOnly?: boolean;
}

const CLIENT_NAV: NavItem[] = [
  { to: "/home", label: "Overview", icon: Home },
  { to: "/content", label: "Content", icon: Images },
  { to: "/calendar", label: "Calendar", icon: Calendar },
  { to: "/create", label: "Create Post", icon: PenSquare },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/social-accounts", label: "Social Accounts", icon: Share2 },
  { to: "/brand-voice", label: "Brand Voice", icon: Sparkles },
  { to: "/feedback", label: "Feedback", icon: MessageSquare },
  { to: "/settings", label: "Settings", icon: Settings },
];

const STAFF_NAV: NavItem[] = [
  { to: "/clients", label: "Clients", icon: Users2, staffOnly: true },
  { to: "/approvals", label: "Approvals", icon: CheckSquare, staffOnly: true },
  { to: "/admin", label: "Admin", icon: ShieldCheck, staffOnly: true },
];

const MOBILE_NAV: NavItem[] = [
  { to: "/home", label: "Overview", icon: Home },
  { to: "/content", label: "Content", icon: Images },
  { to: "/create", label: "Create", icon: PenSquare },
  { to: "/calendar", label: "Calendar", icon: Calendar },
  { to: "/settings", label: "More", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <Shell>{children}</Shell>
    </WorkspaceProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { data: user } = useCurrentUser();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = [...CLIENT_NAV];
  if (user?.isStaff) nav.push(...STAFF_NAV);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sidebar — desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-sidebar lg:flex">
        <div className="px-5 py-5">
          <WaveLogo />
        </div>
        <WorkspaceSwitcher />
        <nav className="mt-2 flex-1 overflow-y-auto px-3 pb-6">
          <NavGroup items={CLIENT_NAV} />
          {user?.isStaff && (
            <>
              <div className="mt-6 mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Dream Wave Media
              </div>
              <NavGroup items={STAFF_NAV} />
            </>
          )}
        </nav>
        <UserFooter />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-surface/80 px-4 py-3 backdrop-blur lg:hidden">
        <WaveLogo compact />
        <div className="flex items-center gap-2">
          <NotificationsBell />
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg border border-border bg-elevated p-2 text-foreground"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog">
          <div className="absolute inset-0 bg-background/70 backdrop-blur" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 border-r border-border bg-sidebar p-4">
            <div className="flex items-center justify-between">
              <WaveLogo />
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4">
              <WorkspaceSwitcher />
            </div>
            <div onClick={() => setMobileOpen(false)}>
              <NavGroup items={nav} className="mt-2" />
            </div>
            <UserFooter />
          </div>
        </div>
      )}

      {/* Main */}
      <main className="min-h-screen lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 pb-24 pt-4 sm:px-6 lg:px-10 lg:pt-8 lg:pb-10">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-around border-t border-border bg-surface/95 px-2 py-2 backdrop-blur lg:hidden">
        {MOBILE_NAV.map((item) => (
          <MobileNavLink key={item.to} item={item} />
        ))}
      </nav>
    </div>
  );
}

function NavGroup({ items, className }: { items: NavItem[]; className?: string }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return (
    <ul className={cn("space-y-0.5", className)}>
      {items.map((item) => {
        const active = pathname === item.to || pathname.startsWith(item.to + "/");
        const Icon = item.icon;
        return (
          <li key={item.to}>
            <Link
              to={item.to}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                active
                  ? "bg-primary/12 text-foreground ring-1 ring-inset ring-primary/30"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "h-[18px] w-[18px] transition-colors",
                  active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              {item.label}
              {active && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px] shadow-primary" />
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function MobileNavLink({ item }: { item: NavItem }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const active = pathname === item.to || pathname.startsWith(item.to + "/");
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={cn(
        "flex flex-1 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-medium",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className="h-5 w-5" />
      {item.label}
    </Link>
  );
}

function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, setActiveWorkspaceId } = useWorkspace();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  if (!workspaces.length) {
    return (
      <div className="mx-3 mt-2">
        <button
          onClick={() => navigate({ to: "/onboarding" })}
          className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border bg-surface/60 p-3 text-left text-sm text-foreground transition-colors hover:bg-elevated"
        >
          <Plus className="h-4 w-4 text-primary" />
          <span className="flex-1">
            <span className="block font-medium">Create workspace</span>
            <span className="block text-[11px] text-muted-foreground">Start your own Brand Workspace</span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="relative mx-3 mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface/60 px-3 py-2.5 text-left transition-colors hover:bg-elevated"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary/40 to-primary-glow/40 text-xs font-bold text-primary-foreground ring-1 ring-primary/30">
          {activeWorkspace?.name.slice(0, 2).toUpperCase() ?? "WS"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">
            {activeWorkspace?.name ?? "Select workspace"}
          </div>
          <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
            {activeWorkspace?.role ?? "—"}
            {activeWorkspace?.is_demo && " · Demo"}
          </div>
        </div>
        <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-10 mt-2 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => {
                setActiveWorkspaceId(w.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground hover:bg-elevated"
            >
              <span className="truncate">{w.name}</span>
              {w.id === activeWorkspace?.id && <Check className="ml-auto h-4 w-4 text-primary" />}
            </button>
          ))}
          <button
            onClick={() => {
              setOpen(false);
              navigate({ to: "/onboarding" });
            }}
            className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-sm font-medium text-primary hover:bg-elevated"
          >
            <Plus className="h-4 w-4" />
            Create new workspace
          </button>
        </div>
      )}
    </div>
  );
}

function UserFooter() {
  const { data: user } = useCurrentUser();
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "You";

  return (
    <div className="border-t border-border/80 p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-elevated text-xs font-semibold text-foreground ring-1 ring-border">
          {(user?.firstName?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-foreground">{displayName}</div>
          <div className="truncate text-[10px] text-muted-foreground">{user?.email}</div>
        </div>
        <NotificationsBell />
        <button
          onClick={signOut}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-elevated hover:text-foreground"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
