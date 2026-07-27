import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Waves } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";

import { VisionPresentation } from "@/features/vision-decks/vision-presentation";
import { parseVisionDeckContent, type PublicVisionDeck } from "@/features/vision-decks/types";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/vision/$token")({
  ssr: false,
  component: PublicVisionDeckPage,
  head: () => ({
    meta: [
      { title: "A Dream Wave Media Vision" },
      { name: "robots", content: "noindex,nofollow,noarchive" },
    ],
  }),
});

function PublicVisionDeckPage() {
  const { token } = Route.useParams();
  const validToken = /^[a-f0-9]{64}$/i.test(token);

  const sessionId = useMemo(() => {
    if (typeof window === "undefined") return "server";
    const key = `waveos-vision-session:${token}`;
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem(key, created);
    return created;
  }, [token]);

  const deckQuery = useQuery({
    queryKey: ["public-vision-deck", token],
    enabled: validToken,
    retry: false,
    queryFn: async (): Promise<PublicVisionDeck | null> => {
      const { data, error } = await supabase.rpc("get_public_vision_deck", { _share_token: token });
      if (error) throw error;
      const row = data?.[0];
      if (!row) return null;
      return { ...row, content: parseVisionDeckContent(row.content) } as PublicVisionDeck;
    },
  });

  const recordEvent = useCallback(
    async (eventType: "opened" | "slide_viewed", slideKey?: string) => {
      if (!validToken) return;
      await supabase.rpc("record_vision_deck_event", {
        _share_token: token,
        _event_type: eventType,
        _session_id: sessionId,
        _slide_key: slideKey,
      });
    },
    [sessionId, token, validToken],
  );

  useEffect(() => {
    if (deckQuery.data) void recordEvent("opened");
  }, [deckQuery.data, recordEvent]);

  if (!validToken || (!deckQuery.isLoading && !deckQuery.data)) return <UnavailableVision />;

  if (deckQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#03060d] px-4 text-white">
        <div className="text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
          <p className="mt-4 text-sm text-white/55">Preparing your Dream Wave vision…</p>
        </div>
      </div>
    );
  }

  if (deckQuery.isError) return <UnavailableVision />;

  return (
    <VisionPresentation
      deck={deckQuery.data!}
      shareToken={token}
      onSlideChange={(slideKey) => {
        void recordEvent("slide_viewed", slideKey);
      }}
    />
  );
}

function UnavailableVision() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#03060d] px-4 text-white">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
          <AlertTriangle className="h-5 w-5 text-primary" />
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-primary">Dream Wave Media</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">This vision is not available.</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/50">
          The private link may have been disabled or replaced. Ask your Dream Wave contact for the current presentation link.
        </p>
        <Link
          to="/"
          className="mt-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white"
        >
          <Waves className="h-3.5 w-3.5" />
          Dream Wave Media
        </Link>
      </div>
    </div>
  );
}
