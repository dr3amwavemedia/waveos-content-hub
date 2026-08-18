import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarHeart, FileSignature, Heart, ReceiptText, ShieldCheck, Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/components/app/workspace-context";
import {
  ContractCard,
  InvoiceCard,
  type Contract,
  type Invoice,
} from "@/components/app/layer1-overview";

const externalDb = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export function WeddingOverview() {
  const { activeWorkspace } = useWorkspace();
  const wsId = activeWorkspace?.id;

  const workspaceQ = useQuery({
    queryKey: ["wedding", "workspace", wsId],
    enabled: !!wsId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select(
          "name,account_status,wedding_display_name,wedding_theme,wedding_scheduling_url",
        )
        .eq("id", wsId!)
        .single();
      if (error) throw error;
      return data;
    },
  });


  const isActive = workspaceQ.data?.account_status === "active";
  const invoicesQ = useQuery({
    queryKey: ["wedding", "invoices", wsId],
    enabled: !!wsId && isActive,
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
    enabled: !!wsId && isActive,
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

  if (workspaceQ.isLoading) {
    return <div className="rounded-3xl bg-white p-8 text-sm text-stone-600">Preparing your wedding portal…</div>;
  }

  const theme = workspaceQ.data?.wedding_theme === "gold" ? "gold" : "olive";
  const palette = theme === "gold"
    ? { ink: "#70551c", accent: "#b48a32", wash: "#fbf7ed", border: "#eadcb9" }
    : { ink: "#3f4d29", accent: "#667843", wash: "#f4f6ee", border: "#d9dfca" };
  const displayName = workspaceQ.data?.wedding_display_name?.trim()
    || workspaceQ.data?.name
    || "Your Wedding";

  if (!isActive) {
    return (
      <div className="mx-auto max-w-2xl rounded-[2rem] border bg-white p-8 text-center shadow-sm sm:p-12" style={{ borderColor: palette.border }}>
        <Heart className="mx-auto h-10 w-10" style={{ color: palette.accent }} />
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: palette.accent }}>Dream Wave Weddings</p>
        <h1 className="mt-3 text-4xl font-serif text-stone-900 sm:text-5xl">{displayName}</h1>
        <p className="mx-auto mt-5 max-w-lg leading-7 text-stone-600">
          Your wedding portal is currently inactive. Dream Wave Media will let you know as soon as everything is ready for you.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 rounded-[2rem] p-1 text-stone-900" style={{ background: palette.wash }}>
      <header className="relative isolate overflow-hidden rounded-[2rem] border px-6 py-14 text-center text-white shadow-2xl sm:px-12 sm:py-20" style={{ borderColor: palette.border, background: `linear-gradient(135deg, #11160d 0%, ${palette.ink} 52%, #17130a 100%)` }}>
        <div className="absolute -left-20 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl" style={{ background: palette.accent }} />
        <div className="absolute -bottom-28 -right-14 h-80 w-80 rounded-full bg-white/20 blur-3xl" />
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at center, white 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
        <Sparkles className="absolute left-6 top-6 h-5 w-5 text-white/70" />
        <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10 shadow-[0_0_40px_rgba(255,255,255,.2)] backdrop-blur"><Heart className="h-7 w-7 text-white" /></div>
        <p className="relative mt-6 text-xs font-semibold uppercase tracking-[0.3em] text-white/75">Welcome to the Dream Wave family</p>
        <h1 className="relative mx-auto mt-4 max-w-5xl font-serif text-5xl leading-[0.95] tracking-tight text-white sm:text-7xl lg:text-8xl">
          {displayName}
        </h1>
        <p className="relative mx-auto mt-7 max-w-2xl text-base leading-7 text-white/75 sm:text-lg">
          We’re honored to be part of your story. Your important wedding documents and payments are gathered here, simply and beautifully.
        </p>
        <div className="relative mx-auto mt-8 h-px max-w-xs bg-gradient-to-r from-transparent via-white/70 to-transparent" />
      </header>

      <section className="relative overflow-hidden rounded-[2rem] border bg-white p-6 shadow-sm sm:p-8" style={{ borderColor: palette.border }}>
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full opacity-20 blur-3xl" style={{ background: palette.accent }} />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg" style={{ background: palette.accent }}><CalendarHeart className="h-6 w-6" /></span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: palette.accent }}>You’re officially in</p>
              <h2 className="mt-2 text-3xl font-serif text-stone-950">Creative Strategy Meeting</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">Now that your deposit has been accepted, our next step is shaping the look, emotion, and energy of your wedding story together.</p>
            </div>
          </div>
          <a href="mailto:dr3amwavemedia@outlook.com?subject=Wedding%20Creative%20Strategy%20Meeting" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5" style={{ background: palette.accent }}>Schedule with Dream Wave <ArrowRight className="h-4 w-4" /></a>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <WeddingSummary icon={Heart} label="Your wedding" detail="Everything important, in one place" accent={palette.accent} border={palette.border} />
        <WeddingSummary icon={FileSignature} label="Contracts" detail={`${contractsQ.data?.length ?? 0} on file`} accent={palette.accent} border={palette.border} />
        <WeddingSummary icon={ReceiptText} label="Invoices & payments" detail={`${invoicesQ.data?.length ?? 0} on file`} accent={palette.accent} border={palette.border} />
      </div>

      <section id="wedding-contracts" className="scroll-mt-24 space-y-3 rounded-[2rem] border bg-white p-5 sm:p-7" style={{ borderColor: palette.border }}>
        <div className="flex items-center gap-3">
          <FileSignature className="h-6 w-6" style={{ color: palette.accent }} />
          <h2 className="text-2xl font-serif">Contracts</h2>
        </div>
        {contractsQ.isLoading ? <Loading text="Loading contracts…" /> : contractsQ.isError ? <ErrorMessage /> : contractsQ.data?.length ? (
          <div className="space-y-3">{contractsQ.data.map((contract) => <ContractCard key={contract.id} contract={contract} />)}</div>
        ) : <Empty text="No contracts need your attention right now." />}
      </section>

      <section id="wedding-invoices" className="scroll-mt-24 space-y-3 rounded-[2rem] border bg-white p-5 sm:p-7" style={{ borderColor: palette.border }}>
        <div className="flex items-center gap-3">
          <ReceiptText className="h-6 w-6" style={{ color: palette.accent }} />
          <h2 className="text-2xl font-serif">Invoices & Payments</h2>
        </div>
        {invoicesQ.isLoading ? <Loading text="Loading invoices…" /> : invoicesQ.isError ? <ErrorMessage /> : invoicesQ.data?.length ? (
          <div className="space-y-3">{invoicesQ.data.map((invoice) => <InvoiceCard key={invoice.id} invoice={invoice} />)}</div>
        ) : <Empty text="You have no invoices requiring action." />}
      </section>

      <footer className="flex items-center justify-center gap-2 pb-8 text-sm text-stone-600">
        <ShieldCheck className="h-4 w-4" style={{ color: palette.accent }} /> Private and organized for your wedding
      </footer>
    </div>
  );
}

function WeddingSummary({ icon: Icon, label, detail, accent, border }: { icon: typeof Heart; label: string; detail: string; accent: string; border: string }) {
  return <div className="rounded-3xl border bg-white p-5 shadow-sm" style={{ borderColor: border }}><Icon className="h-5 w-5" style={{ color: accent }} /><p className="mt-4 font-semibold text-stone-900">{label}</p><p className="mt-1 text-sm text-stone-500">{detail}</p></div>;
}

function Loading({ text }: { text: string }) { return <div className="rounded-2xl bg-stone-50 p-5 text-sm text-stone-500">{text}</div>; }
function ErrorMessage() { return <div className="rounded-2xl bg-red-50 p-5 text-sm text-red-700">This information could not be loaded. Please refresh and try again.</div>; }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl bg-stone-50 p-6 text-center text-sm text-stone-500">{text}</div>; }
