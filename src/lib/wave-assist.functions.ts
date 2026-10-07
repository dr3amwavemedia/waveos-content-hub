import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Caption generation is a high-volume, lightweight text task. Keep this on a
// current low-cost Gateway model rather than the deprecated Gemini 2.5 line.
const MODEL = "google/gemini-3.1-flash-lite";

type AssistMode = "caption" | "caption_suite" | "comment_reply" | "hashtags" | "tone" | "translate";

function cleanJson(raw: string) {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}

/**
 * Wave Assistant — caption / hashtag / tone / translate suggestions via Lovable AI Gateway.
 * Always suggestion-only; never auto-publishes.
 */
export const waveAssist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      mode: AssistMode;
      input: string;
      workspaceId?: string;
      platform?: string;
      platforms?: string[];
      targetLanguage?: string;
      toneHint?: string;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI gateway not configured");

    let brandContext =
      "No saved Brand Voice profile was found. Keep the writing clear and natural.";
    if (data.workspaceId) {
      const [{ data: member }, { data: roles }, { data: entitled }] = await Promise.all([
        context.supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("workspace_id", data.workspaceId)
          .eq("user_id", context.userId)
          .maybeSingle(),
        context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
        context.supabase.rpc("has_feature", {
          _workspace_id: data.workspaceId,
          _feature: "can_use_ai_tools",
        }),
      ]);
      const staff = (roles ?? []).some((row) =>
        ["dream_wave_owner", "dream_wave_team"].includes(row.role),
      );
      if (!member && !staff) throw new Error("forbidden");
      if (!staff && !entitled)
        throw new Error("AI Assist is available on Current and Tidal plans.");
      const { data: profile } = await context.supabase
        .from("brand_profiles")
        .select(
          "business_name,target_audience,brand_summary,tone_traits,preferred_phrases,words_to_avoid,default_ctas,default_hashtags,emoji_preference,preferred_caption_length,primary_language,secondary_language",
        )
        .eq("workspace_id", data.workspaceId)
        .maybeSingle();
      if (profile) brandContext = JSON.stringify(profile);
    }

    const prompts: Record<string, string> = {
      caption: `You are Wave Assistant. Rewrite the following into a concise, high-performing ${data.platform ?? "social"} caption. Keep the brand voice. Return only the caption.`,
      caption_suite: `You are Wave Assistant. Create one primary social caption and a distinct adaptation for every requested platform. Preserve the same facts and campaign message, but adjust tone, length, formatting, hashtags and call to action for each platform. Follow each platform's hard character limit. Never invent an offer, price, testimonial or factual claim. Return valid JSON only in this exact shape: {"primaryCaption":"...","variants":[{"platform":"instagram","caption":"..."}]}. Include every requested platform exactly once.`,
      comment_reply: `You are Wave Assistant. Draft one helpful public reply to the supplied social comment in the saved Brand Voice. Be warm and specific, do not promise refunds or outcomes, do not request private or payment information, and move sensitive issues to a private support channel. Return only the suggested reply. A person will review it before posting.`,
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
          {
            role: "system",
            content: `${prompts[data.mode]}\n\nSaved Brand Voice:\n${brandContext}`,
          },
          {
            role: "user",
            content:
              data.mode === "caption_suite"
                ? `Platforms: ${(data.platforms ?? []).join(", ")}\nPost brief or base message: ${data.input}`
                : data.input,
          },
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
    if (data.mode === "caption_suite") {
      const parsed = JSON.parse(cleanJson(out)) as {
        primaryCaption?: string;
        variants?: Array<{ platform?: string; caption?: string }>;
      };
      const requested = new Set(data.platforms ?? []);
      const variants = (parsed.variants ?? [])
        .filter((variant) => variant.platform && variant.caption && requested.has(variant.platform))
        .map((variant) => ({ platform: variant.platform!, caption: variant.caption!.trim() }));
      if (!parsed.primaryCaption?.trim() || variants.length !== requested.size) {
        throw new Error("The caption assistant returned an incomplete draft. Please try again.");
      }
      return {
        suggestion: parsed.primaryCaption.trim(),
        primaryCaption: parsed.primaryCaption.trim(),
        variants,
      };
    }
    return { suggestion: out.trim(), primaryCaption: null, variants: [] };
  });
