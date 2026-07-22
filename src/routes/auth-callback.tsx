import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { WaveLogo } from "@/components/branding/wave-logo";

const POST_AUTH_NEXT_KEY = "waveos.postAuthNext";

export const Route = createFileRoute("/auth-callback")({
  component: AuthCallbackPage,
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s.next === "string" ? { next: s.next } : {},
  head: () => ({
    meta: [
      { title: "Signing in — WaveOS" },
      { name: "description", content: "Completing your secure WaveOS sign in." },
      { property: "og:title", content: "Signing in — WaveOS" },
      { property: "og:description", content: "Completing your secure WaveOS sign in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function safeNext(next: string | undefined): string {
  if (!next) return "/home";
  if (!next.startsWith("/") || next.startsWith("//")) return "/home";
  const pathname = next.split(/[?#]/, 1)[0];
  if (pathname === "/auth" || pathname === "/auth-callback") return "/home";
  return next;
}

function AuthCallbackPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [message, setMessage] = useState("Completing sign in…");

  useEffect(() => {
    let cancelled = false;

    const resolveTarget = () => {
      const stashed = sessionStorage.getItem(POST_AUTH_NEXT_KEY);
      const target = safeNext(stashed ?? search.next);
      if (stashed) sessionStorage.removeItem(POST_AUTH_NEXT_KEY);
      return target;
    };

    const goToTarget = () => {
      if (cancelled) return;
      const target = resolveTarget();
      if (target === "/home") navigate({ to: "/home", replace: true });
      else window.location.replace(target);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) goToTarget();
    });

    (async () => {
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          goToTarget();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (cancelled) return;
      setMessage("We couldn't complete the sign in. Please try again.");
      const target = safeNext(sessionStorage.getItem(POST_AUTH_NEXT_KEY) ?? search.next);
      navigate({ to: "/auth", search: { next: target }, replace: true });
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [navigate, search.next]);

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--color-primary)_18%,transparent),transparent_70%)]" />
      <div className="relative w-full max-w-md text-center">
        <div className="mb-8 flex justify-center">
          <Link to="/">
            <WaveLogo />
          </Link>
        </div>
        <div className="surface-card p-8">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">Signing you in</h1>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    </div>
  );
}