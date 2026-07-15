import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/social-connections/callback")({
  component: Callback,
  head: () => ({ meta: [{ title: "Connected — WaveOS" }, { name: "robots", content: "noindex" }] }),
});

function Callback() {
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => {
      if (window.opener) {
        window.close();
      } else {
        void navigate({ to: "/social-accounts" });
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="surface-card flex flex-col items-center gap-3 p-10 text-center">
        <div className="rounded-full bg-emerald-500/15 p-3 text-emerald-300">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div className="text-lg font-semibold">Account connected</div>
        <p className="text-sm text-muted-foreground">You can close this window and return to WaveOS.</p>
      </div>
    </div>
  );
}
