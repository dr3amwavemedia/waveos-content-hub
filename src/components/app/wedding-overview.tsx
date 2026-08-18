import { Link } from "@tanstack/react-router";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock,
  Film,
  Heart,
  LockKeyhole,
  Mail,
  MapPin,
  MessageCircle,
  Play,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/components/app/workspace-context";
import { ContractCard, InvoiceCard, type Contract, type Invoice } from "@/components/app/layer1-overview";
import {
  STAGE_NEXT_STEP,
  WEDDING_CONTACT_EMAIL,
  WEDDING_STAGES,
  deliveryActionLabel,
  deliveryKindLabel,
  formatMeetingDateTime,
  formatWeddingDate,
  useWeddingDeliveries,
  useWeddingWorkspace,
  weddingDisplayName,
  weddingLocation,
  weddingPalette,
  type WeddingStage,
} from "@/components/app/wedding-theme";

const externalDb = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export function WeddingOverview() {
  const { activeWorkspace } = useWorkspace();
  const wsId = activeWorkspace?.id;

  const workspaceQ = useWeddingWorkspace(wsId);
  const ws = workspaceQ.data;
  const isActive = ws?.account_status === "active";

  const invoicesQ = useQuery({
    queryKey: ["wedding", "invoices", wsId],
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
    queryKey: ["wedding", "contracts", wsId],
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

  const deliveriesQ = useWeddingDeliveries(wsId, !!isActive);

  const palette = weddingPalette(ws?.wedding_theme);
  const displayName = weddingDisplayName(ws);
  const dateLabel = formatWeddingDate(ws?.wedding_date);
  const locationLabel = weddingLocation(ws);
  const stage = (ws?.wedding_stage ?? null) as WeddingStage | null;
  const stageIndex = stage ? WEDDING_STAGES.findIndex((s) => s.value === stage) : -1;
  const stageLabel = stageIndex >= 0 ? WEDDING_STAGES[stageIndex].label : "Invitation accepted";
  const nextStep = stage ? STAGE_NEXT_STEP[stage] : STAGE_NEXT_STEP.invitation_accepted;
  const meetingLabel = formatMeetingDateTime(ws?.wedding_meeting_at);
  const schedulingUrl =
    typeof ws?.wedding_scheduling_url === "string" && ws.wedding_scheduling_url.startsWith("https://")
      ? ws.wedding_scheduling_url
      : null;
  const latest = deliveriesQ.data?.[0] ?? null;

  if (workspaceQ.isLoading) {
    return (
      <div className="rounded-3xl bg-white p-8 text-sm text-stone-600">Opening your wedding space…</div>
    );
  }

  if (!isActive) {
    const contractSigned = contractsQ.data?.some((contract) => contract.status === "signed") ?? false;
    const paymentComplete =
      invoicesQ.data?.some((invoice) => invoice.status === "paid") || stageIndex >= 1;
    const checklist = [
      { label: "Your invitation is accepted", complete: true },
      { label: "Review and sign your contract", complete: contractSigned },
      { label: "Complete your deposit payment", complete: Boolean(paymentComplete) },
    ];

    return (
      <div className="mx-auto w-full max-w-3xl space-y-5 pb-8">
        <section
          className="overflow-hidden rounded-[2rem] border shadow-sm"
          style={{ borderColor: palette.border, background: palette.wash }}
        >
          <div
            className="px-6 pt-12 pb-10 text-center sm:px-10"
            style={{
              background: `radial-gradient(120% 80% at 50% 0%, ${palette.soft} 0%, transparent 70%)`,
            }}
          >
            <span
              className="inline-flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: palette.soft, color: palette.ink }}
            >
              <Heart className="h-6 w-6" />
            </span>
            <h1
              className="mt-6 break-words font-serif text-4xl leading-tight tracking-tight sm:text-5xl"
              style={{ color: palette.ink }}
            >
              {displayName}
            </h1>
            <WeddingFacts dateLabel={dateLabel} locationLabel={locationLabel} palette={palette} center />
            <p className="mx-auto mt-6 max-w-md text-base leading-7 text-stone-600">
              You’re part of the Dream Wave family. Your contract and payment details are ready below,
              and we’ll open the rest of your wedding space as soon as your deposit is confirmed.
            </p>
          </div>
        </section>

        <section className="rounded-[1.75rem] border bg-white p-5 sm:p-7" style={{ borderColor: palette.border }}>
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: palette.soft, color: palette.ink }}>
              <LockKeyhole className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-serif text-2xl" style={{ color: palette.ink }}>Opening your wedding space</h2>
              <p className="mt-1 text-sm leading-6 text-stone-600">Here’s what needs to happen next. We’ll take care of opening everything once these first steps are complete.</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {checklist.map((item) => (
              <div key={item.label} className="flex min-h-12 items-center gap-3 rounded-2xl px-4 py-3" style={{ background: item.complete ? palette.soft : palette.wash }}>
                {item.complete ? <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: palette.accent }} /> : <Circle className="h-5 w-5 shrink-0 text-stone-400" />}
                <span className={`text-sm ${item.complete ? "font-medium text-stone-800" : "text-stone-600"}`}>{item.label}</span>
              </div>
            ))}
            <div className="flex min-h-12 items-center gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: palette.border }}>
              <LockKeyhole className="h-5 w-5 shrink-0" style={{ color: palette.accent }} />
              <span className="text-sm text-stone-600">Dream Wave confirms your deposit and opens planning and content access</span>
            </div>
          </div>
        </section>

        <WeddingContractsSection contractsQ={contractsQ} palette={palette} />
        <WeddingInvoicesSection invoicesQ={invoicesQ} palette={palette} />

        <section
          id="wedding-contact"
          className="rounded-[1.75rem] border px-6 py-6 text-center text-sm text-stone-600 sm:px-10"
          style={{ borderColor: palette.border, background: palette.wash, paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          Questions before then? Email us at{" "}
          <a className="font-medium underline" style={{ color: palette.ink }} href={`mailto:${WEDDING_CONTACT_EMAIL}`}>
            {WEDDING_CONTACT_EMAIL}
          </a>
        </section>
      </div>
    );
  }

  return (
    <div
      className="w-full space-y-6 overflow-x-hidden pb-10"
      style={{ paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))" }}
    >
      {/* Warm header */}
      <header
        className="overflow-hidden rounded-[2rem] border px-5 py-8 sm:px-9 sm:py-10"
        style={{
          borderColor: palette.border,
          background: `linear-gradient(160deg, ${palette.soft} 0%, #ffffff 62%)`,
        }}
      >
        <p className="text-sm text-stone-600">Welcome, {displayName}</p>
        <h1
          className="mt-2 break-words font-serif text-3xl leading-tight tracking-tight sm:text-5xl"
          style={{ color: palette.ink }}
        >
          {displayName}
        </h1>
        <WeddingFacts dateLabel={dateLabel} locationLabel={locationLabel} palette={palette} />
        <p className="mt-5 max-w-xl text-base leading-7 text-stone-600">
          {ws?.wedding_welcome_message?.trim() ||
            "We’re so happy to be part of your wedding. Everything you need is right here, and we’ll keep this space updated as your day gets closer."}
        </p>
      </header>

      {/* Stage + next step */}
      <section
        className="rounded-[1.75rem] border bg-white p-5 sm:p-7"
        style={{ borderColor: palette.border }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-xl" style={{ color: palette.ink }}>
            Where things stand
          </h2>
          <span
            className="rounded-full px-3 py-1 text-xs font-medium"
            style={{ background: palette.soft, color: palette.ink }}
          >
            {stageLabel}
          </span>
        </div>
        <div className="mt-4 flex gap-1.5">
          {WEDDING_STAGES.map((s, i) => (
            <span
              key={s.value}
              className="h-1.5 flex-1 rounded-full transition-colors"
              style={{ background: i <= Math.max(stageIndex, 0) ? palette.accent : palette.soft }}
            />
          ))}
        </div>
        <p className="mt-4 text-sm leading-6 text-stone-600">
          <span className="font-medium text-stone-800">Next step: </span>
          {nextStep}
        </p>
      </section>

      {/* Creative Strategy Meeting */}
      <section
        className="rounded-[1.75rem] border p-5 sm:p-7"
        style={{ borderColor: palette.border, background: palette.wash }}
      >
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: palette.soft, color: palette.ink }}
          >
            <MessageCircle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-serif text-2xl" style={{ color: palette.ink }}>
              Let’s plan your story
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              We’ll talk through the people, moments, and feeling you want your wedding film to hold.
              Bring your timeline, your must have people, and anything you never want to forget.
            </p>
          </div>
        </div>
        {meetingLabel && (
          <p className="mt-4 flex items-center gap-2 text-sm font-medium text-stone-800">
            <Clock className="h-4 w-4" style={{ color: palette.accent }} /> {meetingLabel}
          </p>
        )}
        <a
          href={schedulingUrl ?? `mailto:${WEDDING_CONTACT_EMAIL}?subject=Creative%20Strategy%20Meeting`}
          {...(schedulingUrl ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-white sm:w-auto sm:min-w-64"
          style={{ background: palette.accent }}
        >
          {meetingLabel ? "View meeting details" : "Schedule your meeting"}
          <ArrowRight className="h-4 w-4" />
        </a>
      </section>

      {/* Latest delivery */}
      <section className="rounded-[1.75rem] border bg-white p-5 sm:p-7" style={{ borderColor: palette.border }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-xl" style={{ color: palette.ink }}>
            Your latest film
          </h2>
          <Link to="/wedding-content" className="text-sm font-medium underline" style={{ color: palette.ink }}>
            See all content
          </Link>
        </div>
        {latest ? (
          <div className="mt-4 overflow-hidden rounded-2xl border" style={{ borderColor: palette.border }}>
            <div
              className="flex h-40 items-center justify-center sm:h-52"
              style={{ background: `linear-gradient(140deg, ${palette.soft}, #ffffff)` }}
            >
              <Play className="h-10 w-10" style={{ color: palette.accent }} />
            </div>
            <div className="p-5">
              <p className="text-xs font-medium" style={{ color: palette.accent }}>
                {deliveryKindLabel(latest)}
              </p>
              <h3 className="mt-1 break-words text-lg font-semibold text-stone-900">{latest.title}</h3>
              {latest.delivered_at && (
                <p className="mt-1 text-sm text-stone-500">{formatWeddingDate(latest.delivered_at)}</p>
              )}
              <a
                href={latest.url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold text-white"
                style={{ background: palette.accent }}
              >
                {deliveryActionLabel(latest)} <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        ) : (
          <div
            className="mt-4 flex items-center gap-3 rounded-2xl p-4"
            style={{ background: palette.wash }}
          >
            <Film className="h-5 w-5 shrink-0" style={{ color: palette.accent }} />
            <p className="text-sm leading-6 text-stone-600">
              Your films will live here. After your wedding, we’ll add them as they’re ready.
            </p>
          </div>
        )}
      </section>

      {/* Contracts */}
      <WeddingContractsSection contractsQ={contractsQ} palette={palette} />

      {/* Invoices */}
      <WeddingInvoicesSection invoicesQ={invoicesQ} palette={palette} />

      {/* Contact */}
      <section
        id="wedding-contact"
        className="scroll-mt-24 rounded-[1.75rem] border p-5 text-center sm:p-7"
        style={{ borderColor: palette.border, background: palette.wash }}
      >
        <h2 className="font-serif text-xl" style={{ color: palette.ink }}>
          Talk to Dream Wave
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-600">
          Anything at all, big or small. We’re here for it.
        </p>
        <a
          href={`mailto:${WEDDING_CONTACT_EMAIL}`}
          className="mx-auto mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full border bg-white px-5 text-sm font-semibold sm:w-auto sm:min-w-64"
          style={{ borderColor: palette.border, color: palette.ink }}
        >
          <Mail className="h-4 w-4" /> Email us
        </a>
      </section>
    </div>
  );
}

function WeddingContractsSection({ contractsQ, palette }: { contractsQ: UseQueryResult<Contract[]>; palette: ReturnType<typeof weddingPalette> }) {
  return (
    <section id="wedding-contracts" className="scroll-mt-24 rounded-[1.75rem] border bg-white p-5 sm:p-7" style={{ borderColor: palette.border }}>
      <h2 className="font-serif text-xl" style={{ color: palette.ink }}>Contract</h2>
      <div className="mt-4 space-y-3">
        {contractsQ.isLoading ? <Muted text="Loading your contract…" wash={palette.wash} /> : contractsQ.isError ? <Muted text="We couldn’t load your contract right now. Please refresh." wash={palette.wash} /> : contractsQ.data?.length ? contractsQ.data.map((contract) => <ContractCard key={contract.id} contract={contract} />) : <Muted text="Nothing needs your signature right now." wash={palette.wash} />}
      </div>
    </section>
  );
}

function WeddingInvoicesSection({ invoicesQ, palette }: { invoicesQ: UseQueryResult<Invoice[]>; palette: ReturnType<typeof weddingPalette> }) {
  return (
    <section id="wedding-invoices" className="scroll-mt-24 rounded-[1.75rem] border bg-white p-5 sm:p-7" style={{ borderColor: palette.border }}>
      <h2 className="font-serif text-xl" style={{ color: palette.ink }}>Payments</h2>
      <div className="mt-4 space-y-3">
        {invoicesQ.isLoading ? <Muted text="Loading your payments…" wash={palette.wash} /> : invoicesQ.isError ? <Muted text="We couldn’t load this right now. Please refresh." wash={palette.wash} /> : invoicesQ.data?.length ? invoicesQ.data.map((invoice) => <InvoiceCard key={invoice.id} invoice={invoice} />) : <Muted text="You’re all set. Nothing is due right now." wash={palette.wash} />}
      </div>
    </section>
  );
}

function WeddingFacts({
  dateLabel,
  locationLabel,
  palette,
  center,
}: {
  dateLabel: string | null;
  locationLabel: string | null;
  palette: { accent: string };
  center?: boolean;
}) {
  if (!dateLabel && !locationLabel) return null;
  return (
    <div
      className={`mt-4 flex flex-col gap-2 text-sm text-stone-700 sm:flex-row sm:flex-wrap sm:gap-5 ${
        center ? "items-center sm:justify-center" : ""
      }`}
    >
      {dateLabel && (
        <span className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0" style={{ color: palette.accent }} /> {dateLabel}
        </span>
      )}
      {locationLabel && (
        <span className="flex items-start gap-2 text-left">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: palette.accent }} />
          <span className="break-words">{locationLabel}</span>
        </span>
      )}
    </div>
  );
}

function Muted({ text, wash }: { text: string; wash: string }) {
  return (
    <div className="rounded-2xl p-5 text-sm text-stone-600" style={{ background: wash }}>
      {text}
    </div>
  );
}
