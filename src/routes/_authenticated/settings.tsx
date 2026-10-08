import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  BookOpen,
  Cloud,
  ExternalLink,
  Image,
  Loader2,
  Palette,
  Settings as SettingsIcon,
  ShieldCheck,
  Unplug,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useActualCurrentUser, useCurrentUser } from "@/hooks/use-waveos";
import { useWorkspace } from "@/components/app/workspace-context";
import { supabase } from "@/integrations/supabase/client";
import {
  disconnectExternalMedia,
  getExternalMediaStatus,
  startExternalMediaConnection,
  type ExternalMediaProvider,
} from "@/hooks/use-external-media";
import {
  DEFAULT_WORKSPACE_ACCENT,
  useWorkspaceBranding,
  workspaceBrandingError,
  workspaceThemeStyle,
} from "@/hooks/use-workspace-branding";
import {
  disconnectFrameioService,
  getFrameioServiceStatus,
  startFrameioServiceConnection,
} from "@/hooks/use-frameio";
import { TeamSettings } from "@/components/app/team-settings";
import { EmailAutomationSettings } from "@/components/app/email-automation-settings";
import { openWorkspaceTour } from "@/components/app/workspace-tour";
import { ClientDocumentRecords } from "@/components/app/client-document-records";
import {
  canViewClientFinancials,
  clientAccountAccessLabel,
  clientAccountAccess,
} from "@/lib/client-account-access";
import {
  createSocialBillingPortal,
  createSocialSubscriptionCheckout,
  getSocialSubscription,
} from "@/lib/social-subscriptions.functions";
import { publicSubscriptionActive, usePermissions } from "@/hooks/use-permissions";

const db = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Settings — WaveOS" }] }),
});

function SettingsPage() {
  const { data: user } = useCurrentUser();
  const { data: actualUser } = useActualCurrentUser();
  const { activeWorkspace } = useWorkspace();
  const { subscription, isLoading: permissionsLoading, isStaff } = usePermissions();
  const qc = useQueryClient();
  useEffect(() => {
    const showStorageResult = (connected: string | null, error: string | null) => {
      if (connected === "google_drive") {
        toast.success("Google Drive connected with file access.");
        void qc.invalidateQueries({ queryKey: ["external-media-status"] });
      } else if (connected === "dropbox") {
        toast.success("Dropbox connected.");
        void qc.invalidateQueries({ queryKey: ["external-media-status"] });
      } else if (error) {
        const messages: Record<string, string> = {
          google_scope_required:
            "Google Drive permission was not accepted. Reconnect and allow Drive access when Google asks.",
          invalid_state: "The storage sign-in expired or was cancelled. Please reconnect.",
          token_exchange: "Google could not finish the connection. Please reconnect and try again.",
          profile: "Google connected, but WaveOS could not read the selected account.",
          connection_save: "WaveOS could not securely save the storage connection.",
        };
        toast.error(messages[error] ?? "Storage could not be connected. Please try again.");
      }
    };
    const url = new URL(window.location.href);
    const error = url.searchParams.get("storage_error");
    const connected = url.searchParams.get("storage_connected");
    if (error || connected) {
      showStorageResult(connected, error);
      url.searchParams.delete("storage_error");
      url.searchParams.delete("storage_connected");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as Record<string, unknown> | null;
      if (data?.type !== "waveos:external-media-oauth") return;
      showStorageResult(
        data.connected === true && typeof data.provider === "string" ? data.provider : null,
        typeof data.error === "string" ? data.error : null,
      );
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [qc]);
  const canManageApproval =
    !user?.isStaff && (activeWorkspace?.role === "owner" || activeWorkspace?.role === "admin");
  const canManageBranding =
    Boolean(user?.isStaff) ||
    activeWorkspace?.role === "owner" ||
    activeWorkspace?.role === "admin";
  const canManageTeam =
    canManageBranding &&
    (activeWorkspace?.data_source !== "os_data" || subscription?.plan === "expanded");
  const oneTimeClient =
    activeWorkspace?.data_source === "client_data" && activeWorkspace.agreement_term === "one_time";
  const canManageConnections = Boolean(
    activeWorkspace?.role === "owner" ||
    activeWorkspace?.role === "admin" ||
    actualUser?.isDreamWaveOwner ||
    (actualUser?.isStaff && actualUser.staffType === "media_manager"),
  );
  const canViewFinancials = canViewClientFinancials(activeWorkspace?.role);
  const automaticApproval = activeWorkspace?.approval_required === false;
  const updateApproval = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!activeWorkspace) throw new Error("No workspace selected.");
      const { error } = await supabase.rpc("set_workspace_automatic_content_approval", {
        _workspace_id: activeWorkspace.id,
        _enabled: enabled,
      });
      if (error) throw error;
    },
    onSuccess: async (_, enabled) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["waveos", "workspaces"] }),
        qc.invalidateQueries({ queryKey: ["workspace-access", activeWorkspace?.id] }),
      ]);
      toast.success(
        enabled ? "Automatic post approval is on." : "Post approval is required again.",
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update approval settings."),
  });

  const paymentRequired =
    !isStaff &&
    activeWorkspace?.data_source === "os_data" &&
    !permissionsLoading &&
    !publicSubscriptionActive(subscription);

  if (paymentRequired && activeWorkspace) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Subscription required
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Choose your WaveOS plan
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Complete secure payment with Stripe to unlock your workspace. Your account and workspace
            are saved, but WaveOS tools remain unavailable until payment succeeds.
          </p>
        </header>
        <SocialPlanSettings workspaceId={activeWorkspace.id} canManage />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Account</p>
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
            <Row
              label="Name"
              value={[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "—"}
            />
            <Row label="Email" value={user?.email ?? "—"} />
            <Row
              label="Role"
              value={
                user?.isDreamWaveOwner
                  ? "Dream Wave Owner"
                  : user?.isStaff
                    ? "Dream Wave Team"
                    : activeWorkspace?.data_source === "os_data"
                      ? "WaveOS member"
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
            <Row
              label="Your access"
              value={
                activeWorkspace
                  ? clientAccountAccessLabel(clientAccountAccess(activeWorkspace.role))
                  : "—"
              }
            />
          </dl>
        </div>
      </div>

      {!user?.isStaff && activeWorkspace?.data_source === "client_data" && canViewFinancials && (
        <ClientDocumentRecords workspaceId={activeWorkspace.id} clientName={activeWorkspace.name} />
      )}

      {activeWorkspace?.data_source === "client_data" && canManageApproval && (
        <div className="surface-card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Automatic post approval</h3>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Turn this on during busy periods to let your Dream Wave Media manager schedule and
                publish without waiting for individual approvals. You can turn it off anytime.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={automaticApproval}
            disabled={updateApproval.isPending}
            onClick={() => updateApproval.mutate(!automaticApproval)}
            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${automaticApproval ? "bg-primary" : "bg-elevated ring-1 ring-border"}`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${automaticApproval ? "translate-x-7" : "translate-x-1"}`}
            />
            <span className="sr-only">Automatic post approval</span>
          </button>
        </div>
      )}

      {activeWorkspace?.data_source === "os_data" && canManageBranding && (
        <SocialPlanSettings workspaceId={activeWorkspace.id} canManage={canManageBranding} />
      )}

      {activeWorkspace && canManageBranding && (
        <WorkspaceBrandingEditor
          workspaceId={activeWorkspace.id}
          workspaceName={activeWorkspace.name}
        />
      )}

      {activeWorkspace &&
        (activeWorkspace.data_source !== "os_data" || subscription?.plan === "expanded") && (
          <TeamSettings
            workspaceId={activeWorkspace.id}
            canManage={canManageTeam && !oneTimeClient}
          />
        )}

      {user?.isDreamWaveOwner && <FrameioServiceConnectionCard />}

      {user?.isDreamWaveOwner && <EmailAutomationSettings />}

      {activeWorkspace && !oneTimeClient && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Connected media storage</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              One connection is shared by this workspace's authorized admins and Social Managers.
              Files stay in the client's storage account.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <StorageConnectionCard
              provider="google_drive"
              workspaceId={activeWorkspace.id}
              label="Google Drive"
              canManage={canManageConnections}
            />
            <StorageConnectionCard
              provider="dropbox"
              workspaceId={activeWorkspace.id}
              label="Dropbox"
              canManage={canManageConnections}
            />
          </div>
        </section>
      )}

      {!user?.isStaff && (
        <section className="surface-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Workspace guide</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Reopen the introduction to your available pages and tools.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openWorkspaceTour}
            className="min-h-11 w-full rounded-xl border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/15 sm:w-auto"
          >
            Open guide
          </button>
        </section>
      )}

      <div className="surface-card flex items-start gap-4 p-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <SettingsIcon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">More settings coming soon</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Notification preferences, timezone, language, and workspace admin tools land in later
            phases.
          </p>
        </div>
      </div>
    </div>
  );
}

function SocialPlanSettings({
  workspaceId,
  canManage,
}: {
  workspaceId: string;
  canManage: boolean;
}) {
  const [annualBilling, setAnnualBilling] = useState(false);
  const getPlan = useServerFn(getSocialSubscription);
  const checkout = useServerFn(createSocialSubscriptionCheckout);
  const billingPortal = useServerFn(createSocialBillingPortal);
  const query = useQuery({
    queryKey: ["social-subscription", workspaceId],
    queryFn: () => getPlan({ data: { workspaceId } }),
  });
  const subscribe = useMutation({
    mutationFn: (input: {
      plan: "standard" | "full" | "expanded";
      interval: "monthly" | "annual";
    }) => checkout({ data: { workspaceId, ...input } }),
    onSuccess: (result) => {
      if (result.url) window.location.assign(result.url);
      else toast.error("Stripe did not return a checkout link.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not open checkout."),
  });
  const manageBilling = useMutation({
    mutationFn: () => billingPortal({ data: { workspaceId } }),
    onSuccess: (result) => window.location.assign(result.url),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not open billing settings."),
  });
  const subscription = query.data?.subscription;
  return (
    <section className="surface-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            WaveOS subscription
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Plan and billing</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Manage your social account limit, renewal, and payment method in one place.
          </p>
        </div>
        <span className="rounded-full border border-border bg-elevated px-3 py-1 text-xs font-semibold text-foreground">
          {subscription
            ? `${query.data?.plans[subscription.plan as keyof typeof query.data.plans]?.name ?? subscription.plan} · ${query.data?.connectedAccounts ?? 0}/${subscription.account_limit} accounts`
            : "Not started"}
        </span>
      </div>
      {subscription &&
        (subscription.payment_failure_count > 0 || subscription.service_locked_at) && (
          <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
            <strong>
              {subscription.service_locked_at
                ? "Social tools are paused"
                : "Your renewal payment needs attention"}
            </strong>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {subscription.service_locked_at
                ? subscription.payment_failure_count >= 2
                  ? "Two payment attempts were unsuccessful. Your connections and content are safe; update billing and access will restore after Stripe confirms payment."
                  : "Your promotional trial ended and the first subscription payment was unsuccessful. Your connections and content are safe; update billing to restore access."
                : "The first payment attempt was unsuccessful. You can keep using WaveOS while Stripe retries, but please update your payment method to avoid a pause."}
            </p>
          </div>
        )}
      {subscription?.internal_test_access && (
        <div className="mt-4 rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-foreground">
          <strong>Internal test access</strong>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            This workspace has full{" "}
            {query.data?.plans[subscription.plan]?.name ?? subscription.plan} plan access for
            product testing. No Stripe subscription or payment is attached.
          </p>
        </div>
      )}
      {canManage && !subscription?.internal_test_access && subscription?.stripe_customer_id && (
        <button
          type="button"
          disabled={manageBilling.isPending}
          onClick={() => manageBilling.mutate()}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-elevated px-4 text-sm font-semibold text-foreground hover:border-primary/40 disabled:opacity-50"
        >
          {manageBilling.isPending ? "Opening Stripe…" : "Manage payment method"}
        </button>
      )}
      {canManage && !subscription?.internal_test_access && (
        <div className="mt-5">
          <div className="mb-4 flex items-center justify-end gap-2 text-xs font-semibold text-foreground">
            Monthly
            <button
              type="button"
              role="switch"
              aria-checked={annualBilling}
              onClick={() => setAnnualBilling((value) => !value)}
              className={`relative h-6 w-11 rounded-full transition ${annualBilling ? "bg-primary" : "bg-border"}`}
            >
              <span
                className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${annualBilling ? "left-6" : "left-1"}`}
              />
            </button>
            Annual
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {(
              [
                {
                  plan: "standard",
                  name: "Ripple",
                  detail: "3 accounts · core tools",
                  monthly: "$39.99 / month",
                  annual: "$479.88 / year",
                  features: [
                    "Create and publish content",
                    "Analytics and media library",
                    "3 social accounts",
                  ],
                },
                {
                  plan: "full",
                  name: "Current",
                  detail: "4 accounts · AI Assist + scheduling",
                  monthly: "$69.99 / month",
                  annual: "$797.89 / year · save 5%",
                  features: [
                    "Everything in Ripple",
                    "4 connected social accounts",
                    "Generative AI Assist",
                    "Post scheduling",
                  ],
                },
                {
                  plan: "expanded",
                  name: "Tidal",
                  detail: "8 accounts · AI Assist + scheduling",
                  monthly: "$119.99 / month",
                  annual: "$1,295.89 / year · save 10%",
                  features: [
                    "Everything in Current",
                    "8 social accounts",
                    "Built for growing teams",
                  ],
                },
              ] as const
            ).map((tier) => (
              <div
                key={tier.plan}
                className={`rounded-xl border p-4 ${tier.plan === "full" ? "border-primary/40 bg-primary/5" : "border-border bg-elevated"}`}
              >
                <strong className="text-sm text-foreground">{tier.name}</strong>
                <span className="mt-1 block min-h-8 text-xs text-muted-foreground">
                  {tier.detail}
                </span>
                <ul className="mt-3 grid gap-1.5 text-[11px] text-muted-foreground">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <span className="text-primary">✓</span> {feature}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={subscribe.isPending}
                  onClick={() =>
                    subscribe.mutate({
                      plan: tier.plan,
                      interval: annualBilling ? "annual" : "monthly",
                    })
                  }
                  className="mt-4 w-full rounded-lg bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-md active:translate-y-0 active:scale-[0.98] disabled:opacity-50"
                >
                  {annualBilling ? tier.annual : tier.monthly}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Annual billing keeps Ripple at $479.88, saves 5% on Current, and saves 10% on Tidal.
        Payments, subscription invoices, and billing details are securely managed by Stripe.
      </p>
      <details className="mt-5 rounded-xl border border-border bg-elevated/50">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground">
          <span>Billing history</span>
          <span className="text-xs font-normal text-muted-foreground">
            {query.data?.invoices.length ?? 0} invoice
            {(query.data?.invoices.length ?? 0) === 1 ? "" : "s"} ▾
          </span>
        </summary>
        <div className="border-t border-border px-4 py-2">
          {query.data?.invoices.length ? (
            <div className="divide-y divide-border">
              {query.data.invoices.map((invoice) => {
                const amount = new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: invoice.currency,
                }).format((invoice.amount_paid_cents || invoice.amount_due_cents) / 100);
                const invoiceUrl = invoice.hosted_invoice_url ?? invoice.invoice_pdf_url;
                return (
                  <div
                    key={invoice.stripe_invoice_id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-foreground">
                        {invoice.invoice_number ?? "Subscription invoice"} · {amount}
                      </p>
                      <p className="mt-0.5 text-muted-foreground">
                        {new Date(invoice.created_at).toLocaleDateString()} · {invoice.status}
                      </p>
                    </div>
                    {invoiceUrl && (
                      <a
                        href={invoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-border bg-background px-3 py-2 font-semibold text-foreground hover:border-primary/40"
                      >
                        View invoice
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-4 text-xs text-muted-foreground">
              Stripe invoices will appear here after the first subscription charge.
            </p>
          )}
        </div>
      </details>
    </section>
  );
}

function FrameioServiceConnectionCard() {
  const qc = useQueryClient();
  const [callbackMessage, setCallbackMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const status = useQuery({
    queryKey: ["frameio-service-status"],
    queryFn: getFrameioServiceStatus,
  });
  useEffect(() => {
    const url = new URL(window.location.href);
    const error = url.searchParams.get("frameio_error");
    const connected = url.searchParams.get("frameio_connected") === "true";
    if (!error && !connected) return;

    if (connected) {
      setCallbackMessage({
        tone: "success",
        text: "Frame.io connected successfully. You can now sync the client Share again.",
      });
      void qc.invalidateQueries({ queryKey: ["frameio-service-status"] });
    } else {
      const messages: Record<string, string> = {
        invalid_state:
          "The Frame.io sign-in expired or was cancelled. Select Connect Frame.io and finish the Adobe sign-in without closing the window.",
        token_exchange:
          "Adobe returned to WaveOS, but the authorization could not be completed. Check the Frame.io OAuth client secret and redirect URL in Adobe Developer Console.",
        profile:
          "Adobe signed in, but WaveOS could not access the Frame.io V4 profile. Sign in with the same Adobe ID used by your Frame.io V4 account and confirm the Frame.io API is added to the Adobe project.",
        connection_save:
          "Adobe authorized Frame.io, but WaveOS could not securely save the connection. The server connection settings need attention.",
      };
      setCallbackMessage({
        tone: "error",
        text: messages[error ?? ""] ?? "Frame.io could not be connected. Please try again.",
      });
    }

    url.searchParams.delete("frameio_error");
    url.searchParams.delete("frameio_connected");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [qc]);
  const connect = useMutation({
    mutationFn: startFrameioServiceConnection,
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Frame.io connection failed."),
  });
  const disconnect = useMutation({
    mutationFn: disconnectFrameioService,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["frameio-service-status"] });
      toast.success("Dream Wave Frame.io disconnected.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not disconnect Frame.io."),
  });
  const connected = status.data?.connected === true;
  return (
    <section className="surface-card flex flex-col gap-4 p-6">
      {callbackMessage && (
        <div
          role={callbackMessage.tone === "error" ? "alert" : "status"}
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
            callbackMessage.tone === "error"
              ? "border-red-500/30 bg-red-500/10 text-red-200"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {callbackMessage.tone === "error" ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{callbackMessage.text}</span>
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Cloud className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Dream Wave Frame.io</h2>
              {connected && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              One protected company connection powers the curated Shares assigned to client
              workspaces.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {status.isLoading
                ? "Checking connection…"
                : connected
                  ? status.data?.email || "Connected"
                  : status.data?.configured === false
                    ? "Developer credentials needed"
                    : "Not connected"}
            </p>
          </div>
        </div>
        {connected ? (
          <button
            type="button"
            onClick={() => disconnect.mutate()}
            disabled={disconnect.isPending}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {disconnect.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Unplug className="h-4 w-4" />
            )}{" "}
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={() => connect.mutate()}
            disabled={status.isLoading || status.data?.configured === false || connect.isPending}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {connect.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}{" "}
            Connect Frame.io
          </button>
        )}
      </div>
    </section>
  );
}

function WorkspaceBrandingEditor({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const qc = useQueryClient();
  const branding = useWorkspaceBranding(workspaceId);
  const [accentColor, setAccentColor] = useState(DEFAULT_WORKSPACE_ACCENT);
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);

  useEffect(() => {
    setAccentColor(branding.data?.accentColor ?? DEFAULT_WORKSPACE_ACCENT);
    setPendingLogo(null);
  }, [branding.data?.accentColor, workspaceId]);

  const save = useMutation({
    mutationFn: async () => {
      if (!/^#[0-9a-f]{6}$/i.test(accentColor)) throw new Error("Choose a valid brand color.");
      let logoPath = branding.data?.logoPath ?? null;
      if (pendingLogo) {
        if (!/^image\/(png|jpeg|webp)$/.test(pendingLogo.type))
          throw new Error("Use a PNG, JPG, or WebP logo.");
        if (pendingLogo.size > 5 * 1024 * 1024) throw new Error("Logo must be smaller than 5 MB.");
        const extension = pendingLogo.name.split(".").pop()?.toLowerCase() || "png";
        logoPath = `${workspaceId}/logo-${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("workspace-branding")
          .upload(logoPath, pendingLogo, { contentType: pendingLogo.type, upsert: false });
        if (uploadError) throw uploadError;
      }
      const { error } = await db.from("workspace_branding").upsert({
        workspace_id: workspaceId,
        logo_path: logoPath,
        accent_color: accentColor.toUpperCase(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["workspace-branding", workspaceId] });
      setPendingLogo(null);
      toast.success("Workspace branding updated.");
    },
    onError: (error) => toast.error(workspaceBrandingError(error)),
  });

  const previewUrl = pendingLogo ? URL.createObjectURL(pendingLogo) : branding.data?.logoUrl;

  return (
    <section className="surface-card overflow-hidden" style={workspaceThemeStyle(accentColor)}>
      <div className="border-b border-border bg-gradient-to-r from-primary/15 via-transparent to-transparent p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Palette className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Workspace identity</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Give {workspaceName} a private, recognizable welcome while keeping the WaveOS luxury
              foundation.
            </p>
          </div>
        </div>
      </div>
      <div className="grid gap-6 p-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-3xl border border-primary/25 bg-elevated shadow-[var(--shadow-glow)]">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={`${workspaceName} logo preview`}
              className="h-full w-full object-contain p-3"
            />
          ) : (
            <Image className="h-8 w-8 text-primary" />
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Client logo
            </span>
            <span className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-elevated px-4 py-3 text-sm font-medium text-foreground hover:border-primary/40">
              <Upload className="h-4 w-4 text-primary" />
              {pendingLogo
                ? pendingLogo.name
                : branding.data?.logoPath
                  ? "Replace logo"
                  : "Upload logo"}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(event) => setPendingLogo(event.target.files?.[0] ?? null)}
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Brand accent
            </span>
            <span className="flex items-center gap-3 rounded-xl border border-border bg-elevated px-3 py-2">
              <input
                type="color"
                value={accentColor}
                onChange={(event) => setAccentColor(event.target.value)}
                className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                aria-label="Brand accent color"
              />
              <input
                value={accentColor}
                onChange={(event) => setAccentColor(event.target.value)}
                maxLength={7}
                className="min-w-0 flex-1 bg-transparent font-mono text-sm uppercase text-foreground outline-none"
                aria-label="Brand accent hex value"
              />
            </span>
            <span className="flex flex-wrap gap-2" aria-label="Suggested brand colors">
              {["#4DB8FF", "#8B5CF6", "#E8B86D", "#F43F5E", "#22C55E", "#F8FAFC"].map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setAccentColor(color)}
                  className="h-7 w-7 rounded-full border border-white/20 ring-offset-2 ring-offset-background transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary"
                  style={{ backgroundColor: color }}
                  aria-label={`Use ${color}`}
                />
              ))}
            </span>
          </label>
          <div className="flex justify-end sm:col-span-2">
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending || branding.isLoading}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] disabled:opacity-50"
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save workspace style
            </button>
          </div>
          <p className="text-right text-xs text-muted-foreground sm:col-span-2">
            The preview changes immediately. Select Save to apply it throughout this workspace.
          </p>
        </div>
      </div>
    </section>
  );
}

function StorageConnectionCard({
  provider,
  workspaceId,
  label,
  canManage,
}: {
  provider: ExternalMediaProvider;
  workspaceId: string;
  label: string;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["external-media-status", workspaceId, provider],
    queryFn: () => getExternalMediaStatus(provider, workspaceId),
  });
  const connect = useMutation({
    mutationFn: async ({ popup }: { popup: Window | null }) => {
      if (reconnectRequired) await disconnectExternalMedia(provider, workspaceId);
      const result = await startExternalMediaConnection(provider, workspaceId);
      if (popup) popup.location.href = result.url;
      else window.location.assign(result.url);
    },
    onError: (error, { popup }) => {
      popup?.close();
      toast.error(error instanceof Error ? error.message : "Connection failed.");
    },
  });
  const disconnect = useMutation({
    mutationFn: () => disconnectExternalMedia(provider, workspaceId),
    onSuccess: async ({ revoked }) => {
      await qc.invalidateQueries({ queryKey: ["external-media-status", workspaceId, provider] });
      toast.success(
        provider === "google_drive" && revoked
          ? "Google Drive disconnected and its WaveOS authorization was reset."
          : `${label} disconnected.`,
      );
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Disconnect failed."),
  });
  const connected = status.data?.connected === true;
  const reconnectRequired = status.data?.reconnectRequired === true;
  const configured = status.data?.configured !== false;

  return (
    <div className="surface-card flex items-center justify-between gap-4 p-5">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <Cloud className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground">{label}</h3>
            {connected && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {status.isLoading
              ? "Checking connection…"
              : reconnectRequired
                ? "Reconnect required — Drive permission is missing"
                : connected
                  ? status.data?.account?.email || "Connected"
                  : configured
                    ? "Not connected"
                    : "Developer credentials needed"}
          </p>
        </div>
      </div>
      {!canManage ? (
        <span className="shrink-0 rounded-full border border-border px-3 py-2 text-xs font-medium text-muted-foreground">
          Shared access
        </span>
      ) : connected ? (
        <button
          type="button"
          onClick={() => disconnect.mutate()}
          disabled={disconnect.isPending}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {disconnect.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Unplug className="h-4 w-4" />
          )}
          Disconnect
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            const useSameWindow = window.matchMedia(
              "(max-width: 767px), (pointer: coarse)",
            ).matches;
            const popup = useSameWindow
              ? null
              : window.open(
                  "about:blank",
                  `waveos-${provider}-connect`,
                  "popup,width=560,height=720",
                );
            connect.mutate({ popup });
          }}
          disabled={!configured || status.isLoading || connect.isPending}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {connect.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ExternalLink className="h-4 w-4" />
          )}
          {reconnectRequired ? "Reconnect" : "Connect"}
        </button>
      )}
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
