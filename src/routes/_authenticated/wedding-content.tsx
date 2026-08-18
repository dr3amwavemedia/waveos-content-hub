import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Film } from "lucide-react";

import { useWorkspace } from "@/components/app/workspace-context";
import {
  deliveryActionLabel,
  deliveryKindLabel,
  formatWeddingDate,
  useWeddingDeliveries,
  useWeddingWorkspace,
  weddingDisplayName,
  weddingPalette,
} from "@/components/app/wedding-theme";

export const Route = createFileRoute("/_authenticated/wedding-content")({
  component: WeddingContentRoute,
  head: () => ({
    meta: [
      { title: "Your Wedding Films — Dream Wave" },
      {
        name: "description",
        content: "Watch and download the wedding films and photo galleries Dream Wave has delivered.",
      },
      { property: "og:title", content: "Your Wedding Films — Dream Wave" },
      {
        property: "og:description",
        content: "Watch and download the wedding films and photo galleries Dream Wave has delivered.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function WeddingContentRoute() {
  const { activeWorkspace } = useWorkspace();
  const wsId = activeWorkspace?.id;
  const workspaceQ = useWeddingWorkspace(wsId);
  const ws = workspaceQ.data;
  const isActive = ws?.account_status === "active";
  const palette = weddingPalette(ws?.wedding_theme);
  const deliveriesQ = useWeddingDeliveries(wsId, !!isActive);
  const deliveries = deliveriesQ.data ?? [];
  const [featured, ...rest] = deliveries;

  return (
    <div
      className="w-full space-y-6 overflow-x-hidden"
      style={{ paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))" }}
    >
      <header
        className="rounded-[2rem] border px-5 py-8 sm:px-9"
        style={{
          borderColor: palette.border,
          background: `linear-gradient(160deg, ${palette.soft} 0%, #ffffff 62%)`,
        }}
      >
        <h1 className="font-serif text-3xl tracking-tight sm:text-4xl" style={{ color: palette.ink }}>
          Your films and photos
        </h1>
        <p className="mt-3 max-w-xl text-base leading-7 text-stone-600">
          Everything we deliver for {weddingDisplayName(ws)} lives here, ready to watch and share.
        </p>
      </header>

      {deliveriesQ.isLoading ? (
        <div className="rounded-2xl bg-white p-6 text-sm text-stone-600">Loading your content…</div>
      ) : featured ? (
        <>
          <section
            className="overflow-hidden rounded-[1.75rem] border bg-white"
            style={{ borderColor: palette.border }}
          >
            <div
              className="flex h-44 items-center justify-center sm:h-64"
              style={{ background: `linear-gradient(140deg, ${palette.soft}, #ffffff)` }}
            >
              <Film className="h-10 w-10" style={{ color: palette.accent }} />
            </div>
            <div className="p-5 sm:p-7">
              <p className="text-xs font-medium" style={{ color: palette.accent }}>
                {deliveryKindLabel(featured)}
              </p>
              <h2 className="mt-1 break-words font-serif text-2xl text-stone-900">{featured.title}</h2>
              {featured.delivered_at && (
                <p className="mt-1 text-sm text-stone-500">{formatWeddingDate(featured.delivered_at)}</p>
              )}
              {featured.description && (
                <p className="mt-3 text-sm leading-6 text-stone-600">{featured.description}</p>
              )}
              <a
                href={featured.url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold text-white sm:w-auto sm:min-w-64"
                style={{ background: palette.accent }}
              >
                {deliveryActionLabel(featured)} <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </section>

          {rest.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {rest.map((d) => (
                <div
                  key={d.id}
                  className="flex flex-col rounded-[1.5rem] border bg-white p-5"
                  style={{ borderColor: palette.border }}
                >
                  <p className="text-xs font-medium" style={{ color: palette.accent }}>
                    {deliveryKindLabel(d)}
                  </p>
                  <h3 className="mt-1 break-words text-lg font-semibold text-stone-900">{d.title}</h3>
                  {d.delivered_at && (
                    <p className="mt-1 text-sm text-stone-500">{formatWeddingDate(d.delivered_at)}</p>
                  )}
                  <a
                    href={d.url ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-full border text-sm font-semibold"
                    style={{ borderColor: palette.border, color: palette.ink }}
                  >
                    {deliveryActionLabel(d)} <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <section
          className="rounded-[1.75rem] border px-6 py-12 text-center"
          style={{ borderColor: palette.border, background: palette.wash }}
        >
          <span
            className="inline-flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: palette.soft, color: palette.ink }}
          >
            <Film className="h-6 w-6" />
          </span>
          <h2 className="mt-5 font-serif text-2xl" style={{ color: palette.ink }}>
            Your films will live here
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-stone-600">
            After your wedding, we’ll add your finished films and memories here as they’re ready.
          </p>
        </section>
      )}
    </div>
  );
}
