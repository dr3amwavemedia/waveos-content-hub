import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/app-shell";
import { getActingStaff } from "@/hooks/use-acting-staff";

const TEAM_ALLOWED_ROUTES = ["/home", "/deliveries", "/crm", "/approvals", "/vision-studio"];
const OUTLOOK_INTEGRATIONS_ENABLED = false;
const CREW_ALLOWED_ROUTES = ["/videographer", "/vision-board"];
const MEDIA_MANAGER_ALLOWED_ROUTES = [
  ...TEAM_ALLOWED_ROUTES,
  "/content",
  "/calendar",
  "/create",
  "/analytics",
  "/social-accounts",
  "/brand-voice",
];

function isStaffRouteAllowed(pathname: string, allowedRoutes: string[]) {
  return allowedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

const db = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

// Integration-managed pattern: ssr:false + client-side session check.
// Supabase stores the session in localStorage, which the server cannot read.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { next: location.href } });
    }

    if (
      !OUTLOOK_INTEGRATIONS_ENABLED &&
      (location.pathname === "/outlook" ||
        location.pathname.startsWith("/outlook/") ||
        location.pathname === "/staff-email" ||
        location.pathname.startsWith("/staff-email/"))
    ) {
      throw redirect({ to: "/home" });
    }

    // Admin acting mode is only for WaveOS workflow/admin tasks. It must never
    // become a way to send email on behalf of the selected employee.
    const actingAsStaff =
      typeof window !== "undefined" && Boolean(sessionStorage.getItem("waveos.acting-staff"));
    if (
      actingAsStaff &&
      (location.pathname === "/staff-email" || location.pathname.startsWith("/staff-email/"))
    ) {
      throw redirect({ to: "/home" });
    }

    let roleRows: Array<{
      role: string;
      staff_type: "sales" | "media_manager" | "crew" | null;
    }> = [];

    const { data: roles, error: rolesError } = await db
      .from("user_roles")
      .select("role,staff_type")
      .eq("user_id", data.user.id);

    if (rolesError) {
      console.error("[WaveOS role lookup failed]", rolesError);

      const { data: fallbackRoles, error: fallbackError } = await db
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);

      if (fallbackError) {
        console.error("[WaveOS fallback role lookup failed]", fallbackError);
        throw redirect({ to: "/auth", search: { next: location.href } });
      }

      roleRows = (fallbackRoles ?? []).map((row: { role: string }) => ({
        role: row.role,
        staff_type: null,
      }));
    } else {
      roleRows = (roles ?? []) as Array<{
        role: string;
        staff_type: "sales" | "media_manager" | "crew" | null;
      }>;
    }

    const actingIdentity = actingAsStaff ? getActingStaff() : null;
    const roleNames = roleRows.map((role) => role.role);
    const isOwner = !actingIdentity && roleNames.includes("dream_wave_owner");
    const isTeamMember = Boolean(actingIdentity) || (roleNames.includes("dream_wave_team") && !isOwner);
    const teamRole = actingIdentity
      ? { staff_type: actingIdentity.staffType }
      : roleRows.find((role) => role.role === "dream_wave_team");
    const isCrew = teamRole?.staff_type === "crew";
    const allowedRoutes = isCrew
      ? CREW_ALLOWED_ROUTES
      : teamRole?.staff_type === "media_manager"
        ? MEDIA_MANAGER_ALLOWED_ROUTES
        : TEAM_ALLOWED_ROUTES;

    if (isTeamMember && !isStaffRouteAllowed(location.pathname, allowedRoutes)) {
      throw redirect({ to: isCrew ? "/videographer" : "/home" });
    }

    return { user: data.user };
  },
  component: AuthenticatedLayout,
  errorComponent: AuthenticatedError,
});

function AuthenticatedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function AuthenticatedError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="surface-card w-full max-w-lg p-6 text-center sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
          <AlertTriangle className="h-6 w-6 text-warning" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">WaveOS could not open this screen</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your data was not changed. Try loading the screen again, or return to the overview.
        </p>
        {import.meta.env.DEV && (
          <p className="mt-3 break-words rounded-lg border border-border bg-background/60 p-3 text-left font-mono text-xs text-muted-foreground">
            {error.message}
          </p>
        )}
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
          <Link
            to="/home"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium"
          >
            Return to overview
          </Link>
        </div>
      </div>
    </div>
  );
}
