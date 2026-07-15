import { createFileRoute, redirect } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { PlaceholderPage } from "@/components/app/placeholder-page";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const owner = (roles ?? []).some((r) => r.role === "dream_wave_owner");
    if (!owner) throw redirect({ to: "/home" });
  },
  component: () => (
    <PlaceholderPage
      icon={ShieldCheck}
      phase="Phase 6"
      title="Admin"
      subtitle="System health, integration status, and safe diagnostics."
      bullets={[
        "Integration configuration status (no secret values displayed)",
        "Publishing infrastructure health",
        "Workspace and profile provisioning state",
        "Audit trail of privileged actions",
      ]}
    />
  ),
  head: () => ({ meta: [{ title: "Admin — WaveOS" }, { name: "robots", content: "noindex" }] }),
});
