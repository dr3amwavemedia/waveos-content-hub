import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/app-shell";

const TEAM_ALLOWED_ROUTES = [
  "/home",
  "/crm",
  "/outlook",
  "/staff-email",
  "/approvals",
  "/vision-studio",
];
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

    let roleRows: Array<{
      role: string;
      staff_type: "sales" | "media_manager" | null;
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
        staff_type: "sales" | "media_manager" | null;
      }>;
    }

    const roleNames = roleRows.map((role) => role.role);
    const isOwner = roleNames.includes("dream_wave_owner");
    const isTeamMember = roleNames.includes("dream_wave_team") && !isOwner;
    const teamRole = roleRows.find((role) => role.role === "dream_wave_team");
    const allowedRoutes =
      teamRole?.staff_type === "media_manager" ? MEDIA_MANAGER_ALLOWED_ROUTES : TEAM_ALLOWED_ROUTES;

    if (isTeamMember && !isStaffRouteAllowed(location.pathname, allowedRoutes)) {
      throw redirect({ to: "/home" });
    }

    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
