import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { WaveLogo } from "@/components/branding/wave-logo";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Sign in — WaveOS" },
      {
        name: "description",
        content: "Sign in to your Dream Wave Media WaveOS workspace.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Redirect signed-in users into the app
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!cancelled && data.session) {
        navigate({ to: "/home", replace: true });
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") navigate({ to: "/home", replace: true });
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message === "Invalid login credentials"
        ? "That email or password isn't right."
        : error.message);
      return;
    }
    toast.success("Welcome back.");
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
        data: { full_name: fullName },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Account created — let's set up your workspace.");
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Check your email for a reset link.");
    setMode("signin");
  }

  async function handleGoogle() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/auth",
    });
    if (result.error) {
      setBusy(false);
      toast.error("Couldn't sign in with Google. Please try again.");
      return;
    }
    if (result.redirected) return;
    // popup path: session set
    setBusy(false);
    navigate({ to: "/home", replace: true });
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--color-primary)_18%,transparent),transparent_70%)]" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Link to="/">
            <WaveLogo />
          </Link>
        </div>

        <div className="surface-card p-8">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {mode === "signin" ? "Sign in to WaveOS" : "Reset your password"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {mode === "signin"
                ? "Invite‑only access for Dream Wave Media clients."
                : "We'll email you a secure link to set a new password."}
            </p>
          </div>

          {mode === "signin" && (
            <>
              <button
                type="button"
                onClick={handleGoogle}
                disabled={busy}
                className="mb-4 flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-surface/60 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-elevated disabled:opacity-60"
              >
                <GoogleIcon /> Continue with Google
              </button>
              <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                or
                <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <form
            onSubmit={mode === "signin" ? handleEmailSignIn : handleReset}
            className="space-y-4"
          >
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-input bg-surface/60 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                placeholder="you@company.com"
              />
            </div>

            {mode === "signin" && (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setMode("reset")}
                    className="text-xs text-primary hover:text-primary-glow"
                  >
                    Forgot?
                  </button>
                </div>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-input bg-surface/60 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                  placeholder="••••••••"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all hover:brightness-110 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Send reset link"}
            </button>

            {mode === "reset" && (
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
              >
                ← Back to sign in
              </button>
            )}
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Don't have an account? Dream Wave Media will invite you when your
            workspace is ready.
          </p>
        </div>

        <p className="mt-6 text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          A Dream Wave Media platform
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4-5.5 4-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12S6.7 21.6 12 21.6c6.9 0 9.5-4.8 9.5-7.3 0-.5-.1-.9-.1-1.3H12z"/>
      <path fill="#34A853" d="M3.9 7.3l3.2 2.3c.9-2.1 3-3.7 5.4-3.7 1.5 0 2.7.5 3.6 1.4l2.7-2.6C17 3 14.7 2 12 2 8.1 2 4.7 4.2 3.1 7.4l.8-.1z"/>
      <path fill="#FBBC05" d="M12 22c2.6 0 4.9-.9 6.5-2.4l-3-2.5c-.8.6-2 1-3.5 1-2.7 0-5-1.8-5.8-4.3l-3.1 2.4C4.7 19.7 8.1 22 12 22z"/>
      <path fill="#4285F4" d="M21.5 12.3c0-.7-.1-1.3-.2-1.9H12v3.9h5.4c-.2 1.2-.9 2.1-1.9 2.8l3 2.4c1.8-1.6 2.9-4 2.9-7.2z"/>
    </svg>
  );
}
