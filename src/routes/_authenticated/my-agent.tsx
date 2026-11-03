import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUp,
  Loader2,
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
import { cn } from "@/lib/utils";

type AgentMessage = { role: "user" | "assistant"; content: string };

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

function MyAgentPage() {
  const { activeWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const assist = useServerFn(waveAssist);
  const workspaceId = activeWorkspace?.id ?? null;
  const storageKey = workspaceId ? `waveos.assist.${workspaceId}` : null;
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(false);
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

  async function sendMessage(raw: string, speakReply = false) {
    const input = raw.trim();
    if (!input || !workspaceId || busy) return;
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
    <div className="ocean-page mx-auto flex min-h-[calc(100vh-10rem)] max-w-5xl flex-col overflow-hidden rounded-3xl border border-cyan-300/15 bg-[linear-gradient(145deg,rgba(4,24,45,.98),rgba(15,20,52,.96))] text-slate-50 shadow-2xl">
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
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {["What should I focus on next?", "Plan my next content week", "Help me improve performance"].map(
                (prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendMessage(prompt)}
                    className="rounded-full border border-cyan-200/15 bg-cyan-200/[.06] px-3 py-2 text-xs text-cyan-50 hover:bg-cyan-200/10"
                  >
                    {prompt}
                  </button>
                ),
              )}
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
                <p className="whitespace-pre-wrap">{message.content}</p>
              </article>
            ))}
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

      <footer className="border-t border-cyan-300/15 bg-[#04172b]/92 p-3 sm:p-4">
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
