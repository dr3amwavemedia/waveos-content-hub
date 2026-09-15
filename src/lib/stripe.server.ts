/**
 * Minimal Stripe REST helper. No SDK: the edge runtime bundles fetch only.
 * All calls use the secret key stored in the encrypted secret store.
 */

const STRIPE_API = "https://api.stripe.com/v1";

function stripeKey(): string {
  const key = process.env.WAVEOS_STRIPE_TEST_SECRET_KEY;
  if (!key) throw new Error("stripe_not_configured");
  return key;
}

/** True when the configured key is a test-mode key. */
export function stripeIsTestMode(): boolean {
  return (process.env.WAVEOS_STRIPE_TEST_SECRET_KEY ?? "").startsWith("sk_test_");
}

function encodeForm(value: unknown, prefix = "", out: string[] = []): string[] {
  if (value === undefined || value === null) return out;
  if (Array.isArray(value)) {
    value.forEach((item, index) => encodeForm(item, `${prefix}[${index}]`, out));
    return out;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      encodeForm(item, prefix ? `${prefix}[${key}]` : key, out);
    }
    return out;
  }
  out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
  return out;
}

export async function stripeRequest<T = Record<string, unknown>>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: Record<string, unknown>;
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  const method = options.method ?? "POST";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${stripeKey()}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  const response = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers,
    body: method === "POST" ? encodeForm(options.body ?? {}).join("&") : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const json = (await response.json()) as T & { error?: { message?: string; code?: string } };
  if (!response.ok) {
    // Never surface the key or raw provider payload to the client.
    console.error("[stripe] request failed", path, json?.error?.code ?? response.status);
    throw new Error(json?.error?.message ?? "stripe_request_failed");
  }
  return json;
}

export type StripeCheckoutSession = {
  id: string;
  url: string | null;
  payment_intent: string | null;
  amount_total: number | null;
  currency: string | null;
  payment_status: string | null;
  metadata?: Record<string, string>;
  status?: "open" | "complete" | "expired";
  livemode?: boolean;
};

/** Verify a Stripe webhook signature header (scheme v1, HMAC-SHA256). */
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((piece) => {
      const [k, ...rest] = piece.trim().split("=");
      return [k, rest.join("=")];
    }),
  ) as Record<string, string>;
  const timestamp = parts["t"];
  const provided = parts["v1"];
  if (!timestamp || !provided) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;

  const { createHmac, timingSafeEqual } = await import("crypto");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
