import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import {
  Copy,
  Download,
  Link2,
  Loader2,
  MousePointerClick,
  Pause,
  Play,
  QrCode,
  ScanLine,
  Star,
  Trash2,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { isValidHttpsUrl, normalizeHttpsUrl, URL_VALIDATION_MESSAGE } from "@/lib/url-validation";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tools")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const isOwner = (roles ?? []).some((row) => row.role === "dream_wave_owner");
    if (!isOwner) throw redirect({ to: "/home" });
  },
  head: () => ({
    meta: [
      { title: "Tools · QR Promo Links | WaveOS" },
      {
        name: "description",
        content:
          "Create and manage QR promo campaigns that invite customers to leave a Google review and continue to their gallery.",
      },
      { property: "og:title", content: "Tools · QR Promo Links | WaveOS" },
      {
        property: "og:description",
        content: "Manage Dream Wave Media QR promo campaigns and track scans and clicks.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ToolsPage,
});

interface PromoCampaign {
  id: string;
  name: string;
  google_review_url: string;
  destination_url: string;
  destination_label: string;
  is_active: boolean;
  public_token: string;
  scan_count: number;
  review_click_count: number;
  destination_click_count: number;
  created_at: string;
}

function promoUrl(token: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/promo/${token}`;
}

function ToolsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Tools</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Internal Dream Wave Media utilities. Owner access only.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-primary/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary ring-1 ring-inset ring-primary/30">
          <QrCode className="h-4 w-4" /> QR Promo Links
        </span>
      </div>

      <QrPromoLinksTab />
    </div>
  );
}

function QrPromoLinksTab() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [reviewUrl, setReviewUrl] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [destinationLabel, setDestinationLabel] = useState("View your content");

  const campaignsQuery = useQuery({
    queryKey: ["promo-campaigns"],
    queryFn: async (): Promise<PromoCampaign[]> => {
      const { data, error } = await supabase
        .from("promo_campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PromoCampaign[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["promo-campaigns"] });

  const createCampaign = useMutation({
    mutationFn: async () => {
      const cleanName = name.trim();
      const review = normalizeHttpsUrl(reviewUrl);
      const destination = normalizeHttpsUrl(destinationUrl);
      const label = destinationLabel.trim() || "View your content";
      if (!cleanName) throw new Error("Add a campaign name.");
      if (!isValidHttpsUrl(review)) throw new Error(`Google review link: ${URL_VALIDATION_MESSAGE}`);
      if (!isValidHttpsUrl(destination)) throw new Error(`Destination link: ${URL_VALIDATION_MESSAGE}`);

      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("promo_campaigns").insert({
        name: cleanName,
        google_review_url: review,
        destination_url: destination,
        destination_label: label,
        created_by: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setName("");
      setReviewUrl("");
      setDestinationUrl("");
      setDestinationLabel("View your content");
      toast.success("Promo campaign created");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (campaign: PromoCampaign) => {
      const { error } = await supabase
        .from("promo_campaigns")
        .update({ is_active: !campaign.is_active })
        .eq("id", campaign.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Campaign status updated");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteCampaign = useMutation({
    mutationFn: async (campaign: PromoCampaign) => {
      const { error } = await supabase.from("promo_campaigns").delete().eq("id", campaign.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Campaign deleted");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const campaigns = campaignsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <section className="surface-card p-4 sm:p-6">
        <h2 className="text-base font-semibold text-foreground">New promo campaign</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Customers scan the QR code, are invited to leave an honest Google review, and can continue
          to their gallery either way.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Campaign name">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Smith Wedding — August"
              className={inputClass}
            />
          </Field>
          <Field label="Destination button label">
            <input
              value={destinationLabel}
              onChange={(event) => setDestinationLabel(event.target.value)}
              placeholder="View your gallery"
              className={inputClass}
            />
          </Field>
          <Field label="Google review URL">
            <input
              value={reviewUrl}
              onChange={(event) => setReviewUrl(event.target.value)}
              placeholder="https://g.page/r/..."
              className={inputClass}
            />
          </Field>
          <Field label="Gallery / content destination URL">
            <input
              value={destinationUrl}
              onChange={(event) => setDestinationUrl(event.target.value)}
              placeholder="https://yourstudio.bloom.io/..."
              className={inputClass}
            />
          </Field>
        </div>
        <button
          type="button"
          onClick={() => createCampaign.mutate()}
          disabled={createCampaign.isPending}
          className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {createCampaign.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <QrCode className="h-4 w-4" />
          )}
          Create campaign
        </button>
      </section>

      {campaignsQuery.isLoading ? (
        <div className="surface-card flex items-center justify-center p-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={QrCode}
          title="No promo campaigns yet"
          body="Create your first campaign to generate a shareable promo link and QR code."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onToggle={() => toggleActive.mutate(campaign)}
              onDelete={() => deleteCampaign.mutate(campaign)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const inputClass =
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function CampaignCard({
  campaign,
  onToggle,
  onDelete,
}: {
  campaign: PromoCampaign;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const url = promoUrl(campaign.public_token);

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    toast.success("Promo link copied");
  }

  async function downloadQr() {
    setDownloading(true);
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        width: 1024,
        margin: 2,
        color: { dark: "#0b1220", light: "#ffffff" },
      });
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = `${campaign.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-qr.png`;
      anchor.click();
      toast.success("QR code downloaded");
    } catch {
      toast.error("Could not generate the QR code");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <article className="surface-card flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-foreground">{campaign.name}</h3>
          <p className="mt-1 truncate text-xs text-muted-foreground">{url}</p>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
            campaign.is_active
              ? "bg-primary/12 text-primary ring-1 ring-inset ring-primary/30"
              : "bg-muted text-muted-foreground",
          )}
        >
          {campaign.is_active ? "Active" : "Paused"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Metric icon={ScanLine} label="Scans" value={campaign.scan_count} />
        <Metric icon={Star} label="Review clicks" value={campaign.review_click_count} />
        <Metric
          icon={MousePointerClick}
          label="Destination"
          value={campaign.destination_click_count}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <ActionButton icon={Copy} label="Copy link" onClick={copyLink} />
        <ActionButton
          icon={Download}
          label={downloading ? "Preparing…" : "Download QR"}
          onClick={downloadQr}
        />
        <ActionButton
          icon={campaign.is_active ? Pause : Play}
          label={campaign.is_active ? "Pause" : "Activate"}
          onClick={onToggle}
        />
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <Link2 className="h-4 w-4" /> Preview
        </a>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete “${campaign.name}”? This cannot be undone.`)) onDelete();
          }}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive"
        >
          <Trash2 className="h-4 w-4" /> Delete
        </button>
      </div>
    </article>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Copy;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ScanLine;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface/60 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}
