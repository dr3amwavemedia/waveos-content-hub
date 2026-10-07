import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { sendAccountSupportRequest, tryEmail } from "@/lib/transactional-email";
import { lovable } from "@/integrations/lovable";
import { WaveLogo } from "@/components/branding/wave-logo";

const POST_AUTH_NEXT_KEY = "waveos.postAuthNext";
const PUBLIC_SIGNUP_KEY = "waveos.publicSignup";
const PUBLIC_SIGNUP_PLAN_KEY = "waveos.publicSignupPlan";

type PublicSignupPlan =
  | "standard_monthly"
  | "standard_annual"
  | "full_monthly"
  | "full_annual"
  | "expanded_monthly"
  | "expanded_annual";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  validateSearch: (s: Record<string, unknown>): { next?: string; mode?: "signup" } => ({
    ...(typeof s.next === "string" ? { next: s.next } : {}),
    ...(s.mode === "signup" ? { mode: "signup" as const } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Sign in — WaveOS" },
      { name: "description", content: "Sign in to your WaveOS workspace." },
      { property: "og:title", content: "Sign in — WaveOS" },
      { property: "og:description", content: "Sign in to your WaveOS workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

// Only accept same-origin relative paths as post-signin destinations.
function safeNext(next: string | undefined): string {
  if (!next) return "/home";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/home";
  const pathname = next.split(/[?#]/, 1)[0];
  if (pathname === "/auth" || pathname === "/auth-callback") return "/home";
  return next;
}

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const requestedNext = safeNext(search.next);
  const [mode, setMode] = useState<"signin" | "signup" | "reset">(
    search.mode === "signup" ? "signup" : "signin",
  );
  const nextPath = mode === "signup" ? "/home" : requestedNext;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [signupPlan, setSignupPlan] = useState<PublicSignupPlan>("standard_monthly");
  const [annualBilling, setAnnualBilling] = useState(false);
  const [signupSent, setSignupSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    let cancelled = false;
    let navigated = false;
    const resolveNext = () => {
      const stashed =
        typeof window !== "undefined" ? sessionStorage.getItem(POST_AUTH_NEXT_KEY) : null;
      const target = safeNext(stashed ?? nextPath);
      if (stashed) sessionStorage.removeItem(POST_AUTH_NEXT_KEY);
      return target;
    };
    const goToTarget = () => {
      if (cancelled || navigated) return;
      navigated = true;
      if (sessionStorage.getItem(PUBLIC_SIGNUP_KEY) === "1") {
        window.location.replace("/auth-callback?public_signup=1&next=%2Fhome");
        return;
      }
      const target = resolveNext();
      if (target !== "/home") window.location.replace(target);
      else navigate({ to: "/home", replace: true });
    };
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!cancelled && data.session) goToTarget();
    };
    void checkSession();
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkSession();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const pollId = window.setInterval(() => void checkSession(), 2500);
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") window.setTimeout(goToTarget, 0);
    });
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearInterval(pollId);
      sub.subscription.unsubscribe();
    };
  }, [navigate, nextPath]);

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    sessionStorage.setItem(POST_AUTH_NEXT_KEY, nextPath);

    // Watchdog: a stalled auth request (network stall, blocked request) must
    // never leave the spinner running forever with no feedback. If the call
    // resolves late and succeeds, the SIGNED_IN handler still navigates.
    let watchdogFired = false;
    const watchdog = window.setTimeout(() => {
      watchdogFired = true;
      setBusy(false);
      toast.error("Sign-in is taking longer than expected. Check your connection and try again.");
    }, 20_000);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    window.clearTimeout(watchdog);
    if (!watchdogFired) setBusy(false);
    if (error) {
      sessionStorage.removeItem(POST_AUTH_NEXT_KEY);
      if (!watchdogFired) {
        toast.error(
          error.message === "Invalid login credentials"
            ? "That email or password isn't right."
            : error.message,
        );
      }
      return;
    }
    if (!watchdogFired) toast.success("Welcome back.");
  }

  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    sessionStorage.setItem(POST_AUTH_NEXT_KEY, "/home");
    sessionStorage.setItem(PUBLIC_SIGNUP_KEY, "1");
    sessionStorage.setItem(PUBLIC_SIGNUP_PLAN_KEY, signupPlan);
    const normalizedPromo = promoCode.trim().toUpperCase();
    if (normalizedPromo) {
      const { data: promo, error: promoError } = await (
        supabase.rpc as unknown as (
          name: string,
          args: Record<string, unknown>,
        ) => Promise<{
          data: Array<{ name: string; bonus_trial_days: number }> | null;
          error: Error | null;
        }>
      )("validate_os_promo_code", { _code: normalizedPromo });
      if (promoError || !promo?.length) {
        setBusy(false);
        sessionStorage.removeItem(POST_AUTH_NEXT_KEY);
        toast.error("That promo code is invalid, paused, expired, or fully redeemed.");
        return;
      }
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth-callback?public_signup=1&next=${encodeURIComponent("/home")}`,
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          account_source: "os_data",
          signup_source: "public_trial",
          ...(normalizedPromo ? { promo_code: normalizedPromo } : {}),
        },
      },
    });
    setBusy(false);
    if (error) {
      sessionStorage.removeItem(POST_AUTH_NEXT_KEY);
      toast.error(error.message);
      return;
    }
    if (data.session) {
      window.location.assign("/auth-callback?public_signup=1&next=%2Fhome");
      return;
    }
    setSignupSent(true);
    toast.success("Check your email to finish creating your WaveOS account.");
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    void tryEmail(() => sendAccountSupportRequest(email, "password_reset"));
    toast.success("Check your email for a reset link.");
    setMode("signin");
  }

  async function handleGoogle() {
    setBusy(true);

    try {
      sessionStorage.setItem(POST_AUTH_NEXT_KEY, nextPath);
      if (mode === "signup") sessionStorage.setItem(PUBLIC_SIGNUP_KEY, "1");
      else sessionStorage.removeItem(PUBLIC_SIGNUP_KEY);

      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/auth-callback${mode === "signup" ? "?public_signup=1" : ""}`,
        extraParams: {
          prompt: "select_account",
          ...(email ? { login_hint: email } : {}),
        },
      });

      if (result.error) throw result.error;

      if (!result.redirected) {
        if (result.tokens) {
          const { error } = await supabase.auth.setSession(result.tokens);
          if (error) throw error;
        }
        const target = safeNext(sessionStorage.getItem(POST_AUTH_NEXT_KEY) ?? nextPath);
        sessionStorage.removeItem(POST_AUTH_NEXT_KEY);
        if (target === "/home") navigate({ to: "/home", replace: true });
        else window.location.replace(target);
      }
    } catch (error) {
      sessionStorage.removeItem(POST_AUTH_NEXT_KEY);
      sessionStorage.removeItem(PUBLIC_SIGNUP_KEY);
      setBusy(false);
      console.error("[Google sign-in error]", error);
      toast.error(
        error instanceof Error ? error.message : "Couldn't sign in with Google. Please try again.",
      );
    }
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
              {mode === "signin"
                ? "Sign in to WaveOS"
                : mode === "signup"
                  ? "Sign up"
                  : "Reset your password"}
            </h1>
            {mode !== "signup" && (
              <p className="mt-2 text-sm text-muted-foreground">
                {mode === "signin"
                  ? "Welcome back — sign in to your workspace."
                  : "We'll email you a secure link to set a new password."}
              </p>
            )}
          </div>
          {mode === "signin" && (
            <>
              <button
                type="button"
                onClick={handleGoogle}
                disabled={busy || !hydrated}
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
            onSubmit={
              mode === "signin"
                ? handleEmailSignIn
                : mode === "signup"
                  ? handleEmailSignup
                  : handleReset
            }
            className="space-y-4"
          >
            {mode === "signup" && (
              <fieldset className="space-y-2">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <legend className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Choose your subscription
                  </legend>
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-foreground">
                    Monthly
                    <button
                      type="button"
                      role="switch"
                      aria-checked={annualBilling}
                      onClick={() => {
                        const nextAnnual = !annualBilling;
                        setAnnualBilling(nextAnnual);
                        const plan = signupPlan.split("_")[0] as "standard" | "full" | "expanded";
                        setSignupPlan(`${plan}_${nextAnnual ? "annual" : "monthly"}`);
                      }}
                      className={`relative h-6 w-11 rounded-full transition ${annualBilling ? "bg-primary" : "bg-border"}`}
                    >
                      <span
                        className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${annualBilling ? "left-6" : "left-1"}`}
                      />
                    </button>
                    Annual
                  </label>
                </div>
                {(
                  [
                    [
                      "standard",
                      "Ripple",
                      annualBilling ? "$479.88 / year" : "$39.99 / month",
                      "3 accounts · core tools",
                      [
                        "3 connected social accounts",
                        "Create and publish content",
                        "Analytics and media library",
                      ],
                    ],
                    [
                      "full",
                      "Current",
                      annualBilling ? "$798 / year · save 5%" : "$70 / month",
                      "3 accounts · AI Assist + scheduling",
                      ["Everything in Ripple", "Generative AI Assist", "Post scheduling"],
                    ],
                    [
                      "expanded",
                      "Tidal",
                      annualBilling ? "$1,296 / year · save 10%" : "$120 / month",
                      "8 accounts · AI Assist + scheduling",
                      [
                        "Everything in Current",
                        "8 connected social accounts",
                        "Best for growing teams",
                      ],
                    ],
                  ] as const
                ).map(([plan, label, price, detail, features]) => {
                  const value =
                    `${plan}_${annualBilling ? "annual" : "monthly"}` as PublicSignupPlan;
                  const selected = signupPlan === value;
                  return (
                    <button
                      type="button"
                      key={plan}
                      onClick={() => setSignupPlan(value)}
                      aria-pressed={selected}
                      className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition-all duration-200 active:scale-[0.98] ${selected ? "-translate-y-0.5 border-primary bg-primary/10 shadow-lg shadow-primary/10" : "border-border bg-surface/50 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-elevated"}`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className={`h-3.5 w-3.5 rounded-full border ${selected ? "border-primary bg-primary ring-2 ring-primary/20" : "border-border"}`}
                          />
                          <span>
                            <span className="block font-semibold text-foreground">{label}</span>
                            <span className="block text-[11px] text-muted-foreground">
                              {detail}
                            </span>
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-foreground">
                          {price}
                        </span>
                      </span>
                      {selected && (
                        <span className="mt-3 grid gap-1 border-t border-primary/20 pt-3 text-[11px] text-muted-foreground">
                          {features.map((feature) => (
                            <span key={feature} className="flex items-center gap-2">
                              <span className="text-primary">✓</span> {feature}
                            </span>
                          ))}
                        </span>
                      )}
                    </button>
                  );
                })}
                <p className="text-[11px] leading-4 text-muted-foreground">
                  After confirming your email, Stripe will securely collect payment. Workspace tools
                  unlock only after payment succeeds.
                </p>
              </fieldset>
            )}
            {mode === "signup" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    First name
                  </label>
                  <input
                    autoComplete="given-name"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full rounded-lg border border-input bg-surface/60 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                    placeholder="First"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Last name
                  </label>
                  <input
                    autoComplete="family-name"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full rounded-lg border border-input bg-surface/60 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                    placeholder="Last"
                  />
                </div>
              </div>
            )}
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
            {mode === "signup" && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Promo code <span className="font-normal opacity-70">(optional)</span>
                </label>
                <input
                  autoComplete="off"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  className="w-full rounded-lg border border-input bg-surface/60 px-3 py-2.5 font-mono text-sm uppercase tracking-wider text-foreground placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                  placeholder="Enter a promo code"
                  maxLength={24}
                />
              </div>
            )}
            {(mode === "signin" || mode === "signup") && (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Password</label>
                  <button
                    hidden={mode !== "signin"}
                    type="button"
                    onClick={() => setMode("reset")}
                    className="text-xs text-primary hover:text-primary-glow"
                  >
                    Forgot?
                  </button>
                </div>
                <input
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-input bg-surface/60 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                  placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
                  minLength={mode === "signup" ? 8 : undefined}
                />
              </div>
            )}
            <button
              type="submit"
              disabled={busy || !hydrated}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all hover:brightness-110 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account & continue to payment"
                  : "Send reset link"}
            </button>
            {(mode === "reset" || mode === "signup") && (
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setSignupSent(false);
                }}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
              >
                {mode === "signup" ? "Already have an account? Sign in" : "← Back to sign in"}
              </button>
            )}
          </form>
          {signupSent && (
            <p className="mt-4 rounded-lg border border-primary/20 bg-primary/10 p-3 text-center text-xs text-foreground">
              We sent a confirmation link to {email}. Open it to finish setup and create your trial
              workspace.
            </p>
          )}
          {mode !== "signup" && (
            <p className="mt-6 text-center text-xs text-muted-foreground">
              New to WaveOS?{" "}
              <button
                type="button"
                onClick={() => setMode("signup")}
                className="font-medium text-primary hover:text-primary-glow"
              >
                Start a free trial
              </button>
              . Technical problem?{" "}
              <a
                href="mailto:jean@dwmsrq.com?subject=WaveOS%20technical%20support"
                className="font-medium text-primary hover:text-primary-glow"
              >
                jean@dwmsrq.com
              </a>
            </p>
          )}
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
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4-5.5 4-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12S6.7 21.6 12 21.6c6.9 0 9.5-4.8 9.5-7.3 0-.5-.1-.9-.1-1.3H12z"
      />
      <path
        fill="#34A853"
        d="M3.9 7.3l3.2 2.3c.9-2.1 3-3.7 5.4-3.7 1.5 0 2.7.5 3.6 1.4l2.7-2.6C17 3 14.7 2 12 2 8.1 2 4.7 4.2 3.1 7.4l.8-.1z"
      />
      <path
        fill="#FBBC05"
        d="M12 22c2.6 0 4.9-.9 6.5-2.4l-3-2.5c-.8.6-2 1-3.5 1-2.7 0-5-1.8-5.8-4.3l-3.1 2.4C4.7 19.7 8.1 22 12 22z"
      />
      <path
        fill="#4285F4"
        d="M21.5 12.3c0-.7-.1-1.3-.2-1.9H12v3.9h5.4c-.2 1.2-.9 2.1-1.9 2.8l3 2.4c1.8-1.6 2.9-4 2.9-7.2z"
      />
    </svg>
  );
}
