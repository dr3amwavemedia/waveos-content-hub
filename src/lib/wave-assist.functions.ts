import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Caption generation is a high-volume, lightweight text task. Keep this on a
// current low-cost Gateway model rather than the deprecated Gemini 2.5 line.
const MODEL = "google/gemini-3.1-flash-lite";

type AssistMode = "caption" | "caption_suite" | "comment_reply" | "hashtags" | "tone" | "translate";

const platformName = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9_-]+$/i);
const assistInput = z
  .object({
    mode: z.enum(["caption", "caption_suite", "comment_reply", "hashtags", "tone", "translate"]),
    input: z.string().trim().min(1).max(6_000),
    workspaceId: z.string().uuid(),
    platform: platformName.optional(),
    platforms: z.array(platformName).max(12).default([]),
    targetLanguage: z.string().trim().min(1).max(80).optional(),
    toneHint: z.string().trim().min(1).max(160).optional(),
  })
  .superRefine((data, context) => {
    if (new Set(data.platforms).size !== data.platforms.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["platforms"],
        message: "Platforms must be unique.",
      });
    }
    if (data.mode === "caption_suite" && data.platforms.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["platforms"],
        message: "Caption suites require at least one platform.",
      });
    }
  });

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
  .validator((input) => assistInput.parse(input))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI gateway not configured");

    let brandContext =
      "No saved Brand Voice profile was found. Keep the writing clear and natural.";
    const [{ data: member }, { data: manageable }, { data: entitled }] = await Promise.all([
      context.supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", data.workspaceId)
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase.rpc(
        "can_staff_manage_workspace" as never,
        { _user_id: context.userId, _workspace_id: data.workspaceId } as never,
      ),
      context.supabase.rpc("has_feature", {
        _workspace_id: data.workspaceId,
        _feature: "can_use_ai_tools",
      }),
    ]);
    const staff = (manageable as unknown as boolean | null) === true;
    if (!member && !staff) throw new Error("forbidden");
    if (!staff && !entitled) throw new Error("AI Assist is available on Current and Tidal plans.");
    const { data: profile } = await context.supabase
      .from("brand_profiles")
      .select(
        "business_name,target_audience,brand_summary,tone_traits,preferred_phrases,words_to_avoid,default_ctas,default_hashtags,emoji_preference,preferred_caption_length,primary_language,secondary_language",
      )
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (profile) brandContext = JSON.stringify(profile);

    const prompts: Record<string, string> = {
      caption: `You are Wave Assistant. Rewrite the following into a concise, high-performing ${data.platform ?? "social"} caption. Keep the brand voice. Return only the caption.`,
      caption_suite: `You are Wave Assistant. Create one primary social caption and a distinct adaptation for every requested platform. Preserve the same facts and campaign message, but adjust tone, length, formatting, hashtags and call to action for each platform. Follow each platform's hard character limit. Never invent an offer, price, testimonial or factual claim. Return valid JSON only in this exact shape: {"primaryCaption":"...","variants":[{"platform":"instagram","caption":"..."}]}. Include every requested platform exactly once.`,
      comment_reply: `You are Wave Assistant. Draft one helpful public reply to the supplied social comment in the saved Brand Voice. Be warm and specific, do not promise refunds or outcomes, do not request private or payment information, and move sensitive issues to a private support channel. Return only the suggested reply. A person will review it before posting.`,
      hashtags: `You are Wave Assistant. Suggest 8-12 relevant, non-spammy hashtags for the following post${data.platform ? " on " + data.platform : ""}. Return space-separated hashtags only.`,
      tone: `You are Wave Assistant. Rewrite the following in a ${data.toneHint ?? "friendly, professional"} tone. Return only the rewritten text.`,
      translate: `You are Wave Assistant. Translate the following to ${data.targetLanguage ?? "Spanish"}. Return only the translation.`,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let res: Response;
    try {
      res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1_500,
          messages: [
            {
              role: "system",
              content: `${prompts[data.mode]}\n\nSaved Brand Voice:\n${brandContext}`,
            },
            {
              role: "user",
              content:
                data.mode === "caption_suite"
                  ? `Platforms: ${data.platforms.join(", ")}\nPost brief or base message: ${data.input}`
                  : data.input,
            },
          ],
        }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("AI request timed out. Please try again.");
      }
      throw new Error("AI request could not be completed.");
    } finally {
      clearTimeout(timeout);
    }

    if (res.status === 429) throw new Error("Rate limit reached. Try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please top up in Settings.");
    if (!res.ok) throw new Error(`AI request failed: ${res.status}`);

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const out = (json.choices?.[0]?.message?.content ?? "").trim();
    if (!out || out.length > 20_000) {
      throw new Error("The caption assistant returned an invalid draft. Please try again.");
    }
    if (data.mode === "caption_suite") {
      const parsed = JSON.parse(cleanJson(out)) as {
        primaryCaption?: string;
        variants?: Array<{ platform?: string; caption?: string }>;
      };
      const requested = new Set(data.platforms);
      const variants = (parsed.variants ?? [])
        .filter((variant) => variant.platform && variant.caption && requested.has(variant.platform))
        .map((variant) => ({ platform: variant.platform!, caption: variant.caption!.trim() }))
        .filter((variant) => variant.caption.length <= 6_000);
      if (
        !parsed.primaryCaption?.trim() ||
        parsed.primaryCaption.trim().length > 6_000 ||
        variants.length !== requested.size ||
        new Set(variants.map((variant) => variant.platform)).size !== requested.size
      ) {
        throw new Error("The caption assistant returned an incomplete draft. Please try again.");
      }
      return {
        suggestion: parsed.primaryCaption.trim(),
        primaryCaption: parsed.primaryCaption.trim(),
        variants,
      };
    }
    return { suggestion: out, primaryCaption: null, variants: [] };
  });
