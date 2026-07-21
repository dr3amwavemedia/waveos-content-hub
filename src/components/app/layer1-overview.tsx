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
import { STATUS_LABELS } from "@/lib/permissions";
import type { Database } from "@/integrations/supabase/types";

type Invoice = Database["public"]["Tables"]["client_invoices"]["Row"];
type Delivery = Database["public"]["Tables"]["client_deliveries"]["Row"];
type DeliveryKind = Database["public"]["Enums"]["delivery_kind"];

// Dream Wave Media contact fallback. Displayed to Layer 1 clients only.
const DREAM_WAVE_CONTACT = {
  name: "Dream Wave Media",
  role: "Your creative team",
  email: "dr3amwavemedia@outlook.com",
  phone: null as string | null,
};

const INVOICE_STATUS_LABEL: Record<Invoice["status"], string> = {
  draft: "Draft",
  sent: "Awaiting payment",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

const INVOICE_STATUS_TONE: Record<Invoice["status"], string> = {
  draft: "bg-muted/20 text-muted-foreground ring-border",
  sent: "bg-primary/15 text-primary ring-primary/30",
  paid: "bg-success/15 text-success ring-success/30",
  overdue: "bg-destructive/15 text-destructive ring-destructive/30",
  void: "bg-muted/20 text-muted-foreground ring-border",
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
      const { data } = await supabase.from("workspaces").select("account_status").eq("id", wsId!).maybeSingle();
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
        .limit(10);
      if (error) throw error;
      return (data ?? []) as Invoice[];
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
        .order("is_pinned", { ascending: false })
        .order("delivered_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as Delivery[];
    },
  });

  const primaryInvoice = useMemo<Invoice | null>(() => {
    const items = invoicesQ.data ?? [];
    const now = Date.now();
    const overdue = items.find(
      (i) => i.status === "overdue" || (i.status === "sent" && i.due_at && new Date(i.due_at).getTime() < now),
    );
    if (overdue) return overdue;
    const sent = items.find((i) => i.status === "sent");
    if (sent) return sent;
    return items.find((i) => i.status === "paid") ?? items[0] ?? null;
  }, [invoicesQ.data]);

  const primaryDelivery = useMemo<Delivery | null>(() => {
    const items = deliveriesQ.data ?? [];
    return items[0] ?? null;
  }, [deliveriesQ.data]);

  const projectName = brandQ.data?.business_name?.trim() || activeWorkspace?.name || "Your project";

  const statusLabel = wsMetaQ.data?.account_status ? STATUS_LABELS[wsMetaQ.data.account_status] : null;

  const primaryAction = derivePrimaryAction(primaryInvoice, primaryDelivery);

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <header className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{projectName}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {firstName ? `Welcome back, ${firstName}.` : "Welcome back."}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          Everything related to your Dream Wave Media project is organized below.
        </p>
        {statusLabel && (
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-elevated/60 px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px] shadow-primary" />
            Project status: <span className="font-medium text-foreground">{statusLabel}</span>
          </div>
        )}
      </header>

      {/* Primary action */}
      <PrimaryActionBanner action={primaryAction} />

      {/* Invoices */}
      <section id="invoices" className="scroll-mt-24 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Invoices & Payments</h2>
        {primaryInvoice ? (
          <InvoiceCard invoice={primaryInvoice} />
        ) : (
          <PolishedEmpty icon={FileText} body="You currently have no invoices requiring action." />
        )}
      </section>

      {/* Content */}
      <section id="your-content" className="scroll-mt-24 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Your Content</h2>
        {primaryDelivery ? (
          <DeliveryCard delivery={primaryDelivery} />
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
    const isOverdue =
      inv.status === "overdue" || (inv.status === "sent" && inv.due_at && new Date(inv.due_at).getTime() < now);
    if (isOverdue && isValidHttpsUrl(inv.hosted_url)) return { kind: "overdue", invoice: inv };
    if (inv.status === "sent" && isValidHttpsUrl(inv.hosted_url)) return { kind: "pay", invoice: inv };
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
        label: isDownloadProvider(action.delivery.url) ? "Download Final Files" : "View Your Content",
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

function InvoiceCard({ invoice }: { invoice: Invoice }) {
  const amount = formatMoney(invoice.amount_cents, invoice.currency);
  const due = formatDate(invoice.due_at);
  const issued = formatDate(invoice.issued_at);
  const paid = formatDate(invoice.paid_at);
  const isPaid = invoice.status === "paid";
  const ctaLabel = isPaid
    ? "View Receipt"
    : invoice.status === "sent" || invoice.status === "overdue"
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
          {invoice.description && <p className="mt-1 text-sm text-muted-foreground">{invoice.description}</p>}
        </div>
        {amount && (
          <div className="shrink-0 text-right">
            <div className="text-2xl font-semibold tracking-tight text-foreground">{amount}</div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{invoice.currency}</div>
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

function DeliveryCard({ delivery }: { delivery: Delivery }) {
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
            {delivery.description && <p className="mt-2 text-sm text-muted-foreground">{delivery.description}</p>}
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

function MetaField({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof Clock }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
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
