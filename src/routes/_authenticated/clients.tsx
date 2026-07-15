import { createFileRoute, redirect } from "@tanstack/react-router";
import { Users2 } from "lucide-react";
import { PlaceholderPage } from "@/components/app/placeholder-page";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/clients")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const staff = (roles ?? []).some(
      (r) => r.role === "dream_wave_owner" || r.role === "dream_wave_team",
    );
    if (!staff) throw redirect({ to: "/home" });
  },
  component: () => (
    <PlaceholderPage
      icon={Users2}
      phase="Phase 6"
      title="Clients"
      subtitle="Dream Wave Media's home for managing every client workspace."
      bullets={[
        "Create, invite, and archive client workspaces",
        "Assign team members and permissions",
        "Jump between workspaces instantly",
        "See publishing and approval status across all clients",
      ]}
    />
  ),
  head: () => ({ meta: [{ title: "Clients — WaveOS" }, { name: "robots", content: "noindex" }] }),
});
