import { createFileRoute, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/app-shell";
import { TemplateLibrary } from "@/components/documents/template-library";

export const Route = createFileRoute("/_authenticated/templates")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const isOwner = (roles ?? []).some((r) => r.role === "dream_wave_owner");
    if (!isOwner) throw redirect({ to: "/home" });
  },
  component: TemplatesPage,
  head: () => ({
    meta: [
      { title: "Template Library — WaveOS" },
      {
        name: "description",
        content:
          "Create, preview, version and archive reusable invoice, contract and form templates for Dream Wave Media clients.",
      },
      { property: "og:title", content: "Template Library — WaveOS" },
      {
        property: "og:description",
        content: "Reusable invoice, contract and form templates for Dream Wave Media.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function TemplatesPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
        <header>
          <h1 className="text-xl font-semibold text-foreground">Template Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reusable invoice, contract and form templates. Editing saves a new version, so past
            documents stay traceable.
          </p>
        </header>
        <TemplateLibrary />
      </div>
    </AppShell>
  );
}
