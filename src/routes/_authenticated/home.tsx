import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";

import { Layer1Overview } from "@/components/app/layer1-overview";
import { MobileClassicHome } from "@/components/app/mobile-classic-home";
import { OceanIntelligenceDashboard } from "@/components/app/ocean-intelligence-dashboard";
import { ProductReleaseProvider } from "@/components/app/product-releases";
import { WeddingOverview } from "@/components/app/wedding-overview";
import { useWorkspace } from "@/components/app/workspace-context";
import { usePermissions } from "@/hooks/use-permissions";
import { useCurrentUser } from "@/hooks/use-waveos";

export const Route = createFileRoute("/_authenticated/home")({
  component: () => (
    <ProductReleaseProvider>
      <HomeRoute />
    </ProductReleaseProvider>
  ),
  head: () => ({
    meta: [
      { title: "Home — WaveOS" },
      {
        name: "description",
        content: "Your WaveOS creative operations, performance, and upcoming work.",
      },
      { property: "og:title", content: "Home — WaveOS" },
      {
        property: "og:description",
        content: "Creative operations and performance intelligence at a glance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function HomeRoute() {
  const { access, isStaff, isLoading } = usePermissions();
  const { activeWorkspace, workspaces, isLoading: wsLoading } = useWorkspace();
  const { data: user } = useCurrentUser();

  if (!isStaff && !wsLoading && !isLoading && workspaces.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <div className="surface-card p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/12 text-primary ring-1 ring-primary/20">
            <Mail className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
            {user?.accountSource === "os_data"
              ? "Finish setting up your WaveOS trial"
              : "You haven't been invited to a workspace yet."}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {user?.accountSource === "os_data"
              ? "Create your brand workspace to activate 30 days of access for two social accounts."
              : "WaveOS access is provisioned by Dream Wave Media. Once your team sends you an invite, your workspace will appear here automatically."}
          </p>
          <Link
            to={user?.accountSource === "os_data" ? "/onboarding" : "/feedback"}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all hover:brightness-110"
          >
            {user?.accountSource === "os_data" ? "Create trial workspace" : "Contact support"}
          </Link>
        </div>
      </div>
    );
  }

  if (!isStaff && !isLoading && access) {
    if (activeWorkspace?.data_source === "os_data") return <HomeDashboard />;
    if (access.tier === "wedding_client") return <WeddingOverview />;
    return <Layer1Overview />;
  }

  return <HomeDashboard />;
}

function HomeDashboard() {
  return (
    <>
      <MobileClassicHome />
      <div className="hidden sm:block">
        <OceanIntelligenceDashboard />
      </div>
    </>
  );
}
