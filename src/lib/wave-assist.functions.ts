import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MODEL = "google/gemini-2.5-flash";

/**
 * Wave Assistant — caption / hashtag / tone / translate suggestions via Lovable AI Gateway.
 * Always suggestion-only; never auto-publishes.
 */
export const waveAssist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    mode: "caption" | "hashtags" | "tone" | "translate";
    input: string;
    platform?: string;
    targetLanguage?: string;
    toneHint?: string;
  }) => d)
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI gateway not configured");

    const prompts: Record<string, string> = {
      caption: `You are Wave Assistant. Rewrite the following into a concise, high-performing ${data.platform ?? "social"} caption. Keep the brand voice. Return only the caption.`,
      hashtags: `You are Wave Assistant. Suggest 8-12 relevant, non-spammy hashtags for the following post${data.platform ? " on " + data.platform : ""}. Return space-separated hashtags only.`,
      tone: `You are Wave Assistant. Rewrite the following in a ${data.toneHint ?? "friendly, professional"} tone. Return only the rewritten text.`,
      translate: `You are Wave Assistant. Translate the following to ${data.targetLanguage ?? "Spanish"}. Return only the translation.`,
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: prompts[data.mode] },
          { role: "user", content: data.input },
        ],
      }),
    });

    if (res.status === 429) throw new Error("Rate limit reached. Try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please top up in Settings.");
    if (!res.ok) throw new Error(`AI request failed: ${res.status}`);

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const out = json.choices?.[0]?.message?.content ?? "";
    return { suggestion: out.trim() };
  });
