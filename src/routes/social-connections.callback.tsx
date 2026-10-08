import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { refreshZernioConnections } from "@/lib/zernio.functions";

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export const Route = createFileRoute("/social-connections/callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    workspaceId: stringValue(search.workspaceId),
    provider: search.provider === "zernio" ? ("zernio" as const) : undefined,
    platform: stringValue(search.platform),
    connected: stringValue(search.connected),
    error: stringValue(search.error),
    platformError: stringValue(search.platformerror) ?? stringValue(search.platform_error),
    platformErrorReason:
      stringValue(search.platformerrorreason) ??
      stringValue(search.platform_error_description) ??
      stringValue(search.error_description),
  }),
  component: SocialConnectionsCallback,
  head: () => ({
    meta: [{ title: "Social connection — WaveOS" }, { name: "robots", content: "noindex" }],
  }),
});

type CallbackStatus = "finishing" | "success" | "error";

function SocialConnectionsCallback() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const refresh = useServerFn(refreshZernioConnections);
  const providerError = search.error ?? search.platformErrorReason ?? search.platformError;
  const [status, setStatus] = useState<CallbackStatus>(providerError ? "error" : "finishing");
  const [message, setMessage] = useState(
    providerError
      ? "The social network did not complete the connection. Please return to WaveOS and try again."
      : "WaveOS is securely confirming your account.",
  );
  const [hasOpener, setHasOpener] = useState(false);
  const platformName = useMemo(() => {
    if (!search.platform) return "Social account";
    if (search.platform.toLowerCase() === "gmb") return "Google Business";
    return search.platform.charAt(0).toUpperCase() + search.platform.slice(1);
  }, [search.platform]);

  useEffect(() => {
    setHasOpener(Boolean(window.opener));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const returnToAccounts = () => {
      if (window.opener && !window.opener.closed) {
        window.close();
        return;
      }
      void navigate({ to: "/social", search: { view: "accounts" }, replace: true });
    };

    const finish = async () => {
      let successful = !providerError;
      if (successful && search.provider === "zernio" && search.workspaceId) {
        try {
          await refresh({ data: { workspaceId: search.workspaceId } });
        } catch (reason) {
          console.error("Could not confirm social connection after OAuth callback", reason);
          successful = false;
          if (!cancelled) {
            setMessage(
              "Your authorization returned to WaveOS, but the account could not be confirmed yet. Return to Social Media and tap Refresh account health.",
            );
          }
        }
      }

      if (cancelled) return;
      setStatus(successful ? "success" : "error");
      if (successful) setMessage("Your account is connected and ready to use in WaveOS.");

      if (window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage(
            {
              type: "waveos:zernio-connected",
              success: successful,
              connectedAt: new Date().toISOString(),
            },
            window.location.origin,
          );
        } catch (error) {
          console.error("Could not notify the WaveOS window", error);
        }
      }

      timer = window.setTimeout(returnToAccounts, successful ? 1400 : 4500);
    };

    void finish();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [navigate, providerError, refresh, search.provider, search.workspaceId]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="surface-card flex max-w-sm flex-col items-center gap-3 p-10 text-center">
        {status === "finishing" ? (
          <div className="rounded-full bg-primary/15 p-3 text-primary">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : status === "success" ? (
          <div className="rounded-full bg-emerald-500/15 p-3 text-emerald-300">
            <CheckCircle2 className="h-6 w-6" />
          </div>
        ) : (
          <div className="rounded-full bg-rose-500/15 p-3 text-rose-300">
            <XCircle className="h-6 w-6" />
          </div>
        )}

        <div className="text-lg font-semibold">
          {status === "finishing"
            ? "Finishing connection"
            : status === "success"
              ? `${platformName} connected`
              : "Connection wasn’t completed"}
        </div>

        <p className="text-sm text-muted-foreground">{message}</p>
        {status !== "finishing" && (
          <button
            type="button"
            onClick={() => {
              if (window.opener && !window.opener.closed) window.close();
              else void navigate({ to: "/social", search: { view: "accounts" }, replace: true });
            }}
            className="mt-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            {hasOpener ? "Close and return to WaveOS" : "Return to Social Media"}
          </button>
        )}
      </div>
    </div>
  );
}
