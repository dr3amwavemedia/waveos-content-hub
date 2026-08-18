import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Film,
  Image as ImageIcon,
  Mail,
  MessageSquare,
  Phone,
  Play,
  Sparkles,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-waveos";
import { useWorkspace } from "@/components/app/workspace-context";
import { isValidHttpsUrl } from "@/lib/url-validation";
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/lib/permissions";
import type { Database } from "@/integrations/supabase/types";
import { WorkspaceBrandmark } from "@/components/branding/workspace-brandmark";
import { useWorkspaceBranding } from "@/hooks/use-workspace-branding";
import { getFrameioWorkspaceStatus, listFrameioWorkspaceMedia } from "@/hooks/use-frameio";

export type Invoice = Database["public"]["Tables"]["client_invoices"]["Row"];
type Delivery = Database["public"]["Tables"]["client_deliveries"]["Row"];
type DeliveryKind = Database["public"]["Enums"]["delivery_kind"];
export type Contract = {
  id: string;
  title: string;
  description: string | null;
  provider: "bloom" | "other";
  hosted_url: string;
  status: "draft" | "sent" | "viewed" | "signed" | "declined" | "expired" | "void";
  sent_at: string | null;
  signed_at: string | null;
  expires_at: string | null;
};
const externalDb = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

// Dream Wave Media contact fallback. Displayed to Layer 1 clients only.
const DREAM_WAVE_CONTACT = {
  name: "Dream Wave Media",
  role: "Your creative team",
  email: "dr3amwavemedia@outlook.com",
  phone: "941-914-4711" as string | null,
};

const INVOICE_STATUS_LABEL: Record<Invoice["status"], string> = {
  draft: "Draft",
  sent: "Awaiting payment",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
  deposit: "Deposit received",
  unpaid: "Unpaid",
};

const INVOICE_STATUS_TONE: Record<Invoice["status"], string> = {
  draft: "bg-muted/20 text-muted-foreground ring-border",
  sent: "bg-primary/15 text-primary ring-primary/30",
  paid: "bg-success/15 text-success ring-success/30",
  overdue: "bg-destructive/15 text-destructive ring-destructive/30",
  void: "bg-muted/20 text-muted-foreground ring-border",
  deposit: "bg-primary/15 text-primary ring-primary/30",
  unpaid: "bg-warning/15 text-warning ring-warning/30",
};

const DELIVERY_KIND_LABEL: Record<DeliveryKind, string> = {
  photos: "Photos",
  videos: "Videos",
  reels: "Reels",
  graphics: "Graphics",
  documents: "Documents",
  link: "Link",
  other: "Delivery",
};

function deliveryProvider(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("frame.io")) return "Frame.io";
    if (host.includes("pixieset")) return "Pixieset";
    if (host.includes("bloom.io")) return "Bloom.io";
    if (host.includes("drive.google")) return "Google Drive";
    if (host.includes("dropbox")) return "Dropbox";
    if (host.includes("vimeo")) return "Vimeo";
    if (host.includes("youtube") || host.includes("youtu.be")) return "YouTube";
    return host;
  } catch {
    return "External link";
  }
}

function isDownloadProvider(url: string): boolean {
  return /pixieset|drive\.google|dropbox/i.test(url);
}

function formatMoney(cents: number | null, currency: string): string | null {
  if (cents == null) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function Layer1Overview() {
  const { data: user } = useCurrentUser();
  const { activeWorkspace } = useWorkspace();
  const wsId = activeWorkspace?.id;
  const branding = useWorkspaceBranding(wsId);

  const firstName = user?.firstName?.split(" ")[0] ?? null;

  const brandQ = useQuery({
    queryKey: ["layer1", "brand", wsId],
    enabled: !!wsId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("brand_profiles")
        .select("business_name")
        .eq("workspace_id", wsId!)
        .maybeSingle();
      return data;
    },
  });

  const wsMetaQ = useQuery({
    queryKey: ["layer1", "workspace-meta", wsId],
    enabled: !!wsId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("workspaces")
        .select("account_status")
        .eq("id", wsId!)
        .maybeSingle();
      return data;
    },
  });

  const invoicesQ = useQuery({
    queryKey: ["layer1", "invoices", wsId],
    enabled: !!wsId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_invoices")
        .select("*")
        .eq("workspace_id", wsId!)
        .order("issued_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
  });

  const contractsQ = useQuery({
    queryKey: ["layer1", "contracts", wsId],
    enabled: !!wsId,
    staleTime: 30_000,
    queryFn: async (): Promise<Contract[]> => {
      const { data, error } = await externalDb
        .from("client_contracts")
        .select("id,title,description,provider,hosted_url,status,sent_at,signed_at,expires_at")
        .eq("workspace_id", wsId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const deliveriesQ = useQuery({
    queryKey: ["layer1", "deliveries", wsId],
    enabled: !!wsId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_deliveries")
        .select("*")
        .eq("workspace_id", wsId!)
        .order("delivered_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Delivery[];
    },
  });

  const approvalsQ = useQuery({
    queryKey: ["layer1", "approvals", wsId],
    enabled: !!wsId,
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("content_items")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId!)
        .in("status", ["in_review", "changes_requested"]);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const frameioQ = useQuery({
    queryKey: ["layer1", "frameio", wsId],
    enabled: !!wsId,
    staleTime: 60_000,
    queryFn: async () => {
      const status = await getFrameioWorkspaceStatus(wsId!);
      if (!status.connected) return null;
      return listFrameioWorkspaceMedia(wsId!, "");
    },
  });

  const primaryInvoice = useMemo<Invoice | null>(() => {
    const items = invoicesQ.data ?? [];
    const now = Date.now();
    const overdue = items.find((i) => {
      const awaitingPayment = i.status === "sent" || i.status === "unpaid";
      return (
        i.status === "overdue" ||
        (awaitingPayment && i.due_at && new Date(i.due_at).getTime() < now)
      );
    });
    if (overdue) return overdue;
    const awaitingPayment = items.find((i) => i.status === "sent" || i.status === "unpaid");
    if (awaitingPayment) return awaitingPayment;
    return items[0] ?? null;
  }, [invoicesQ.data]);

  const primaryDelivery = useMemo<Delivery | null>(() => {
    const items = deliveriesQ.data ?? [];
    return items[0] ?? null;
  }, [deliveriesQ.data]);

  const projectName = brandQ.data?.business_name?.trim() || activeWorkspace?.name || "Your project";

  const statusLabel = wsMetaQ.data?.account_status
    ? STATUS_LABELS[wsMetaQ.data.account_status]
    : null;

  const primaryAction = derivePrimaryAction(primaryInvoice, primaryDelivery);

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <header className="flex items-start gap-4 sm:items-center sm:gap-5">
        <WorkspaceBrandmark
          logoUrl={branding.data?.logoUrl}
          name={projectName}
          className="h-16 w-16 sm:h-20 sm:w-20"
        />
        <div className="min-w-0 space-y-2">
          <p className="truncate text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {projectName}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {firstName ? `Welcome back, ${firstName}.` : "Welcome back."}
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Everything related to your Dream Wave Media project is organized below.
          </p>
        </div>
      </header>
      <div>
        {statusLabel && (
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-elevated/60 px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px] shadow-primary" />
            Project status: <span className="font-medium text-foreground">{statusLabel}</span>
          </div>
        )}
      </div>

      {/* Primary action */}
      <PrimaryActionBanner action={primaryAction} />

      <AttentionCenter
        approvalCount={approvalsQ.data ?? 0}
        invoice={primaryInvoice}
        delivery={primaryDelivery}
      />

      {frameioQ.data && frameioQ.data.files.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Frame.io</p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">{frameioQ.data.label}</h2>
            </div>
            <Link to="/create" className="text-sm font-medium text-primary hover:underline">
              Create a post
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {frameioQ.data.files.slice(0, 6).map((file) => (
              <a
                key={file.id}
                href={file.viewUrl ?? "#"}
                target={file.viewUrl ? "_blank" : undefined}
                rel={file.viewUrl ? "noopener noreferrer" : undefined}
                className="group relative aspect-square overflow-hidden rounded-2xl border border-border bg-elevated"
                aria-label={`Open ${file.name} in Frame.io`}
              >
                {file.thumbnailUrl ? (
                  <img src={file.thumbnailUrl} alt={file.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                ) : (
                  <div className="flex h-full items-center justify-center p-3 text-center text-xs text-muted-foreground">{file.name}</div>
                )}
                <span className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-2 py-1.5 text-[10px] text-foreground backdrop-blur">{file.name}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Latest project */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
              Latest project
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">Newest delivery</h2>
          </div>
          {primaryDelivery && (
            <Link to="/deliveries" className="text-sm font-medium text-primary hover:underline">
              View all content
            </Link>
          )}
        </div>
        {primaryDelivery ? (
          <DeliveryCard delivery={primaryDelivery} />
        ) : (
          <PolishedEmpty
            icon={Sparkles}
            body="Dream Wave Media is preparing your content. Your newest project will appear here."
          />
        )}
      </section>

      {/* Contracts */}
      <section id="contracts" className="scroll-mt-24 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground">Contracts & Agreements</h2>
          {(contractsQ.data?.length ?? 0) > 1 && <span className="text-xs text-muted-foreground">{contractsQ.data!.length} contracts</span>}
        </div>
        {contractsQ.isLoading ? <div className="surface-card p-5 text-sm text-muted-foreground">Loading contracts…</div> : contractsQ.isError ?
          <div className="surface-card p-5 text-sm text-destructive">Contracts could not be loaded. Refresh the page to try again.</div> :
          (contractsQ.data ?? []).length > 0 ? <div className="space-y-3">{contractsQ.data?.map((contract) => <ContractCard key={contract.id} contract={contract} />)}</div> :
          <PolishedEmpty icon={FileText} body="You currently have no contracts requiring action." />}
      </section>

      {/* Invoices */}
      <section id="invoices" className="scroll-mt-24 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground">Invoices & Payments</h2>
          {(invoicesQ.data?.length ?? 0) > 1 && (
            <span className="text-xs text-muted-foreground">
              {invoicesQ.data!.length} invoices · newest first
            </span>
          )}
        </div>
        {invoicesQ.isLoading ? (
          <div className="surface-card p-5 text-sm text-muted-foreground">Loading invoices…</div>
        ) : invoicesQ.isError ? (
          <div className="surface-card p-5 text-sm text-destructive">
            Invoices could not be loaded. Refresh the page to try again.
          </div>
        ) : (invoicesQ.data ?? []).length > 0 ? (
          <div className="space-y-3">
            {invoicesQ.data!.map((invoice) => (
              <InvoiceCard key={invoice.id} invoice={invoice} />
            ))}
          </div>
        ) : (
          <PolishedEmpty icon={FileText} body="You currently have no invoices requiring action." />
        )}
      </section>

      {/* Content */}
      <section id="your-content" className="scroll-mt-24 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Your Content</h2>
          <Link
            to="/deliveries"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Open content library <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {primaryDelivery ? (
          <p className="text-sm text-muted-foreground">
            Every project and delivery link—including your newest—is saved in your content library.
          </p>
        ) : (
          <PolishedEmpty
            icon={Sparkles}
            body="Dream Wave Media is preparing your content. Your review and final delivery links will appear here."
          />
        )}
      </section>

      {/* Contact */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Contact Dream Wave</h2>
        <ContactCard />
      </section>
    </div>
  );
}

function AttentionCenter({
  approvalCount,
  invoice,
  delivery,
}: {
  approvalCount: number;
  invoice: Invoice | null;
  delivery: Delivery | null;
}) {
  const invoiceNeedsAction =
    invoice?.status === "sent" || invoice?.status === "unpaid" || invoice?.status === "overdue";

  const items = [
    approvalCount > 0
      ? {
          to: "/approvals" as const,
          label: `${approvalCount} ${approvalCount === 1 ? "approval" : "approvals"} waiting`,
          detail: "Review content and respond",
          icon: CheckCircle2,
        }
      : null,
    invoiceNeedsAction
      ? {
          to: "/home" as const,
          hash: "invoices",
          label: "Invoice needs attention",
          detail: invoice?.number ? `Invoice ${invoice.number}` : "View payment details",
          icon: FileText,
        }
      : null,
    delivery
      ? {
          to: "/deliveries" as const,
          label: "Latest delivery is available",
          detail: delivery.title,
          icon: Film,
        }
      : null,
  ].filter(Boolean) as Array<{
    to: "/approvals" | "/home" | "/deliveries";
    hash?: string;
    label: string;
    detail: string;
    icon: typeof Film;
  }>;

  return (
    <section className="space-y-3" aria-labelledby="attention-heading">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">At a glance</p>
          <h2 id="attention-heading" className="mt-1 text-lg font-semibold text-foreground">
            Needs your attention
          </h2>
        </div>
        <Link
          to="/feedback"
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-elevated px-4 text-sm font-semibold text-foreground"
        >
          Request something
        </Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {items.length ? (
          items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={`${item.to}-${item.label}`}
                to={item.to}
                hash={item.hash}
                className="flex min-h-20 items-center gap-3 rounded-2xl border border-border bg-elevated/50 p-4 transition-colors hover:border-primary/40 hover:bg-elevated"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.detail}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            );
          })
        ) : (
          <div className="flex min-h-20 items-center gap-3 rounded-2xl border border-success/25 bg-success/5 p-4 sm:col-span-3">
            <CheckCircle2 className="h-6 w-6 text-success" />
            <div>
              <p className="text-sm font-semibold text-foreground">You’re all caught up</p>
              <p className="text-xs text-muted-foreground">No approvals or payments need action.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

type PrimaryAction =
  | { kind: "overdue"; invoice: Invoice }
  | { kind: "pay"; invoice: Invoice }
  | { kind: "review"; delivery: Delivery }
  | { kind: "final"; delivery: Delivery }
  | { kind: "contact" }
  | { kind: "none" };

function derivePrimaryAction(inv: Invoice | null, del: Delivery | null): PrimaryAction {
  const now = Date.now();
  if (inv) {
    const awaitingPayment = inv.status === "sent" || inv.status === "unpaid";
    const isOverdue =
      inv.status === "overdue" ||
      (awaitingPayment && inv.due_at && new Date(inv.due_at).getTime() < now);
    if (isOverdue && isValidHttpsUrl(inv.hosted_url)) return { kind: "overdue", invoice: inv };
    if (awaitingPayment && isValidHttpsUrl(inv.hosted_url)) return { kind: "pay", invoice: inv };
  }
  if (del && isValidHttpsUrl(del.url)) {
    // "Review" for early-stage kinds; "final" once it looks like a final delivery.
    if (del.is_pinned) return { kind: "final", delivery: del };
    return { kind: "review", delivery: del };
  }
  return { kind: "contact" };
}

function PrimaryActionBanner({ action }: { action: PrimaryAction }) {
  if (action.kind === "none") return null;

  let title: string;
  let body: string;
  let cta: { label: string; href?: string; to?: string };
  let tone: "default" | "warning" = "default";
  let Icon = ArrowRight;

  switch (action.kind) {
    case "overdue":
      tone = "warning";
      Icon = AlertCircle;
      title = "You have an overdue invoice";
      body = action.invoice.number
        ? `Invoice ${action.invoice.number} is past due. Please complete payment to keep your project on track.`
        : "One of your invoices is past due. Please complete payment to keep your project on track.";
      cta = { label: "Make Payment", href: action.invoice.hosted_url! };
      break;
    case "pay":
      Icon = FileText;
      title = "You have an invoice ready for payment";
      body = action.invoice.number
        ? `Invoice ${action.invoice.number} is ready to be paid securely through our billing partner.`
        : "An invoice is ready to be paid securely through our billing partner.";
      cta = { label: "Make Payment", href: action.invoice.hosted_url! };
      break;
    case "review":
      Icon = Play;
      title = "Content is ready for your review";
      body = action.delivery.title
        ? `Review "${action.delivery.title}" and share your thoughts with Dream Wave Media.`
        : "New content from Dream Wave Media is ready for your review.";
      cta = { label: "Review Your Content", href: action.delivery.url };
      break;
    case "final":
      Icon = Download;
      title = "Your final content is available";
      body = action.delivery.title
        ? `Your final deliverables for "${action.delivery.title}" are ready to view or download.`
        : "Your final deliverables from Dream Wave Media are ready.";
      cta = {
        label: isDownloadProvider(action.delivery.url)
          ? "Download Final Files"
          : "View Your Content",
        href: action.delivery.url,
      };
      break;
    case "contact":
    default:
      Icon = MessageSquare;
      title = "Nothing needs your attention right now";
      body = "Your Dream Wave Media team is at work. Reach out anytime if you have questions.";
      cta = { label: "Contact Dream Wave", to: "/feedback" };
      break;
  }

  const isWarning = tone === "warning";

  return (
    <div
      className={
        "relative overflow-hidden rounded-3xl border p-5 shadow-[var(--shadow-glow)] sm:p-7 " +
        (isWarning
          ? "border-destructive/40 bg-gradient-to-br from-destructive/15 via-card to-card"
          : "border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card")
      }
    >
      <div
        className={
          "pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full blur-3xl " +
          (isWarning ? "bg-destructive/15" : "bg-primary/15")
        }
      />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ring-1 " +
              (isWarning
                ? "bg-destructive/15 text-destructive ring-destructive/30"
                : "bg-primary/15 text-primary ring-primary/30")
            }
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground sm:text-xl">{title}</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">{body}</p>
          </div>
        </div>
        {cta.href ? (
          <a
            href={cta.href}
            target="_blank"
            rel="noopener noreferrer"
            className={
              "inline-flex w-fit shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all " +
              (isWarning
                ? "bg-destructive text-destructive-foreground hover:brightness-110"
                : "bg-primary text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110")
            }
          >
            {cta.label}
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : (
          <Link
            to={cta.to!}
            className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all hover:brightness-110"
          >
            {cta.label}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}

export function ContractCard({ contract }: { contract: Contract }) {
  const signed = contract.status === "signed";
  const expired = contract.status === "expired" || contract.status === "void";
  const canOpen = isValidHttpsUrl(contract.hosted_url);
  return (
    <div className="surface-card space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground sm:text-lg">{contract.title}</h3>
          {contract.description && <p className="mt-1 text-sm text-muted-foreground">{contract.description}</p>}
        </div>
        <span className={cn("rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ring-inset", signed ? "bg-success/15 text-success ring-success/30" : expired ? "bg-muted/20 text-muted-foreground ring-border" : "bg-primary/15 text-primary ring-primary/30")}>
          {contract.status}
        </span>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {contract.sent_at && <span>Sent {formatDate(contract.sent_at)}</span>}
        {contract.signed_at && <span>Signed {formatDate(contract.signed_at)}</span>}
        {contract.expires_at && !signed && <span>Expires {formatDate(contract.expires_at)}</span>}
      </div>
      {canOpen && !expired && <a href={contract.hosted_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 sm:w-auto">
        {signed ? "View signed contract" : "View & sign contract"}<ExternalLink className="h-4 w-4" />
      </a>}
      <p className="text-xs text-muted-foreground">Signing and certification are completed securely by {contract.provider === "bloom" ? "Bloom.io" : "the contract provider"}.</p>
    </div>
  );
}

export function InvoiceCard({ invoice }: { invoice: Invoice }) {
  const amount = formatMoney(invoice.amount_cents, invoice.currency);
  const due = formatDate(invoice.due_at);
  const issued = formatDate(invoice.issued_at);
  const paid = formatDate(invoice.paid_at);
  const isPaid = invoice.status === "paid";
  const ctaLabel = isPaid
    ? "View Receipt"
    : invoice.status === "sent" || invoice.status === "unpaid" || invoice.status === "overdue"
      ? "Make Payment"
      : "View Invoice";
  const canOpen = isValidHttpsUrl(invoice.hosted_url);

  return (
    <div className="surface-card space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground sm:text-lg">
              {invoice.number ? `Invoice ${invoice.number}` : "Invoice"}
            </h3>
            <span
              className={
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset " +
                INVOICE_STATUS_TONE[invoice.status]
              }
            >
              {INVOICE_STATUS_LABEL[invoice.status]}
            </span>
          </div>
          {invoice.description && (
            <p className="mt-1 text-sm text-muted-foreground">{invoice.description}</p>
          )}
        </div>
        {amount && (
          <div className="shrink-0 text-right">
            <div className="text-2xl font-semibold tracking-tight text-foreground">{amount}</div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {invoice.currency}
            </div>
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        {issued && <MetaField label="Issued" value={issued} />}
        {due && <MetaField label="Due" value={due} icon={Clock} />}
        {paid && <MetaField label="Paid" value={paid} icon={CheckCircle2} />}
      </dl>

      {canOpen && (
        <a
          href={invoice.hosted_url!}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 sm:w-auto"
        >
          {ctaLabel}
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

export function DeliveryCard({ delivery }: { delivery: Delivery }) {
  const provider = deliveryProvider(delivery.url);
  const kindLabel = DELIVERY_KIND_LABEL[delivery.kind];
  const delivered = formatDate(delivery.delivered_at);
  const canDownload = isDownloadProvider(delivery.url);
  const canOpen = isValidHttpsUrl(delivery.url);
  const ctaLabel = delivery.is_pinned
    ? canDownload
      ? "Download Final Files"
      : "View Your Content"
    : "Review Your Content";

  const KindIcon =
    delivery.kind === "videos" || delivery.kind === "reels"
      ? Film
      : delivery.kind === "documents"
        ? FileText
        : ImageIcon;

  return (
    <div className="surface-card space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/20">
            <KindIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground sm:text-lg">{delivery.title}</h3>
            <p className="mt-0.5 text-xs uppercase tracking-wider text-muted-foreground">
              {kindLabel} · {provider}
            </p>
            {delivery.description && (
              <p className="mt-2 text-sm text-muted-foreground">{delivery.description}</p>
            )}
          </div>
        </div>
        {canDownload && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-medium text-success ring-1 ring-success/30">
            <Download className="h-3 w-3" />
            Download available
          </span>
        )}
      </div>

      {delivered && (
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <MetaField label="Delivered" value={delivered} />
        </dl>
      )}

      {canOpen && (
        <a
          href={delivery.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 sm:w-auto"
        >
          {ctaLabel}
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

function ContactCard() {
  const c = DREAM_WAVE_CONTACT;
  return (
    <div className="surface-card space-y-4 p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/20">
          <MessageSquare className="h-5 w-5" />
        </div>
        <div>
          <div className="text-base font-semibold text-foreground">{c.name}</div>
          <div className="text-xs text-muted-foreground">{c.role}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {c.email && (
          <a
            href={`mailto:${c.email}`}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-elevated px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
          >
            <Mail className="h-4 w-4 text-primary" />
            {c.email}
          </a>
        )}
        {c.phone && (
          <a
            href={`tel:${c.phone}`}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-elevated px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
          >
            <Phone className="h-4 w-4 text-primary" />
            {c.phone}
          </a>
        )}
        <Link
          to="/feedback"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110"
        >
          Send a message
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function MetaField({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof Clock;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 flex items-start gap-1.5 text-sm text-foreground">
        {Icon && <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <span className="break-words">{value}</span>
      </dd>
    </div>
  );
}

function PolishedEmpty({ icon: Icon, body }: { icon: typeof Sparkles; body: string }) {
  return (
    <div className="surface-card flex flex-col items-center justify-center gap-3 p-8 text-center sm:p-10">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
        <Icon className="h-5 w-5" />
      </div>
      <p className="max-w-md text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}
