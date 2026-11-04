import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  Loader2,
  Megaphone,
  MessageSquareText,
  Mic,
  MicOff,
  Plus,
  Sparkles,
  Volume2,
  VolumeX,
  WandSparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { RequireFeature } from "@/components/app/require-feature";
import { useWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { waveAssist } from "@/lib/wave-assist.functions";
import {
  createAgentCampaign,
  getAgentPerformanceSnapshot,
} from "@/lib/my-agent-actions.functions";
import { cn } from "@/lib/utils";

type AgentMessage = { role: "user" | "assistant"; content: string };

type AgentPerformanceSnapshot = {
  asOf: string;
  rangeStart: string | null;
  rangeEnd: string | null;
  metrics: Array<{
    key: string;
    label: string;
    value: number;
    unit: string;
    previousValue: number | null;
    changePercent: number | null;
  }>;
  message: string | null;
};

type AgentCampaignDraft = {
  name: string;
  goal: "awareness" | "engagement" | "leads" | "launch" | "retention";
  durationDays: number;
  maxPosts: number;
  platforms: string[];
};

function localDateKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type SpeechResultEvent = {
  results: ArrayLike<{ 0?: { transcript?: string } }>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export const Route = createFileRoute("/_authenticated/my-agent")({
  component: () => (
    <RequireFeature
      feature="can_use_ai_tools"
      title="My Agent is not included in this plan"
      description="Upgrade your WaveOS plan to use workspace-aware text and voice guidance."
    >
      <MyAgentPage />
    </RequireFeature>
  ),
  head: () => ({ meta: [{ title: "My Agent — WaveOS" }] }),
});

function AgentMessageContent({ content }: { content: string }) {
  const inline = (text: string) =>
    text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={index} className="font-semibold text-slate-100">
          {part.slice(2, -2)}
        </strong>
      ) : (
        <span key={index}>{part}</span>
      ),
    );

  return (
    <div className="space-y-2 whitespace-normal">
      {content.split("\n").map((raw, index) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <div key={index} className="h-1" aria-hidden="true" />;
        if (/^---+$/.test(line.trim())) {
          return <div key={index} className="my-2 border-t border-cyan-200/10" />;
        }
        const heading = line.match(/^#{1,4}\s+(.+)$/);
        if (heading) {
          return (
            <p key={index} className="pt-1 font-semibold text-slate-100">
              {inline(heading[1])}
            </p>
          );
        }
        const bullet = line.match(/^[-*]\s+(.+)$/);
        if (bullet) {
          return (
            <div key={index} className="flex gap-2">
              <span className="mt-[.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300/70" />
              <p className="min-w-0">{inline(bullet[1])}</p>
            </div>
          );
        }
        const numbered = line.match(/^(\d+)\.\s+(.+)$/);
        if (numbered) {
          return (
            <div key={index} className="flex gap-2">
              <span className="shrink-0 font-semibold text-cyan-200/80">{numbered[1]}.</span>
              <p className="min-w-0">{inline(numbered[2])}</p>
            </div>
          );
        }
        return <p key={index}>{inline(line)}</p>;
      })}
    </div>
  );
}

function MyAgentPage() {
  const { activeWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const assist = useServerFn(waveAssist);
  const getPerformance = useServerFn(getAgentPerformanceSnapshot);
  const saveAgentCampaign = useServerFn(createAgentCampaign);
  const workspaceId = activeWorkspace?.id ?? null;
  const storageKey = workspaceId ? `waveos.assist.${workspaceId}` : null;
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(false);
  const [activeTool, setActiveTool] = useState<"campaign" | "performance" | null>(null);
  const [toolBusy, setToolBusy] = useState(false);
  const [toolError, setToolError] = useState<string | null>(null);
  const [performance, setPerformance] = useState<AgentPerformanceSnapshot | null>(null);
  const [campaignStep, setCampaignStep] = useState(0);
  const [campaignSaved, setCampaignSaved] = useState<null | {
    id: string;
    name: string;
    plannedItems: number;
    startDate: string;
    endDate: string;
  }>(null);
  const [campaignDraft, setCampaignDraft] = useState<AgentCampaignDraft>({
    name: "",
    goal: "awareness",
    durationDays: 30,
    maxPosts: 8,
    platforms: ["instagram"],
  });
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = sessionStorage.getItem(storageKey);
      const parsed = stored ? (JSON.parse(stored) as AgentMessage[]) : [];
      setMessages(
        Array.isArray(parsed)
          ? parsed
              .filter(
                (message) =>
                  (message?.role === "user" || message?.role === "assistant") &&
                  typeof message.content === "string",
              )
              .slice(-8)
          : [],
      );
    } catch {
      setMessages([]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (storageKey) sessionStorage.setItem(storageKey, JSON.stringify(messages.slice(-8)));
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, storageKey]);

  useEffect(
    () => () => {
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    },
    [],
  );

  function addUserMessage(content: string) {
    setMessages((current) => [...current, { role: "user" as const, content }].slice(-8));
  }

  function startCampaignBuilder(prompt?: string) {
    if (prompt) addUserMessage(prompt);
    setDraft("");
    setToolError(null);
    setCampaignSaved(null);
    setCampaignStep(0);
    setCampaignDraft({
      name: "",
      goal: "awareness",
      durationDays: 30,
      maxPosts: 8,
      platforms: ["instagram"],
    });
    setActiveTool("campaign");
  }

  async function openPerformanceSnapshot(prompt?: string) {
    if (!workspaceId || toolBusy) return;
    if (prompt) addUserMessage(prompt);
    setDraft("");
    setToolError(null);
    setActiveTool("performance");
    setToolBusy(true);
    try {
      const result = await getPerformance({
        data: { workspaceId, localDate: localDateKey() },
      });
      setPerformance(result as AgentPerformanceSnapshot);
    } catch (caught) {
      setToolError(caught instanceof Error ? caught.message : "Performance could not be loaded.");
    } finally {
      setToolBusy(false);
    }
  }

  async function finishCampaign() {
    if (!workspaceId || toolBusy || !campaignDraft.name.trim() || !campaignDraft.platforms.length) return;
    setToolBusy(true);
    setToolError(null);
    try {
      const result = await saveAgentCampaign({
        data: {
          workspaceId,
          localDate: localDateKey(),
          name: campaignDraft.name,
          goal: campaignDraft.goal,
          durationDays: campaignDraft.durationDays,
          maxPosts: campaignDraft.maxPosts,
          platforms: campaignDraft.platforms as Array<
            "instagram" | "facebook" | "linkedin" | "tiktok" | "youtube" | "x"
          >,
        },
      });
      setCampaignSaved({
        id: result.id,
        name: result.name,
        plannedItems: result.plannedItems,
        startDate: result.startDate,
        endDate: result.endDate,
      });
      setCampaignStep(5);
    } catch (caught) {
      setToolError(caught instanceof Error ? caught.message : "Campaign could not be saved.");
    } finally {
      setToolBusy(false);
    }
  }

  async function sendMessage(raw: string, speakReply = false) {
    const input = raw.trim();
    if (!input || !workspaceId || busy || toolBusy) return;

    if (activeTool === "campaign" && campaignStep === 0 && !campaignDraft.name.trim()) {
      addUserMessage(input);
      setCampaignDraft((current) => ({ ...current, name: input.slice(0, 120) }));
      setCampaignStep(1);
      setDraft("");
      return;
    }

    const normalized = input.toLowerCase();
    if (
      /(campaign)/.test(normalized) &&
      /(create|build|start|make|new|plan)/.test(normalized)
    ) {
      startCampaignBuilder(input);
      return;
    }
    if (
      /(performance|analytics|growth|results|how (am|are) .*doing|how .*performing)/.test(normalized)
    ) {
      void openPerformanceSnapshot(input);
      return;
    }

    const prior = messages.slice(-6);
    setMessages((current) =>
      [...current, { role: "user" as const, content: input }].slice(-8),
    );
    setDraft("");
    setBusy(true);
    setError(null);
    try {
      const result = await assist({
        data: {
          mode: "advisor",
          input,
          workspaceId,
          conversation: prior,
          context: JSON.stringify({
            workspace: activeWorkspace?.name ?? "WaveOS",
            surface: "My Agent",
            inputMode: speakReply ? "voice" : "text",
            localDate: localDateKey(),
          }),
        },
      });
      setMessages((current) =>
        [...current, { role: "assistant" as const, content: result.suggestion }].slice(-8),
      );
      if (speakReply && voiceReplies && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(result.suggestion));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "My Agent is unavailable right now.");
    } finally {
      setBusy(false);
    }
  }

  function startVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError("Voice input is not supported in this browser. You can keep using this same conversation by typing.");
      return;
    }
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) void sendMessage(transcript, true);
    };
    recognition.onerror = () => {
      setError("I couldn't hear that clearly. Try the microphone again or type your message below.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setError(null);
    setListening(true);
    recognition.start();
  }

  const latestAnswer = [...messages]
    .reverse()
    .find((message) => message.role === "assistant")?.content;

  return (
    <div className="ocean-page mx-auto mb-24 flex h-[calc(100dvh-13rem)] min-h-[34rem] max-w-5xl flex-col overflow-hidden rounded-3xl border border-cyan-300/15 bg-[linear-gradient(145deg,rgba(4,24,45,.98),rgba(15,20,52,.96))] text-slate-50 shadow-2xl lg:mb-0 lg:h-auto lg:min-h-[calc(100vh-10rem)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-300/15 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/20 bg-gradient-to-br from-cyan-300/25 to-violet-400/25 text-cyan-100">
            <WandSparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">My Agent</h1>
              <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[.16em] text-violet-200">
                Premium
              </span>
            </div>
            <p className="truncate text-xs text-slate-400">
              One conversation for text and voice · {activeWorkspace?.name ?? "WaveOS"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setVoiceReplies((current) => !current)}
            aria-pressed={voiceReplies}
            title="Speak answers after voice questions"
          >
            {voiceReplies ? <Volume2 /> : <VolumeX />}
            <span className="hidden sm:inline">Voice replies</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setMessages([]);
              setError(null);
              setActiveTool(null);
              setPerformance(null);
              setToolError(null);
              setCampaignSaved(null);
              if (storageKey) sessionStorage.removeItem(storageKey);
            }}
          >
            <Plus /> New
          </Button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
        {messages.length === 0 ? (
          <div className="mx-auto flex min-h-[22rem] max-w-2xl flex-col items-center justify-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-300/10 text-cyan-200">
              <MessageSquareText className="h-7 w-7" />
            </span>
            <h2 className="mt-5 text-2xl font-semibold">What are we working on?</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-slate-400">
              Ask for a decision, content idea, performance recommendation, campaign plan, or next
              step. Speak or type—both continue this same conversation.
            </p>
            <div className="mt-5 grid w-full max-w-lg grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => startCampaignBuilder("Let's create a new campaign")}
                className="flex min-h-20 items-center gap-3 rounded-2xl border border-cyan-200/15 bg-cyan-200/[.06] p-3 text-left hover:bg-cyan-200/10"
              >
                <Megaphone className="h-5 w-5 shrink-0 text-cyan-200" />
                <span><span className="block text-sm font-semibold">Create campaign</span><span className="text-[11px] text-slate-400">Build it step by step</span></span>
              </button>
              <button
                type="button"
                onClick={() => void openPerformanceSnapshot("Show me my performance")}
                className="flex min-h-20 items-center gap-3 rounded-2xl border border-cyan-200/15 bg-cyan-200/[.06] p-3 text-left hover:bg-cyan-200/10"
              >
                <BarChart3 className="h-5 w-5 shrink-0 text-cyan-200" />
                <span><span className="block text-sm font-semibold">Performance</span><span className="text-[11px] text-slate-400">See a live snapshot</span></span>
              </button>
              <button
                type="button"
                onClick={() => void navigate({ to: "/create" })}
                className="rounded-2xl border border-cyan-200/15 bg-cyan-200/[.04] px-3 py-3 text-xs font-semibold text-cyan-50 hover:bg-cyan-200/10"
              >
                Create a post
              </button>
              <button
                type="button"
                onClick={() => void navigate({ to: "/creative-studio" })}
                className="rounded-2xl border border-cyan-200/15 bg-cyan-200/[.04] px-3 py-3 text-xs font-semibold text-cyan-50 hover:bg-cyan-200/10"
              >
                Open Creative Studio
              </button>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={cn(
                  "max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6",
                  message.role === "assistant"
                    ? "mr-auto border border-cyan-200/10 bg-cyan-200/[.06] text-slate-200"
                    : "ml-auto bg-violet-400/15 text-violet-50",
                )}
              >
                {message.role === "assistant" && (
                  <span className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.15em] text-cyan-200/70">
                    <Sparkles className="h-3 w-3" /> My Agent
                  </span>
                )}
                <AgentMessageContent content={message.content} />
              </article>
            ))}
            {activeTool === "campaign" && (
              <section className="mr-auto w-full max-w-xl rounded-2xl border border-violet-300/20 bg-violet-300/[.06] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-violet-100">
                  <Megaphone className="h-4 w-4" /> Campaign Builder
                </div>
                {campaignStep === 0 && (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm text-slate-300">What should we call this campaign?</p>
                    <div className="flex gap-2">
                      <input
                        value={campaignDraft.name}
                        onChange={(event) => setCampaignDraft((current) => ({ ...current, name: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && campaignDraft.name.trim()) setCampaignStep(1);
                        }}
                        placeholder="Campaign name"
                        maxLength={120}
                        className="min-h-11 min-w-0 flex-1 rounded-xl border border-violet-200/20 bg-[#06182d] px-3 text-sm outline-none focus:border-violet-300/60"
                      />
                      <Button size="sm" disabled={!campaignDraft.name.trim()} onClick={() => setCampaignStep(1)}>
                        Continue <ArrowRight />
                      </Button>
                    </div>
                  </div>
                )}
                {campaignStep === 1 && (
                  <div className="mt-4">
                    <p className="text-sm text-slate-300">What is the main goal?</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {(["awareness", "engagement", "leads", "launch", "retention"] as const).map((goal) => (
                        <Button
                          key={goal}
                          variant={campaignDraft.goal === goal ? "secondary" : "outline"}
                          className="justify-start capitalize"
                          onClick={() => {
                            setCampaignDraft((current) => ({ ...current, goal }));
                            setCampaignStep(2);
                          }}
                        >
                          {goal}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {campaignStep === 2 && (
                  <div className="mt-4">
                    <p className="text-sm text-slate-300">How many posts should WaveOS plan?</p>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {[4, 8, 12, 16].map((count) => (
                        <Button
                          key={count}
                          variant={campaignDraft.maxPosts === count ? "secondary" : "outline"}
                          onClick={() => {
                            setCampaignDraft((current) => ({ ...current, maxPosts: count }));
                            setCampaignStep(3);
                          }}
                        >
                          {count}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {campaignStep === 3 && (
                  <div className="mt-4">
                    <p className="text-sm text-slate-300">How long should the campaign run?</p>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {[14, 30, 45, 60].map((days) => (
                        <Button
                          key={days}
                          variant={campaignDraft.durationDays === days ? "secondary" : "outline"}
                          onClick={() => {
                            setCampaignDraft((current) => ({ ...current, durationDays: days }));
                            setCampaignStep(4);
                          }}
                        >
                          {days}d
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {campaignStep === 4 && (
                  <div className="mt-4">
                    <p className="text-sm text-slate-300">Where should it run?</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {["instagram", "facebook", "tiktok", "linkedin", "youtube", "x"].map((platform) => {
                        const selected = campaignDraft.platforms.includes(platform);
                        return (
                          <Button
                            key={platform}
                            size="sm"
                            variant={selected ? "secondary" : "outline"}
                            className="capitalize"
                            onClick={() =>
                              setCampaignDraft((current) => ({
                                ...current,
                                platforms: selected
                                  ? current.platforms.filter((item) => item !== platform)
                                  : [...current.platforms, platform],
                              }))
                            }
                          >
                            {platform}
                          </Button>
                        );
                      })}
                    </div>
                    <div className="mt-4 rounded-xl border border-violet-200/10 bg-black/10 p-3 text-xs text-slate-300">
                      <strong>{campaignDraft.name}</strong> · {campaignDraft.maxPosts} posts · {campaignDraft.durationDays} days · {campaignDraft.goal}
                    </div>
                    <Button className="mt-3 w-full" disabled={!campaignDraft.platforms.length || toolBusy} onClick={() => void finishCampaign()}>
                      {toolBusy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Create campaign
                    </Button>
                  </div>
                )}
                {campaignStep === 5 && campaignSaved && (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-3">
                      <div className="flex items-center gap-2 font-semibold text-emerald-100">
                        <CheckCircle2 className="h-4 w-4" /> Campaign created
                      </div>
                      <p className="mt-1 text-xs text-slate-300">
                        {campaignSaved.name} · {campaignSaved.plannedItems} planned slots · {campaignSaved.startDate} to {campaignSaved.endDate}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" onClick={() => void navigate({ to: "/campaigns" })}>Open Campaign Manager</Button>
                      <Button variant="outline" onClick={() => startCampaignBuilder()}>Build another</Button>
                    </div>
                  </div>
                )}
                {toolError && <p className="mt-3 text-xs text-amber-200">{toolError}</p>}
              </section>
            )}
            {activeTool === "performance" && (
              <section className="mr-auto w-full max-w-xl rounded-2xl border border-cyan-300/20 bg-cyan-300/[.05] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-cyan-100">
                  <BarChart3 className="h-4 w-4" /> Performance Snapshot
                </div>
                {toolBusy ? (
                  <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading connected analytics…
                  </div>
                ) : performance?.metrics.length ? (
                  <>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {performance.rangeStart} to {performance.rangeEnd} · as of {performance.asOf}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {performance.metrics.map((metric) => (
                        <div key={metric.key} className="rounded-xl border border-cyan-200/10 bg-black/10 p-3">
                          <p className="text-[10px] uppercase tracking-wide text-slate-400">{metric.label}</p>
                          <p className="mt-1 text-xl font-semibold">{Intl.NumberFormat().format(metric.value)}</p>
                          <p className={cn("mt-1 text-[11px]", metric.changePercent === null ? "text-slate-500" : metric.changePercent >= 0 ? "text-emerald-300" : "text-rose-300")}>
                            {metric.changePercent === null ? "No equal prior period" : `${metric.changePercent >= 0 ? "+" : ""}${metric.changePercent.toFixed(1)}% vs prior period`}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button variant="outline" onClick={() => void navigate({ to: "/analytics" })}>Open Analytics</Button>
                      <Button onClick={() => startCampaignBuilder()}>Build a campaign</Button>
                    </div>
                  </>
                ) : (
                  <p className="mt-4 text-sm text-slate-400">{performance?.message ?? toolError ?? "No performance data is available yet."}</p>
                )}
              </section>
            )}
            {busy && (
              <div className="mr-auto flex w-fit items-center gap-2 rounded-2xl border border-cyan-200/10 bg-cyan-200/[.04] px-4 py-3 text-xs text-cyan-100">
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking with your workspace…
              </div>
            )}
            {error && (
              <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs text-amber-100">
                {error}
              </p>
            )}
            <div ref={endRef} />
          </div>
        )}
      </main>

      <footer className="shrink-0 border-t border-cyan-300/15 bg-[#04172b]/92 p-3 sm:p-4">
        <form
          className="mx-auto max-w-3xl"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage(draft);
          }}
        >
          <div className="flex items-end gap-2 rounded-2xl border border-cyan-300/30 bg-[#06182d] p-2 focus-within:ring-2 focus-within:ring-cyan-300/35">
            <button
              type="button"
              onClick={startVoice}
              disabled={busy}
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors",
                listening
                  ? "bg-rose-400/20 text-rose-200"
                  : "text-cyan-200 hover:bg-cyan-300/10",
              )}
              aria-label={listening ? "Stop listening" : "Talk to My Agent"}
            >
              {listening ? <MicOff /> : <Mic />}
            </button>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage(draft);
                }
              }}
              rows={1}
              placeholder={listening ? "Listening…" : "Message My Agent…"}
              className="max-h-36 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
            <button
              type="submit"
              disabled={!draft.trim() || busy}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-300 text-[#031326] hover:brightness-110 disabled:opacity-35"
              aria-label="Send message"
            >
              <ArrowUp />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-slate-500">
            <span>Text and voice share this thread · suggestions only</span>
            {latestAnswer && (
              <button
                type="button"
                className="font-semibold text-cyan-300 hover:text-cyan-200"
                onClick={() =>
                  void navigate({
                    to: "/create",
                    search: { brief: latestAnswer.slice(0, 3000), briefWorkspace: workspaceId! },
                  })
                }
              >
                Turn latest answer into a draft
              </button>
            )}
          </div>
        </form>
      </footer>
    </div>
  );
}
