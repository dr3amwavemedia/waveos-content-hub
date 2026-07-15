import { createFileRoute, redirect } from "@tanstack/react-router";
import { CheckSquare } from "lucide-react";
import { PlaceholderPage } from "@/components/app/placeholder-page";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/approvals")({
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
      icon={CheckSquare}
      phase="Phase 3"
      title="Approvals"
      subtitle="Every post waiting on a client, across every workspace."
      bullets={[
        "Filter by client, status, and platform",
        "See caption previews at a glance",
        "Nudge clients when a review is overdue",
        "Full revision history",
      ]}
    />
  ),
  head: () => ({ meta: [{ title: "Approvals — WaveOS" }, { name: "robots", content: "noindex" }] }),
});
