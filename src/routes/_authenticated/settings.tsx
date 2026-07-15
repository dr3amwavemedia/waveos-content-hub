import { createFileRoute } from "@tanstack/react-router";
import { Settings as SettingsIcon } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-waveos";
import { useWorkspace } from "@/components/app/workspace-context";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Settings — WaveOS" }] }),
});

function SettingsPage() {
  const { data: user } = useCurrentUser();
  const { activeWorkspace } = useWorkspace();

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
          Account
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Settings
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Manage your profile and workspace preferences.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface-card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            You
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="Name" value={[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "—"} />
            <Row label="Email" value={user?.email ?? "—"} />
            <Row
              label="Role"
              value={
                user?.isDreamWaveOwner
                  ? "Dream Wave Owner"
                  : user?.isStaff
                    ? "Dream Wave Team"
                    : "Client"
              }
            />
          </dl>
        </div>

        <div className="surface-card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Active workspace
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="Name" value={activeWorkspace?.name ?? "—"} />
            <Row label="Industry" value={activeWorkspace?.industry ?? "Not set"} />
            <Row label="Timezone" value={activeWorkspace?.timezone ?? "—"} />
            <Row label="Your access" value={activeWorkspace?.role ?? "—"} />
          </dl>
        </div>
      </div>

      <div className="surface-card flex items-start gap-4 p-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <SettingsIcon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">
            More settings coming soon
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Notification preferences, timezone, language, and workspace admin
            tools land in later phases.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,100px)_minmax(0,1fr)] items-baseline gap-3">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium text-foreground">{value}</dd>
    </div>
  );
}
