import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * Restore a Supabase session into the browser context so that authenticated
 * routes (/, /home, /_authenticated/**) render as a signed-in user.
 *
 * We accept the same env shape the Lovable sandbox injects:
 *   LOVABLE_BROWSER_SUPABASE_STORAGE_KEY  (e.g. sb-<ref>-auth-token)
 *   LOVABLE_BROWSER_SUPABASE_SESSION_JSON (full session JSON blob)
 *   LOVABLE_BROWSER_SUPABASE_COOKIES_JSON (optional, for @supabase/ssr)
 *
 * These MUST NOT be logged or screenshotted.
 */
export async function restoreSupabaseSession(context: BrowserContext, page: Page, origin: string) {
  const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  const cookiesJson = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON;

  if (!storageKey || !sessionJson) return false;

  if (cookiesJson) {
    try {
      const cookies = JSON.parse(cookiesJson).map((c: Record<string, unknown>) => ({
        ...c,
        url: origin,
      }));
      await context.addCookies(cookies);
    } catch {
      /* ignore malformed cookies */
    }
  }

  // Land on the origin first so the localStorage write is scoped correctly.
  await page.goto(origin);
  await page.evaluate(
    ([k, v]) => window.localStorage.setItem(k, v),
    [storageKey, sessionJson] as const,
  );
  return true;
}

export const test = base;
export { expect };
