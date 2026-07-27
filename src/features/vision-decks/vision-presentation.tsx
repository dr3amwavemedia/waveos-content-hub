import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  Film,
  Flag,
  Goal,
  Images,
  Lightbulb,
  MousePointer2,
  Play,
  Quote,
  Smartphone,
  Sparkles,
  Target,
  X,
  Zap,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { WaveLogo } from "@/components/branding/wave-logo";
import { cn } from "@/lib/utils";
import { isValidHttpsUrl } from "@/lib/url-validation";
import { VisionLogo } from "./vision-logo";
import type { PublicVisionDeck, VisionDeck, VisionReference, VisionRoiModel } from "./types";

type PresentableDeck = VisionDeck | PublicVisionDeck;

interface VisionPresentationProps {
  deck: PresentableDeck;
  onClose?: () => void;
  onSlideChange?: (slideKey: string, index: number) => void;
  /** When set, VisionLogo resolves signed URLs through the public API. */
  shareToken?: string;
}

interface SlideDefinition {
  key: string;
  shortLabel: string;
  content: ReactNode;
}

export function VisionPresentation({ deck, onClose, onSlideChange, shareToken }: VisionPresentationProps) {
  const [index, setIndex] = useState(0);
  const touchStart = useRef<number | null>(null);

  const slides = useMemo<SlideDefinition[]>(
    () => [
      { key: "opening", shortLabel: "Vision", content: <OpeningSlide deck={deck} shareToken={shareToken} /> },
      { key: "discovery", shortLabel: "We heard you", content: <DiscoverySlide deck={deck} /> },
      { key: "direction", shortLabel: "Direction", content: <DirectionSlide deck={deck} /> },
      { key: "content-system", shortLabel: "Content system", content: <ContentSystemSlide deck={deck} /> },
      { key: "social-preview", shortLabel: "In the feed", content: <SocialPreviewSlide deck={deck} /> },
      { key: "roi", shortLabel: "Opportunity", content: <RoiSlide deck={deck} /> },
      { key: "roadmap", shortLabel: "Roadmap", content: <RoadmapSlide deck={deck} /> },
      { key: "next-step", shortLabel: "Next step", content: <ClosingSlide deck={deck} /> },
    ],
    [deck, shareToken],
  );

  const goTo = useCallback(
    (next: number) => setIndex(Math.max(0, Math.min(slides.length - 1, next))),
    [slides.length],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === " ") {
        event.preventDefault();
        goTo(index + 1);
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        goTo(index - 1);
      }
      if (event.key === "Escape" && onClose) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goTo, index, onClose]);

  useEffect(() => {
    onSlideChange?.(slides[index].key, index);
  }, [index, onSlideChange, slides]);

  const accent = /^#[0-9a-f]{6}$/i.test(deck.accent_color) ? deck.accent_color : "#4db8ff";

  return (
    <div
      className="vision-stage fixed inset-0 z-[100] overflow-hidden bg-[#03060d] text-white"
      style={{ "--vision-accent": accent } as CSSProperties}
      onTouchStart={(event) => {
        touchStart.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        if (touchStart.current === null) return;
        const finish = event.changedTouches[0]?.clientX ?? touchStart.current;
        const delta = finish - touchStart.current;
        if (Math.abs(delta) > 50) goTo(index + (delta < 0 ? 1 : -1));
        touchStart.current = null;
      }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="vision-orb vision-orb-one" />
        <div className="vision-orb vision-orb-two" />
        <div className="vision-grid absolute inset-0 opacity-30" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/50 to-transparent" />
      </div>

      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-4 sm:px-7 sm:py-6">
        <WaveLogo compact />
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/60 backdrop-blur sm:inline-flex">
            Prepared for {deck.company_name}
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-full border border-white/10 bg-white/5 p-2 text-white/70 backdrop-blur transition hover:bg-white/10 hover:text-white"
              aria-label="Close presentation"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <main
        key={slides[index].key}
        className="animate-vision-slide-in relative z-10 h-full overflow-y-auto overscroll-contain px-4 pb-28 pt-24 sm:px-8 sm:pb-24 sm:pt-28 lg:px-16"
      >
        <div className="mx-auto flex min-h-[calc(100dvh-13rem)] w-full max-w-7xl items-center">
          {slides[index].content}
        </div>
      </main>

      <footer className="absolute inset-x-0 bottom-0 z-20 border-t border-white/8 bg-[#03060d]/75 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-7">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <button
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            className="rounded-full border border-white/10 bg-white/5 p-2.5 text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-25"
            aria-label="Previous slide"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.14em] text-white/45">
              <span className="truncate">{slides[index].shortLabel}</span>
              <span>
                {String(index + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}
              </span>
            </div>
            <div className="flex gap-1">
              {slides.map((slide, slideIndex) => (
                <button
                  key={slide.key}
                  onClick={() => goTo(slideIndex)}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-all duration-500",
                    slideIndex <= index ? "bg-[var(--vision-accent)]" : "bg-white/12",
                  )}
                  aria-label={`Go to ${slide.shortLabel}`}
                />
              ))}
            </div>
          </div>
          <button
            onClick={() => goTo(index + 1)}
            disabled={index === slides.length - 1}
            className="rounded-full bg-[var(--vision-accent)] p-2.5 text-[#04101a] shadow-[0_0_30px_-8px_var(--vision-accent)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-25"
            aria-label="Next slide"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </footer>
    </div>
  );
}

function OpeningSlide({ deck, shareToken }: { deck: PresentableDeck; shareToken?: string }) {
  const logo = deck.content.branding?.companyLogo;
  return (
    <section className="grid w-full items-center gap-10 lg:grid-cols-[1.2fr_.8fr]">
      <div>
        <Eyebrow icon={Sparkles}>{deck.content.cover.eyebrow}</Eyebrow>
        {logo?.storagePath && (
          <div className="mt-8 flex h-20 w-full max-w-xs items-center">
            <VisionLogo
              storagePath={logo.storagePath}
              alt={logo.alt || `${deck.company_name} logo`}
              fit={logo.fit}
              shareToken={shareToken}
              className="max-h-full max-w-full"
              fallback={deck.company_name}
            />
          </div>
        )}
        <h1 className="mt-6 max-w-5xl text-4xl font-semibold leading-[1.02] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl xl:text-8xl">
          {deck.content.cover.headline}
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/60 sm:text-xl">
          {deck.content.cover.subhead}
        </p>
        <div className="mt-8 flex items-center gap-3 text-xs text-white/45">
          <span className="h-px w-10 bg-[var(--vision-accent)]" />
          {deck.prospect_name ? `Prepared for ${deck.prospect_name}` : deck.company_name}
        </div>
      </div>
      <div className="relative hidden min-h-[28rem] lg:block">
        <div className="absolute inset-8 rotate-3 rounded-[2.5rem] border border-white/10 bg-white/[0.035]" />
        <div className="absolute inset-0 -rotate-2 overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-[color-mix(in_srgb,var(--vision-accent)_24%,transparent)] via-white/[0.035] to-transparent p-8 shadow-2xl">
          <div className="flex h-full flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.22em] text-white/45">Dream Wave / Vision 01</span>
              <div className="h-2 w-2 rounded-full bg-[var(--vision-accent)] shadow-[0_0_16px_var(--vision-accent)]" />
            </div>
            <div>
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-black/20">
                {logo?.storagePath ? (
                  <VisionLogo
                    storagePath={logo.storagePath}
                    alt={logo.alt || `${deck.company_name} logo`}
                    fit={logo.fit}
                    shareToken={shareToken}
                    className="h-12 w-12"
                  />
                ) : (
                  <Film className="h-7 w-7 text-[var(--vision-accent)]" />
                )}
              </div>
              <p className="text-sm uppercase tracking-[0.18em] text-white/45">The opportunity</p>
              <p className="mt-3 text-3xl font-semibold leading-tight">Make the value impossible to miss.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function DiscoverySlide({ deck }: { deck: PresentableDeck }) {
  const { discovery } = deck.content;
  return (
    <section className="w-full">
      <Eyebrow icon={Quote}>What we heard</Eyebrow>
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:gap-14">
        <div>
          <h2 className="text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl">
            The work starts with listening.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-white/60 sm:text-lg">{discovery.summary}</p>
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--vision-accent)]">The audience</p>
            <p className="mt-2 text-sm leading-relaxed text-white/75">{discovery.audience}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <InsightCard icon={Goal} title="What success looks like" items={discovery.goals} tone="accent" />
          <InsightCard icon={Target} title="What needs to change" items={discovery.challenges} />
        </div>
      </div>
    </section>
  );
}

function DirectionSlide({ deck }: { deck: PresentableDeck }) {
  const { direction } = deck.content;
  return (
    <section className="w-full">
      <Eyebrow icon={Lightbulb}>Creative direction</Eyebrow>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-3xl">
          <h2 className="text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">{direction.title}</h2>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/60 sm:text-lg">{direction.narrative}</p>
        </div>
        <div className="flex max-w-lg flex-wrap gap-2">
          {direction.keywords.map((keyword) => (
            <span key={keyword} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/75">
              {keyword}
            </span>
          ))}
        </div>
      </div>
      <ReferenceGrid references={direction.references} />
    </section>
  );
}

function ContentSystemSlide({ deck }: { deck: PresentableDeck }) {
  const { plan } = deck.content;
  return (
    <section className="w-full">
      <Eyebrow icon={Zap}>The content system</Eyebrow>
      <div className="mt-6 grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:gap-12">
        <div>
          <h2 className="text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
            One production.
            <span className="block text-[var(--vision-accent)]">Many moments.</span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-white/60">{plan.narrative}</p>
          <div className="mt-8 flex items-center gap-3 text-xs text-white/45">
            <Film className="h-4 w-4 text-[var(--vision-accent)]" />
            Designed to work across the complete customer journey
          </div>
        </div>
        <div className="space-y-3">
          {plan.deliverables.map((item, itemIndex) => (
            <div key={item.id} className="group grid gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5 transition hover:border-white/20 hover:bg-white/[0.055] sm:grid-cols-[auto_1fr_auto] sm:items-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--vision-accent)_14%,transparent)] text-sm font-semibold text-[var(--vision-accent)]">
                {String(itemIndex + 1).padStart(2, "0")}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-white">{item.quantity}× {item.title}</h3>
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/45">{item.platform}</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-white/50">{item.description}</p>
              </div>
              <ArrowRight className="hidden h-4 w-4 text-white/25 transition group-hover:translate-x-1 group-hover:text-[var(--vision-accent)] sm:block" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SocialPreviewSlide({ deck }: { deck: PresentableDeck }) {
  const { social } = deck.content;
  return (
    <section className="grid w-full items-center gap-8 lg:grid-cols-[.85fr_1.15fr] lg:gap-16">
      <div>
        <Eyebrow icon={Smartphone}>See it in context</Eyebrow>
        <h2 className="mt-6 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
          Built to stop the scroll.
          <span className="block text-[var(--vision-accent)]">And earn the next click.</span>
        </h2>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-white/60">
          This concept preview demonstrates how the creative direction can translate into a vertical
          story. Final performance depends on distribution, consistency, offer, and audience response.
        </p>
        <div className="mt-7 flex flex-wrap gap-3 text-xs text-white/55">
          {["Hook in 2 seconds", "Native 9:16 framing", "One clear action"].map((item) => (
            <span key={item} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2">
              <Check className="h-3.5 w-3.5 text-[var(--vision-accent)]" />
              {item}
            </span>
          ))}
        </div>
      </div>
      <PhonePreview deck={deck} />
    </section>
  );
}

function RoiSlide({ deck }: { deck: PresentableDeck }) {
  const [model, setModel] = useState<VisionRoiModel>(deck.content.roi);
  const result = calculateRoi(model);
  return (
    <section className="w-full">
      <Eyebrow icon={BarChart3}>Scenario explorer</Eyebrow>
      <div className="mt-6 grid gap-8 lg:grid-cols-[.9fr_1.1fr] lg:gap-12">
        <div>
          <h2 className="text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
            Make the path to value
            <span className="block text-[var(--vision-accent)]">visible.</span>
          </h2>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-white/55">
            Adjust the assumptions to explore possible outcomes. These figures are planning scenarios—not performance guarantees.
          </p>
          <div className="mt-8 space-y-5">
            <RoiControl label="Average views per video" value={model.averageViews} min={500} max={25000} step={500} display={formatNumber(model.averageViews)} onChange={(averageViews) => setModel((c) => ({ ...c, averageViews }))} />
            <RoiControl label="Website click rate" value={model.clickRate} min={0.2} max={8} step={0.1} display={`${model.clickRate.toFixed(1)}%`} onChange={(clickRate) => setModel((c) => ({ ...c, clickRate }))} />
            <RoiControl label="Average customer value" value={model.customerValue} min={500} max={25000} step={500} display={formatMoney(model.customerValue)} onChange={(customerValue) => setModel((c) => ({ ...c, customerValue }))} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard label="Potential reach" value={formatNumber(result.reach)} icon={MousePointer2} />
          <MetricCard label="Potential site visits" value={formatNumber(result.visits)} icon={ArrowUpRight} />
          <MetricCard label="Potential inquiries" value={formatNumber(result.leads)} icon={Target} />
          <MetricCard label="Potential customers" value={result.customers.toFixed(1)} icon={Check} />
          <div className="sm:col-span-2 rounded-3xl border border-[color-mix(in_srgb,var(--vision-accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--vision-accent)_10%,transparent)] p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--vision-accent)]">Modeled business value</p>
                <p className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">{formatMoney(result.value)}</p>
              </div>
              <CircleDollarSign className="h-10 w-10 text-[var(--vision-accent)] opacity-75" />
            </div>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-4 text-xs text-white/50">
              <span>Investment: {formatMoney(model.investment)}</span>
              <span>Break-even: {result.breakEvenCustomers.toFixed(1)} customers</span>
              <span>{model.months}-month scenario</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RoadmapSlide({ deck }: { deck: PresentableDeck }) {
  return (
    <section className="w-full">
      <Eyebrow icon={Flag}>From vision to launch</Eyebrow>
      <div className="mt-6 grid gap-8 lg:grid-cols-[.7fr_1.3fr] lg:gap-14">
        <div>
          <h2 className="text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
            A clear path.
            <span className="block text-[var(--vision-accent)]">No guesswork.</span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-white/55">
            Every phase has a purpose, an owner, and a clear decision. The result is a production process that protects both the creative and the timeline.
          </p>
        </div>
        <div className="relative space-y-3 before:absolute before:bottom-8 before:left-[1.375rem] before:top-8 before:w-px before:bg-gradient-to-b before:from-[var(--vision-accent)] before:to-white/5">
          {deck.content.timeline.map((step, stepIndex) => (
            <div key={step.id} className="relative grid grid-cols-[2.75rem_1fr] gap-4">
              <div className="z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[#09101c] text-xs font-semibold text-[var(--vision-accent)]">
                {String(stepIndex + 1).padStart(2, "0")}
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:flex sm:items-start sm:justify-between sm:gap-5">
                <div>
                  <h3 className="font-semibold text-white">{step.phase}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-white/50">{step.detail}</p>
                </div>
                <span className="mt-3 inline-flex shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-medium text-white/50 sm:mt-0">
                  {step.timing}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClosingSlide({ deck }: { deck: PresentableDeck }) {
  const { close } = deck.content;
  const canOpenCta = isValidHttpsUrl(close.callToActionUrl);
  return (
    <section className="mx-auto w-full max-w-5xl text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-[color-mix(in_srgb,var(--vision-accent)_14%,transparent)]">
        <Sparkles className="h-7 w-7 text-[var(--vision-accent)]" />
      </div>
      <p className="mt-7 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--vision-accent)]">
        Dream Wave Media × {deck.company_name}
      </p>
      <h2 className="mx-auto mt-5 max-w-4xl text-4xl font-semibold leading-[1.05] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
        {close.headline}
      </h2>
      <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/55 sm:text-lg">{close.body}</p>
      {canOpenCta ? (
        <a
          href={close.callToActionUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-9 inline-flex items-center gap-2 rounded-full bg-[var(--vision-accent)] px-6 py-3 text-sm font-semibold text-[#04101a] shadow-[0_0_34px_-10px_var(--vision-accent)] transition hover:-translate-y-0.5 hover:brightness-110"
        >
          {close.callToActionLabel}
          <ArrowUpRight className="h-4 w-4" />
        </a>
      ) : (
        <div className="mt-9 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-6 py-3 text-sm font-medium text-white/75">
          {close.callToActionLabel}
          <ArrowRight className="h-4 w-4 text-[var(--vision-accent)]" />
        </div>
      )}
    </section>
  );
}

function Eyebrow({ icon: Icon, children }: { icon: typeof Sparkles; children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--vision-accent)]">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </div>
  );
}

function InsightCard({
  icon: Icon,
  title,
  items,
  tone,
}: {
  icon: typeof Goal;
  title: string;
  items: string[];
  tone?: "accent";
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border p-5",
        tone === "accent"
          ? "border-[color-mix(in_srgb,var(--vision-accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--vision-accent)_9%,transparent)]"
          : "border-white/10 bg-white/[0.035]",
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/15">
        <Icon className="h-4 w-4 text-[var(--vision-accent)]" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-white">{title}</h3>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-white/55">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--vision-accent)]" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReferenceGrid({ references }: { references: VisionReference[] }) {
  if (references.length === 0) {
    return (
      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        {[
          { icon: Images, title: "Visual language", body: "Premium lighting and composed, purposeful frames." },
          { icon: Film, title: "Editorial rhythm", body: "Confident pacing with room for human moments." },
          { icon: Sparkles, title: "Brand feeling", body: "Modern, credible, and unmistakably personal." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <Icon className="h-5 w-5 text-[var(--vision-accent)]" />
            <h3 className="mt-8 font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/50">{body}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {references.slice(0, 6).map((reference) => {
        const image = reference.kind === "image" && isValidHttpsUrl(reference.url);
        return (
          <a
            key={reference.id}
            href={isValidHttpsUrl(reference.url) ? reference.url : undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative min-h-52 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]"
          >
            {image ? (
              <img
                src={reference.url}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-70 transition duration-700 group-hover:scale-105 group-hover:opacity-90"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--vision-accent)_18%,transparent)] to-transparent" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{reference.label}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/55">{reference.note}</p>
                </div>
                <ExternalLink className="h-4 w-4 shrink-0 text-[var(--vision-accent)]" />
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}

function PhonePreview({ deck }: { deck: PresentableDeck }) {
  const { social } = deck.content;
  const video = resolveVideoSource(social.videoUrl);
  const poster = isValidHttpsUrl(social.posterUrl) ? social.posterUrl : undefined;
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="absolute -inset-8 rounded-full bg-[var(--vision-accent)] opacity-10 blur-3xl" />
      <div className="relative mx-auto aspect-[9/18.5] w-[min(18.5rem,70vw)] overflow-hidden rounded-[3.1rem] border-[7px] border-[#151a22] bg-[#080b10] shadow-2xl ring-1 ring-white/15">
        <div className="absolute left-1/2 top-2 z-20 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
        <div className="absolute inset-0">
          {video?.kind === "video" ? (
            <video src={video.url} poster={poster} className="h-full w-full object-cover" autoPlay muted loop playsInline />
          ) : poster ? (
            <img src={poster} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(circle_at_40%_20%,color-mix(in_srgb,var(--vision-accent)_40%,transparent),transparent_35%),linear-gradient(145deg,#101826,#05070b_70%)]">
              <div className="absolute inset-0 vision-grid opacity-25" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-black/30 backdrop-blur">
                  <Play className="ml-1 h-6 w-6 fill-white text-white" />
                </div>
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/80" />
        </div>
        <div className="absolute inset-x-0 top-9 z-10 flex items-center gap-2 px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--vision-accent)] text-[10px] font-bold text-black">
            {deck.company_name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-[11px] font-semibold text-white">{social.handle}</p>
            <p className="text-[9px] text-white/55">Sponsored concept preview</p>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 z-10 p-4 pb-6">
          <div className="mb-4 max-w-[90%] rounded-2xl border border-white/12 bg-black/30 p-3 backdrop-blur-md">
            <p className="text-[13px] font-semibold leading-snug text-white">{social.hook}</p>
          </div>
          <p className="line-clamp-3 text-[10px] leading-relaxed text-white/75">
            <span className="font-semibold text-white">{social.handle}</span> {social.caption}
          </p>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-white px-3 py-2 text-[10px] font-semibold text-black">
            {social.callToAction}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
      {video?.kind === "embed" && (
        <a
          href={social.videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="relative mx-auto mt-4 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] text-white/55 hover:text-white"
        >
          <Play className="h-3 w-3" /> Open reference video
        </a>
      )}
    </div>
  );
}

function RoiControl({
  label, value, min, max, step, display, onChange,
}: { label: string; value: number; min: number; max: number; step: number; display: string; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between text-xs">
        <span className="text-white/55">{label}</span>
        <span className="font-semibold text-white">{display}</span>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="vision-range w-full"
      />
    </label>
  );
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Target }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">{label}</p>
        <Icon className="h-4 w-4 text-[var(--vision-accent)]" />
      </div>
      <p className="mt-5 text-3xl font-semibold tracking-tight text-white">{value}</p>
    </div>
  );
}

function calculateRoi(model: VisionRoiModel) {
  const reach = model.videosPerMonth * model.months * model.averageViews;
  const visits = reach * (model.clickRate / 100);
  const leads = visits * (model.leadRate / 100);
  const customers = leads * (model.closeRate / 100);
  const value = customers * model.customerValue;
  return {
    reach,
    visits,
    leads,
    customers,
    value,
    breakEvenCustomers: model.customerValue > 0 ? model.investment / model.customerValue : 0,
  };
}

function resolveVideoSource(url: string): { kind: "video" | "embed"; url: string } | null {
  if (!isValidHttpsUrl(url)) return null;
  if (/\.(mp4|webm|ogg)(?:\?.*)?$/i.test(url)) return { kind: "video", url };
  return { kind: "embed", url };
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}
