import { expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { restoreSupabaseSession } from "../../helpers/auth";

/**
 * Shared plumbing for the WaveOS smoke suite.
 *
 * The smoke suite is a read-only sanity pass: it signs in with the injected
 * sandbox session, walks the critical surfaces, and asserts each one renders
 * without an error boundary, a blank shell, or a page-level console error.
 *
 * It never creates payments, uploads to live storage, sends email, publishes
 * content, or writes to client records.
 */

/** Text rendered by the app's route/error boundaries. */
const ERROR_BOUNDARY = /something went wrong|unexpected error|application error/i;

export interface SmokeSession {
  /** False when no Supabase session is available — specs skip cleanly. */
  signedIn: boolean;
  /** Console errors captured since the page was created. */
  consoleErrors: string[];
  /** Every PostgREST path+query the page requested. */
  restRequests: string[];
}

/** Console noise that is environmental, not an app defect. */
const IGNORED_CONSOLE = [
  /favicon/i,
  /Download the React DevTools/i,
  /React Router Future Flag/i,
  /\[vite\]/i,
  /net::ERR_ABORTED/i,
  /ResizeObserver loop/i,
];

export async function startSmokeSession(
  context: BrowserContext,
  page: Page,
  baseURL: string,
): Promise<SmokeSession> {
  const consoleErrors: string[] = [];
  const restRequests: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    consoleErrors.push(text);
  });

  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/rest/v1/")) restRequests.push(url);
  });

  const signedIn = await restoreSupabaseSession(context, page, baseURL);
  return { signedIn, consoleErrors, restRequests };
}

export function skipWithoutSession(session: SmokeSession, testInfo: TestInfo) {
  testInfo.skip(
    !session.signedIn,
    "no Supabase session injected — set LOVABLE_BROWSER_SUPABASE_* to run the smoke suite",
  );
}

/**
 * Navigate to a route and assert it came up healthy: the HTTP response was
 * not a server error, no error boundary rendered, and the page produced
 * some real content.
 */
export async function visit(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  if (response) {
    expect(response.status(), `${path} responded ${response.status()}`).toBeLessThan(500);
  }
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  const text = (await page.locator("main, body").first().innerText()).trim();
  expect(text.length, `${path} rendered an empty shell`).toBeGreaterThan(20);
}

/** Assert one of several headings/labels is on screen (routes vary by tier). */
export async function expectAnyVisible(page: Page, patterns: RegExp[], label: string) {
  const results = await Promise.all(
    patterns.map((re) =>
      page
        .getByText(re)
        .first()
        .isVisible()
        .catch(() => false),
    ),
  );
  expect(results.some(Boolean), `${label}: none of ${patterns.join(", ")} were visible`).toBe(true);
}

/** Fail the test if the page logged unexpected console errors. */
export function expectNoConsoleErrors(session: SmokeSession, label: string) {
  expect(session.consoleErrors, `${label} logged console errors`).toEqual([]);
}
