import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, MailCheck, ShieldAlert, MailX } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { WaveLogo } from "@/components/branding/wave-logo";

const searchSchema = z.object({
  token: z.string().min(8).optional(),
});

export const Route = createFileRoute("/accept-invite")({
  validateSearch: (s) => searchSchema.parse(s),
  component: AcceptInvitePage,
  ssr: false,
  head: () => ({
    meta: [{ title: "Accept invite — WaveOS" }, { name: "robots", content: "noindex" }],
  }),
});

type InvitePublic = {
  email: string;
  workspace_id: string | null;
  workspace_name: string | null;
  workspace_role: "owner" | "approver" | "viewer";
  status: "pending" | "accepted" | "expired" | "revoked";
  expires_at: string;
};

function AcceptInvitePage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();

  const [status, setStatus] = useState<
    "loading" | "no-token" | "invalid" | "expired" | "revoked" | "used" | "form" | "accepting" | "done"
  >("loading");
  const [invite, setInvite] = useState<InvitePublic | null>(null);
  const [sessionUser, setSessionUser] = useState<{ id: string; email: string } | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [busy, setBusy] = useState(false);

  // Keep token in memory but strip from the visible URL immediately.
  useEffect(() => {
    if (typeof window === "undefined" || !token) return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("token")) {
      url.searchParams.delete("token");
      window.history.replaceState({}, "", url.toString());
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setStatus("no-token");
      return;
    }
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) setSessionUser({ id: auth.user.id, email: auth.user.email ?? "" });

      const { data, error } = await supabase.rpc("get_invite_public", { _token: token });
      const row = (data as InvitePublic[] | null)?.[0];
      if (error || !row) {
        setStatus("invalid");
        return;
      }
      setInvite(row);
      if (row.status === "expired") setStatus("expired");
      else if (row.status === "revoked") setStatus("revoked");
      else if (row.status === "accepted") setStatus("used");
      else setStatus("form");
    })();
  }, [token]);

  async function acceptWithSession() {
    if (!token) return;
    setStatus("accepting");
    const { error } = await supabase.rpc("accept_invite", { _token: token });
    if (error) {
      toast.error(mapAcceptError(error.message));
      setStatus("form");
      return;
    }
    toast.success("You're in. Welcome to WaveOS.");
    setStatus("done");
    setTimeout(() => navigate({ to: "/home", replace: true }), 400);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invite || !token) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: invite.email,
          password,
          options: {
            data: { first_name: firstName, last_name: lastName },
            emailRedirectTo: `${window.location.origin}/accept-invite`,
          },
        });
        if (error) {
          toast.error(error.message);
          setBusy(false);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: invite.email,
          password,
        });
        if (error) {
          toast.error(error.message);
          setBusy(false);
          return;
        }
      }
      await acceptWithSession();
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading")
    return (
      <Center>
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </Center>
    );

  if (status === "no-token" || status === "invalid" || status === "revoked" || status === "used") {
    return (
      <Frame>
        <ErrorPanel
          icon={ShieldAlert}
          title={status === "used" ? "This invite has already been used" : "This invite is no longer valid"}
          body="It may have been used, revoked, or the link is incorrect. Contact Dream Wave Media for a new invite."
        />
      </Frame>
    );
  }

  if (status === "expired") {
    return (
      <Frame>
        <ErrorPanel
          icon={MailX}
          title="This invite has expired"
          body="Invites are time-limited for security. Ask Dream Wave Media to send you a fresh link — it takes seconds."
          contact
        />
      </Frame>
    );
  }

  const info = invite!;
  const emailMatchesSession = sessionUser && sessionUser.email.toLowerCase() === info.email.toLowerCase();

  return (
    <Frame>
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/20">
          <MailCheck className="h-5 w-5" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {info.workspace_name ? `Join ${info.workspace_name}` : "Accept your invite"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Invited as <span className="text-foreground">{info.email}</span> · role{" "}
          <span className="text-foreground capitalize">{info.workspace_role}</span>
        </p>
      </div>

      {sessionUser ? (
        emailMatchesSession ? (
          <button
            onClick={acceptWithSession}
            disabled={status === "accepting"}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-60"
          >
            {status === "accepting" && <Loader2 className="h-4 w-4 animate-spin" />}
            Accept & enter WaveOS
          </button>
        ) : (
          <div className="space-y-3 text-center">
            <p className="text-sm text-muted-foreground">
              You're signed in as <span className="text-foreground">{sessionUser.email}</span>, but this invite is for{" "}
              <span className="text-foreground">{info.email}</span>. For security, invites can only be accepted by their
              intended recipient.
            </p>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                setSessionUser(null);
              }}
              className="w-full rounded-lg border border-border bg-surface/60 px-3 py-2 text-sm text-foreground hover:bg-elevated"
            >
              Sign out and continue as {info.email}
            </button>
          </div>
        )
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="mb-2 flex overflow-hidden rounded-lg border border-border bg-surface/60 text-xs">
            {(["signup", "signin"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={
                  "flex-1 py-2 font-medium " +
                  (mode === m ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground")
                }
              >
                {m === "signup" ? "Create account" : "Already have one"}
              </button>
            ))}
          </div>

          {mode === "signup" && (
            <div className="grid grid-cols-2 gap-2">
              <input
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                className={inputCls}
              />
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                className={inputCls}
              />
            </div>
          )}

          <input readOnly value={info.email} className={inputCls + " opacity-70"} />
          <input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "Choose a password" : "Password"}
            className={inputCls}
            minLength={8}
          />

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "signup" ? "Create account & join" : "Sign in & join"}
          </button>
        </form>
      )}
    </Frame>
  );
}

const inputCls =
  "w-full rounded-lg border border-input bg-surface/60 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40";

function ErrorPanel({
  icon: Icon,
  title,
  body,
  contact,
}: {
  icon: typeof ShieldAlert;
  title: string;
  body: string;
  contact?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/15 text-destructive ring-1 ring-destructive/30">
        <Icon className="h-5 w-5" />
      </div>
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {contact && (
          <a
            href="mailto:dr3amwavemedia@outlook.com?subject=WaveOS%20invite%20request"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110"
          >
            Contact Dream Wave Media
          </a>
        )}
        <Link
          to="/auth"
          className="rounded-lg border border-border bg-surface/60 px-4 py-2 text-sm text-foreground hover:bg-elevated"
        >
          Go to sign in
        </Link>
      </div>
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--color-primary)_18%,transparent),transparent_70%)]" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Link to="/">
            <WaveLogo />
          </Link>
        </div>
        <div className="surface-card p-8">{children}</div>
        <p className="mt-6 text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          A Dream Wave Media platform
        </p>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center">{children}</div>;
}

function mapAcceptError(msg: string) {
  if (msg.includes("invite_expired")) return "This invite has expired.";
  if (msg.includes("invite_already_used")) return "This invite was already used.";
  if (msg.includes("invite_revoked")) return "This invite has been revoked.";
  if (msg.includes("invite_email_mismatch")) return "This invite is for a different email address.";
  if (msg.includes("invite_not_found")) return "Invite not found.";
  if (msg.includes("not_authenticated")) return "Please sign in first.";
  return "Couldn't accept invite. Please try again.";
}
