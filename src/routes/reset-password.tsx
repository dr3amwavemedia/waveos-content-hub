import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { WaveLogo } from "@/components/branding/wave-logo";

export const Route = createFileRoute("/reset-password")({
  component: ResetPassword,
  head: () => ({
    meta: [
      { title: "Reset password — WaveOS" },
      { name: "description", content: "Set a new password for your WaveOS account." },
      { property: "og:title", content: "Reset password — WaveOS" },
      { property: "og:description", content: "Set a new password for your WaveOS account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"checking" | "ready" | "expired">("checking");

  useEffect(() => {
    let cancelled = false;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    if (hash.get("error") || query.get("error")) {
      setStatus("expired");
      return;
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!cancelled && session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN")) setStatus("ready");
    });
    const timer = window.setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (!cancelled) setStatus(data.session ? "ready" : "expired");
    }, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      if (/session/i.test(error.message)) setStatus("expired");
      return toast.error(/session/i.test(error.message) ? "This reset link has expired. Request a new one." : error.message);
    }
    toast.success("Password updated. Welcome back.");
    navigate({ to: "/home", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <WaveLogo />
        </div>
        <div className="surface-card p-8">
          {status === "expired" ? (
            <>
              <h1 className="text-2xl font-semibold text-foreground">Reset link expired</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                This password reset link is no longer valid. Request a new one from the sign-in page.
              </p>
              <Link
                to="/auth"
                className="mt-6 flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                Back to sign in
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-foreground">Set a new password</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Choose a strong password (at least 8 characters) you haven't used before.
              </p>
              <form onSubmit={onSubmit} className="mt-6 space-y-4">
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-input bg-surface/60 px-3 py-2.5 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                  placeholder="New password"
                />
                <button
                  type="submit"
                  disabled={busy || status !== "ready"}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all hover:brightness-110 disabled:opacity-60"
                >
                  {(busy || status === "checking") && <Loader2 className="h-4 w-4 animate-spin" />}
                  Update password
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
