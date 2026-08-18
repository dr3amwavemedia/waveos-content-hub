import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import {
  Home,
  Heart,
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
  FileText,
  User,
  BriefcaseBusiness,
  Mail,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import { NotificationsBell } from "./notifications-bell";

import { cn } from "@/lib/utils";
import { accountDisplayName, visibleAccountEmail } from "@/lib/identity-display";
import { supabase } from "@/integrations/supabase/client";
import { WaveLogo } from "@/components/branding/wave-logo";
import { useCurrentUser } from "@/hooks/use-waveos";
import { WorkspaceProvider, useWorkspace } from "./workspace-context";
import { ImpersonationBanner } from "./impersonation-banner";
import { AccountStatusBanner } from "./account-status-banner";

import type { FeatureKey } from "@/lib/permissions";
import { usePermissions } from "@/hooks/use-permissions";
import { useWorkspaceBranding, workspaceThemeStyle } from "@/hooks/use-workspace-branding";
import { WorkspaceBrandmark } from "@/components/branding/workspace-brandmark";

interface NavItem {
  to: string;
  hash?: string;
  label: string;
  icon: typeof Home;
  staffOnly?: boolean;
  ownerOnly?: boolean;
  mediaOnly?: boolean;
  // When set, the nav item is only shown if the active workspace can access
  // this feature. Undefined = universal (always shown to any workspace member).
  feature?: FeatureKey;
}

const CLIENT_NAV: NavItem[] = [
  { to: "/home", label: "Overview", icon: Home },
  { to: "/deliveries", label: "Your Content", icon: Images },
  { to: "/home", hash: "invoices", label: "Invoices & Payments", icon: FileText },
  { to: "/content", label: "Content", icon: Images, feature: "can_view_media_library" },
  { to: "/posts", label: "Posts", icon: FileText, feature: "can_create_content" },
  { to: "/calendar", label: "Calendar", icon: Calendar, feature: "can_view_calendar_preview" },
  { to: "/create", label: "Create Post", icon: PenSquare, feature: "can_create_content" },
  { to: "/analytics", label: "Analytics", icon: BarChart3, feature: "can_view_analytics" },
  {
    to: "/social-accounts",
    label: "Social Accounts",
    icon: Share2,
    feature: "can_connect_socials",
  },
  { to: "/brand-voice", label: "Brand Voice", icon: Sparkles, feature: "can_manage_brand_voice" },
  { to: "/approvals", label: "Approvals", icon: CheckSquare },
  { to: "/feedback", label: "Request Something", icon: MessageSquare, feature: "can_contact_support" },
  { to: "/settings", label: "Settings", icon: Settings },
];

// Keep Outlook features out of navigation until their Lovable Cloud Edge
// Functions are deployed. Flip this to true when that backend is ready.
const OUTLOOK_INTEGRATIONS_ENABLED = false;

const STAFF_NAV: NavItem[] = [
  { to: "/videographer", label: "Production", icon: Camera, staffOnly: true, mediaOnly: true },
  { to: "/crm", label: "CRM", icon: BriefcaseBusiness, staffOnly: true },
  ...(OUTLOOK_INTEGRATIONS_ENABLED
    ? [
        { to: "/outlook", label: "Outlook Calendar", icon: Calendar, staffOnly: true },
        { to: "/staff-email", label: "Staff Email", icon: Mail, staffOnly: true },
      ]
    : []),
  { to: "/clients", label: "Clients", icon: Users2, staffOnly: true, ownerOnly: true },
  { to: "/approvals", label: "Approvals", icon: CheckSquare, staffOnly: true },
  { to: "/vision-studio", label: "Vision Studio", icon: Sparkles, staffOnly: true },
  { to: "/admin", label: "Staff", icon: ShieldCheck, staffOnly: true, ownerOnly: true },
];

const TEAM_NAV: NavItem[] = [
  { to: "/home", label: "Overview", icon: Home },
  { to: "/crm", label: "CRM", icon: BriefcaseBusiness, staffOnly: true },
  { to: "/approvals", label: "Approvals", icon: CheckSquare, staffOnly: true },
  { to: "/vision-studio", label: "Vision Studio", icon: Sparkles, staffOnly: true },
];

const MEDIA_MANAGER_CLIENT_NAV = CLIENT_NAV.filter(
  (item) => item.hash !== "invoices" && item.to !== "/feedback" && item.to !== "/settings",
);

const MOBILE_NAV: NavItem[] = [
  { to: "/home", label: "Overview", icon: Home },
  { to: "/deliveries", label: "Your Content", icon: Images },
  { to: "/home", hash: "invoices", label: "Invoices", icon: FileText },
  { to: "/calendar", label: "Calendar", icon: Calendar, feature: "can_view_calendar_preview" },
  { to: "/create", label: "Create", icon: PenSquare, feature: "can_create_content" },
  { to: "/posts", label: "Posts", icon: FileText, feature: "can_create_content" },
  { to: "/content", label: "Content", icon: Images, feature: "can_view_media_library" },
  { to: "/settings", label: "More", icon: Settings },
];

// Layer 1 (project_client) client-facing nav. All entries reuse existing
// routes — no new routes are created. "Your Content" and "Invoices & Payments"
// scroll to the corresponding section of the Overview.
const LAYER1_NAV: NavItem[] = [
  { to: "/home", label: "Overview", icon: Home },
  { to: "/approvals", label: "Approvals", icon: CheckSquare },
  { to: "/deliveries", label: "Your Content", icon: Images },
  { to: "/home", hash: "invoices", label: "Invoices & Payments", icon: FileText },
  { to: "/settings", label: "Your Information", icon: User },
  { to: "/feedback", label: "Request Something", icon: MessageSquare },
];

const LAYER1_MOBILE_NAV: NavItem[] = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/deliveries", label: "Content", icon: Images },
  { to: "/approvals", label: "Approvals", icon: CheckSquare },
  { to: "/home", hash: "invoices", label: "Invoices", icon: FileText },
  { to: "/settings", label: "More", icon: Menu },
];

const WEDDING_ALLOWED_PATHS = ["/home", "/wedding-content"];

const WEDDING_NAV: NavItem[] = [
  { to: "/home", label: "Wedding Overview", icon: Heart },
  { to: "/wedding-content", label: "Content", icon: Images },
  { to: "/home", hash: "wedding-contracts", label: "Contracts", icon: FileText },
  { to: "/home", hash: "wedding-invoices", label: "Payments", icon: FileText },
  { to: "/home", hash: "wedding-contact", label: "Contact Dream Wave", icon: MessageSquare },
];

const WEDDING_MOBILE_NAV: NavItem[] = [
  { to: "/home", label: "Overview", icon: Heart },
  { to: "/wedding-content", label: "Content", icon: Images },
  { to: "/home", hash: "wedding-contracts", label: "Contracts", icon: FileText },
  { to: "/home", hash: "wedding-invoices", label: "Payments", icon: FileText },
  { to: "/home", hash: "wedding-contact", label: "More", icon: Menu },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <Shell>{children}</Shell>
    </WorkspaceProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { can, visibility, isLoading: permsLoading, access, isStaff } = usePermissions();
  const { data: user } = useCurrentUser();
  const { activeWorkspace } = useWorkspace();
  const branding = useWorkspaceBranding(activeWorkspace?.id);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const isOwner = Boolean(user?.isDreamWaveOwner && isStaff);
  const isTeamMember = isStaff && !isOwner;
  const isMediaManager = isTeamMember && user?.staffType === "media_manager";
  const isCrew = isTeamMember && user?.staffType === "crew";
  const isSales = isTeamMember && !isMediaManager && !isCrew;

  const filterByFeature = (items: NavItem[]) =>
    items.filter((i) => {
      if (i.ownerOnly) return isOwner;
      if (i.mediaOnly) return isOwner || isCrew;
      if (i.staffOnly) return isStaff;
      if (!i.feature) return true;
      if (permsLoading) return false;
      return isStaff ? can(i.feature) : visibility(i.feature) !== "hidden";
    });

  // Layer 1 (project_client) gets a simplified client-facing nav using
  // existing routes only. Staff always keep the full nav.
  const isLayer1 = !isStaff && access?.tier === "project_client";
  const isWeddingClient = !isStaff && access?.tier === "wedding_client";

  useEffect(() => {
    if (isWeddingClient && !WEDDING_ALLOWED_PATHS.includes(pathname)) {
      void navigate({ to: "/home", replace: true });
    }
  }, [isWeddingClient, navigate, pathname]);

  const clientNav = isCrew
    ? CLIENT_NAV.filter((item) =>
        ["/deliveries", "/content", "/calendar"].includes(item.to) && !item.hash,
      )
    : isSales
      ? TEAM_NAV.slice(0, 1)
    : isMediaManager
      ? filterByFeature(MEDIA_MANAGER_CLIENT_NAV)
      : isWeddingClient
        ? access?.status === "active"
          ? WEDDING_NAV
          : WEDDING_NAV.filter((item) => item.to !== "/wedding-content")
      : isLayer1
        ? LAYER1_NAV
        : filterByFeature(CLIENT_NAV);
  const staffNav = isStaff
    ? isCrew
      ? filterByFeature(STAFF_NAV.filter((item) => item.to === "/videographer"))
      : filterByFeature(STAFF_NAV)
    : [];
  const mobileNav = isCrew
    ? filterByFeature(STAFF_NAV.filter((item) => item.to === "/videographer"))
    : isSales
      ? TEAM_NAV
    : isMediaManager
      ? filterByFeature(MEDIA_MANAGER_CLIENT_NAV).slice(0, 5)
      : isWeddingClient
        ? access?.status === "active"
          ? WEDDING_MOBILE_NAV
          : WEDDING_MOBILE_NAV.filter((item) => item.to !== "/wedding-content")
      : isLayer1
        ? LAYER1_MOBILE_NAV
        : filterByFeature(MOBILE_NAV);
  const mobilePrimaryNav = mobileNav.filter((item) => item.label !== "More").slice(0, 4);
  const nav = [...clientNav, ...staffNav];

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      style={workspaceThemeStyle(branding.data?.accentColor)}
    >
      {/* Sidebar — desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-sidebar lg:flex">
        <div className="px-5 py-5">
          <WaveLogo />
        </div>
        <WorkspaceSwitcher />
        <nav className="mt-2 flex-1 overflow-y-auto px-3 pb-6">
          <NavGroup items={clientNav} />
          {isStaff && (
            <>
              <div className="mt-6 mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Dream Wave Media
              </div>
              <NavGroup items={staffNav} />
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
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-elevated text-foreground"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog">
          <div
            className="absolute inset-0 bg-background/70 backdrop-blur"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col border-r border-border bg-sidebar p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
            <div
              className="mt-2 min-h-0 flex-1 overflow-y-auto"
              onClick={() => setMobileOpen(false)}
            >
              <NavGroup items={nav} className="mt-2" />
            </div>
            <UserFooter />
          </div>
        </div>
      )}

      {/* Main */}
      <main className="min-h-screen lg:pl-64">
        <ImpersonationBanner />
        {isMediaManager && <ManagedClientBanner />}
        <AccountStatusBanner />
        <div className="mx-auto max-w-7xl px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 lg:px-10 lg:pt-8 lg:pb-10">
          {isWeddingClient && !WEDDING_ALLOWED_PATHS.includes(pathname) ? (
            <div className="surface-card p-8 text-center text-sm text-muted-foreground">
              Taking you back to your wedding overview…
            </div>
          ) : (
            children
          )}
        </div>

      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-around border-t border-border bg-surface/95 px-1 pb-[max(.35rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur lg:hidden">
        {mobilePrimaryNav.map((item) => (
          <MobileNavLink key={`${item.to}#${item.hash ?? ""}`} item={item} />
        ))}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-[10px] font-semibold text-muted-foreground"
          aria-label="Open all navigation"
        >
          <Menu className="h-5 w-5" />
          More
        </button>
      </nav>
    </div>
  );
}

function ManagedClientBanner() {
  const { data: user } = useCurrentUser();
  const { workspaces, activeWorkspace, setActiveWorkspaceId } = useWorkspace();

  if (!activeWorkspace || user?.staffType !== "media_manager") return null;

  const isStaffWorkspace = activeWorkspace.id === "11111111-1111-1111-1111-111111111111";

  return (
    <div className="border-b border-primary/30 bg-primary/10 px-3 py-2 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <BriefcaseBusiness className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            {isStaffWorkspace ? "Staff workspace" : "Managing client"}
          </span>
          <span className="font-semibold">{activeWorkspace.name}</span>
        </div>
        <label className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-background/60 px-3 py-1.5 text-xs font-semibold text-foreground">
          Switch client
          <select
            aria-label="Switch managed client"
            value={activeWorkspace.id}
            onChange={(event) => setActiveWorkspaceId(event.target.value)}
            className="max-w-48 bg-transparent text-sm font-medium outline-none"
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
          <ChevronsUpDown className="h-4 w-4 text-primary" />
        </label>
      </div>
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
          <li key={`${item.to}#${item.hash ?? ""}`}>
            <Link
              to={item.to}
              hash={item.hash}
              className={cn(
                "group flex min-h-12 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
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
      hash={item.hash}
      className={cn(
        "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-[10px] font-semibold",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className="h-5 w-5" />
      {item.label}
    </Link>
  );
}

function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace } = useWorkspace();
  const { data: user } = useCurrentUser();
  const branding = useWorkspaceBranding(activeWorkspace?.id);

  if (!workspaces.length) {
    return (
      <div className="mx-3 mt-2 rounded-xl border border-border bg-surface/60 p-3 text-xs text-muted-foreground">
        <div className="mb-1 font-medium text-foreground">
          {user?.isStaff ? "Staff workspace unavailable" : "No workspace yet"}
        </div>
        {user?.isStaff
          ? "Your staff account is active. Ask an admin to confirm access to the Dream Wave Media workspace."
          : "WaveOS is invite-only. Your Dream Wave Media account manager will send your activation link."}
      </div>
    );
  }

  return (
    <div className="mx-3 mt-2">
      <div className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface/60 px-3 py-2.5 text-left">
        {branding.data?.logoUrl ? (
          <WorkspaceBrandmark
            logoUrl={branding.data.logoUrl}
            name={activeWorkspace?.name ?? "Workspace"}
            className="h-8 w-8 rounded-lg shadow-none"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary/40 to-primary-glow/40 text-xs font-bold text-primary-foreground ring-1 ring-primary/30">
            {activeWorkspace?.name.slice(0, 2).toUpperCase() ?? "WS"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">
            {activeWorkspace?.name ?? "Select workspace"}
          </div>
          <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
            {user?.staffType === "media_manager" &&
            activeWorkspace?.id !== "11111111-1111-1111-1111-111111111111"
              ? "Managing client"
              : user?.isStaff
                ? "Staff account"
                : "Your account"}
            {activeWorkspace?.is_demo && " · Demo"}
          </div>
        </div>
      </div>
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

  const displayName = accountDisplayName({
    firstName: user?.firstName,
    lastName: user?.lastName,
    email: user?.email,
    fallback: "WaveOS user",
  });
  const visibleEmail = visibleAccountEmail(user?.email);
  const staffPosition = user?.isDreamWaveOwner
    ? "Admin"
    : user?.staffType === "media_manager"
      ? "Social Manager"
      : user?.staffType === "sales"
        ? "Sales"
        : user?.staffType === "crew"
          ? "Crew"
          : null;

  return (
    <div className="border-t border-border/80 p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-elevated text-xs font-semibold text-foreground ring-1 ring-border">
          {(user?.firstName?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-foreground">{displayName}</div>
          <div className="truncate text-[10px] text-muted-foreground">
            {staffPosition ? `${staffPosition} · Staff` : visibleEmail ?? "Client account"}
          </div>
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
