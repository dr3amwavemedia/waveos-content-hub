import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { ArrowRight, Heart, Loader2, Star } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { WaveLogo } from "@/components/branding/wave-logo";

export const Route = createFileRoute("/promo/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your content is ready | Dream Wave Media" },
      {
        name: "description",
        content:
          "Leave an optional Google review and continue to your Dream Wave Media gallery.",
      },
      { property: "og:title", content: "Your content is ready | Dream Wave Media" },
      {
        property: "og:description",
        content: "Leave an optional Google review and continue to your gallery.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PublicPromoPage,
});

interface PublicPromo {
  name: string;
  google_review_url: string;
  destination_url: string;
  destination_label: string;
}

function PublicPromoPage() {
  const { token } = Route.useParams();
  const scanRecorded = useRef(false);

  const promoQuery = useQuery({
    queryKey: ["public-promo", token],
    retry: false,
    queryFn: async (): Promise<PublicPromo | null> => {
      const { data, error } = await supabase.rpc("get_public_promo_campaign", { _token: token });
      if (error) throw error;
      return (data?.[0] as PublicPromo | undefined) ?? null;
    },
  });

  useEffect(() => {
    if (!promoQuery.data || scanRecorded.current) return;
    scanRecorded.current = true;
    void supabase.rpc("record_promo_event", { _token: token, _event: "scan" });
  }, [promoQuery.data, token]);

  function record(event: "review_click" | "destination_click") {
    void supabase.rpc("record_promo_event", { _token: token, _event: event });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <WaveLogo />
        </div>

        {promoQuery.isLoading ? (
          <div className="surface-card flex items-center justify-center p-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !promoQuery.data ? (
          <div className="surface-card p-8 text-center">
            <h1 className="text-lg font-semibold">This link isn’t available</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The promo link may be paused or no longer active. Please reach out to your Dream Wave
              Media contact.
            </p>
          </div>
        ) : (
          <div className="surface-card p-6 sm:p-8">
            <div className="flex justify-center">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/12 text-primary ring-1 ring-inset ring-primary/30">
                <Heart className="h-6 w-6" />
              </span>
            </div>
            <h1 className="mt-4 text-center text-xl font-semibold">Thanks for working with us</h1>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              If you have a moment, an honest Google review helps our small team more than you know.
              It’s completely optional and doesn’t affect access to your content.
            </p>

            <div className="mt-6 space-y-3">
              <a
                href={promoQuery.data.google_review_url}
                target="_blank"
                rel="noreferrer"
                onClick={() => record("review_click")}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
              >
                <Star className="h-4 w-4" /> Leave an honest Google review
              </a>
              <a
                href={promoQuery.data.destination_url}
                target="_blank"
                rel="noreferrer"
                onClick={() => record("destination_click")}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground hover:bg-elevated"
              >
                {promoQuery.data.destination_label} <ArrowRight className="h-4 w-4" />
              </a>
            </div>

            <p className="mt-5 text-center text-xs text-muted-foreground">
              Reviewing is optional — you can continue straight to your content at any time.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
