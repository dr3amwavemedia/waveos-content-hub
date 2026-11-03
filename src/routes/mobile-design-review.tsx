import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, Home, Images, Menu, Plus } from "lucide-react";
import type { CSSProperties } from "react";

import { MobileCommandCenter } from "@/components/app/mobile-command-center";
import type { FeatureKey } from "@/lib/permissions";

export const Route = createFileRoute("/mobile-design-review")({
  component: MobileDesignReview,
});

const allowAll = (_feature: FeatureKey) => true;

function MobileDesignReview() {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString();

  return (
    <div
      className="waveos-app-shell min-h-screen overflow-x-clip bg-[radial-gradient(95%_42rem_at_50%_-10%,oklch(0.44_0.18_295/.32),transparent_72%)] pb-24 text-foreground"
      style={
        {
          "--primary": "oklch(0.69 0.2 295)",
          "--primary-glow": "oklch(0.78 0.18 310)",
          "--primary-foreground": "oklch(0.98 0.006 260)",
          "--border": "oklch(0.7 0.16 295 / 0.18)",
          "--border-strong": "oklch(0.72 0.18 295 / 0.34)",
        } as CSSProperties
      }
    >
      <header className="mobile-classic-header sticky top-0 z-30 mx-auto flex h-[calc(4rem+env(safe-area-inset-top))] max-w-md items-center border-b border-violet-300/20 bg-[#1a112b]/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet-500/25 text-violet-100">
          ≈
        </div>
        <strong className="ml-2 min-w-0 truncate text-lg">WaveOS</strong>
        <Menu className="ml-auto h-5 w-5 shrink-0 text-violet-100" />
      </header>

      <main className="mx-auto w-full max-w-md space-y-5 px-3 py-5">
        <section className="mobile-classic-home space-y-5" aria-label="Mobile overview design review">
          <header className="rounded-3xl border border-violet-300/20 bg-gradient-to-br from-violet-500/20 via-fuchsia-500/10 to-transparent p-4 shadow-[0_18px_50px_rgba(109,40,217,.16)]">
            <p className="text-sm font-semibold text-violet-200">Dream Wave Media</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Good afternoon, Jean 👋</h1>
            <p className="mt-1 text-sm text-muted-foreground">What do you want to work on today?</p>
          </header>

          <div className="[&>div]:!block">
            <MobileCommandCenter
              can={allowAll}
              workspaceName="Dream Wave Media"
              loading={false}
              approvalsTo="/approvals"
              stats={{
                scheduledCount: 3,
                awaitingCount: 2,
                draftCount: 5,
                failedCount: 0,
                publishedCount: 18,
                upcoming: [
                  {
                    id: "review-next",
                    title: "Behind the scenes: fall campaign",
                    scheduled_at: tomorrow,
                    status: "scheduled",
                    metadata: { platforms: ["instagram", "facebook"] },
                    media_asset_ids: [],
                  },
                ],
              }}
            />
          </div>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Recent content
              </h2>
              <span className="text-xs text-violet-300">See all</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {["Campaign", "Portraits", "Studio", "Launch"].map((label, index) => (
                <div key={label} className="min-w-0">
                  <div
                    className={`aspect-square rounded-xl border border-violet-300/15 bg-gradient-to-br ${index % 2 ? "from-fuchsia-500/30 to-cyan-500/15" : "from-violet-500/35 to-blue-500/15"}`}
                  />
                  <p className="mt-1 truncate text-[10px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </section>
        </section>
      </main>

      <nav className="mobile-classic-nav fixed inset-x-0 bottom-0 z-30 mx-auto flex h-[calc(5rem+env(safe-area-inset-bottom))] max-w-md items-center justify-around rounded-t-3xl border-t border-violet-300/20 bg-[#1c132e]/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-18px_50px_-28px_oklch(0.65_0.22_300/.7)] backdrop-blur-xl">
        <Link to="/mobile-design-review" className="flex min-w-0 flex-1 flex-col items-center gap-1 text-violet-300">
          <Home className="h-5 w-5" />
          <span className="text-[10px]">Overview</span>
        </Link>
        <span className="flex min-w-0 flex-1 flex-col items-center gap-1 text-muted-foreground">
          <Images className="h-5 w-5" />
          <span className="text-[10px]">Deliveries</span>
        </span>
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-950/50">
          <Plus className="h-7 w-7" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col items-center gap-1 text-muted-foreground">
          <FileText className="h-5 w-5" />
          <span className="text-[10px]">Invoices</span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col items-center gap-1 text-muted-foreground">
          <Menu className="h-5 w-5" />
          <span className="text-[10px]">More</span>
        </span>
      </nav>
    </div>
  );
}
