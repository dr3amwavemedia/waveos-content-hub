import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { refreshZernioConnections } from "@/lib/zernio.functions";

export const Route = createFileRoute("/social-connections/callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    workspaceId: typeof search.workspaceId === "string" ? search.workspaceId : undefined,
    provider: search.provider === "zernio" ? ("zernio" as const) : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: SocialConnectionsCallback,
  head: () => ({
    meta: [{ title: "Connected — WaveOS" }, { name: "robots", content: "noindex" }],
  }),
});

type CallbackStatus = "notifying" | "complete";

function SocialConnectionsCallback() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const refresh = useServerFn(refreshZernioConnections);
  const [status, setStatus] = useState<CallbackStatus>("notifying");

  useEffect(() => {
    const finish = async () => {
      if (search.provider === "zernio" && search.workspaceId && !search.error) {
        try {
          await refresh({ data: { workspaceId: search.workspaceId } });
        } catch (reason) {
          console.error("Could not refresh Zernio after OAuth callback", reason);
        }
      }
      const message = {
        type:
          search.provider === "zernio" ? "waveos:zernio-connected" : "waveos:ayrshare-connected",
        connectedAt: new Date().toISOString(),
      };

      // The connection flow was opened inside a popup.
      if (window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage(message, window.location.origin);
          setStatus("complete");

          window.setTimeout(() => window.close(), 800);
          return;
        } catch (error) {
          console.error("Could not notify the WaveOS window", error);
        }
      }

      // Mobile browsers may use a full-page redirect instead of a popup.
      setStatus("complete");
      window.setTimeout(() => {
        void navigate({ to: "/social", search: { view: "accounts" }, replace: true });
      }, 1000);
    };

    void finish();
  }, [navigate, refresh, search.error, search.provider, search.workspaceId]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="surface-card flex max-w-sm flex-col items-center gap-3 p-10 text-center">
        {status === "notifying" ? (
          <div className="rounded-full bg-primary/15 p-3 text-primary">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="rounded-full bg-emerald-500/15 p-3 text-emerald-300">
            <CheckCircle2 className="h-6 w-6" />
          </div>
        )}

        <div className="text-lg font-semibold">
          {status === "notifying" ? "Finishing connection" : "Account connected"}
        </div>

        <p className="text-sm text-muted-foreground">
          {search.error
            ? `Connection was not completed: ${search.error}`
            : window.opener
              ? "Returning you to WaveOS."
              : "Returning to your Social Media accounts."}
        </p>
      </div>
    </div>
  );
}
