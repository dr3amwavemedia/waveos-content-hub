import type { Page, Route } from "@playwright/test";

/**
 * Intercepts browser-side PostgREST calls (…/rest/v1/**) and answers them
 * from per-table fixtures so e2e specs can drive deterministic UI states
 * (published projects, missing columns, roles) without seeding the live DB.
 *
 * Auth calls (…/auth/v1/**) are NOT intercepted — they use the real injected
 * session restored by helpers/auth.ts.
 */

type TableSource = Record<string, unknown>[] | (() => Record<string, unknown>[]);

export interface RestMockOptions {
  /** Per-table rows. Missing tables answer with an empty array. */
  tables?: Record<string, TableSource>;
  /** Per-function RPC handlers; receives the parsed POST body, returns the JSON result. */
  rpc?: Record<string, (body: Record<string, unknown> | null) => unknown>;
  /** Per-table error responses, e.g. a PGRST204 "column missing" body. */
  errors?: Record<string, { status: number; body: unknown }>;
  /** Observes every table/RPC name the app requests (for probe assertions). */
  onRequest?: (name: string) => void;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS",
};

function fulfillJson(route: Route, status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { ...CORS, ...extraHeaders },
    body: JSON.stringify(body),
  });
}

export async function mockSupabaseRest(page: Page, options: RestMockOptions) {
  await page.route("**/rest/v1/**", async (route) => {
    const request = route.request();

    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: CORS });
    }

    const parts = new URL(request.url()).pathname.split("/").filter(Boolean);
    // [rest, v1, <table>] or [rest, v1, rpc, <fn>]
    const isRpc = parts[2] === "rpc";
    const name = isRpc ? parts[3] : parts[2];
    options.onRequest?.(name);

    if (isRpc) {
      let body: Record<string, unknown> | null = null;
      try {
        body = request.postDataJSON() as Record<string, unknown>;
      } catch {
        /* no JSON body */
      }
      const handler = options.rpc?.[name ?? ""];
      return fulfillJson(route, 200, handler ? await handler(body) : null);
    }

    const error = options.errors?.[name ?? ""];
    if (error) return fulfillJson(route, error.status, error.body);

    const source = options.tables?.[name ?? ""];
    const rows = typeof source === "function" ? source() : (source ?? []);

    // supabase-js count-only queries use HEAD.
    if (request.method() === "HEAD") {
      return route.fulfill({
        status: 200,
        headers: { ...CORS, "content-range": `0-0/${rows.length}` },
      });
    }

    // .maybeSingle()/.single() ask for a single object via the Accept header.
    const accept = request.headers()["accept"] ?? "";
    if (accept.includes("vnd.pgrst.object")) {
      if (!rows.length) {
        // PostgREST's 0-rows answer for singular requests; maybeSingle maps it to null.
        return fulfillJson(route, 406, {
          code: "PGRST116",
          message: "The result contains 0 rows",
        });
      }
      return fulfillJson(route, 200, rows[0]);
    }

    return fulfillJson(route, 200, rows, {
      "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}`,
    });
  });
}
