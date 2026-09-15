/**
 * Minimal SignWell REST helper. Test mode by default: no real signature request
 * leaves the system until test_mode is explicitly turned off.
 */

const SIGNWELL_API = "https://www.signwell.com/api/v1";

function signwellKey(): string {
  const key = process.env.SIGNWELL_API_KEY;
  if (!key) throw new Error("signwell_not_configured");
  return key;
}

export function signwellTestMode(): boolean {
  // Flip SIGNWELL_LIVE_MODE to "true" only at production cutover.
  return process.env.SIGNWELL_LIVE_MODE !== "true";
}

async function signwellRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${SIGNWELL_API}${path}`, {
    method: "POST",
    headers: { "X-Api-Key": signwellKey(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as T & {
    errors?: unknown;
    message?: string;
  };
  if (!response.ok) {
    console.error("[signwell] request failed", path, response.status);
    throw new Error(typeof json?.message === "string" ? json.message : "signwell_request_failed");
  }
  return json;
}

export type SignwellDocument = {
  id: string;
  status?: string;
  embedded_signing_url?: string | null;
  recipients?: Array<{ id: string; email?: string; embedded_signing_url?: string | null }>;
};

/** Create a signature request from raw HTML contract contents. */
export async function createSignwellDocument(input: {
  name: string;
  html: string;
  signerName: string;
  signerEmail: string;
  returnUrl: string;
  declineUrl: string;
  metadata?: Record<string, string>;
}): Promise<SignwellDocument> {
  return signwellRequest<SignwellDocument>("/documents", {
    test_mode: signwellTestMode(),
    name: input.name,
    subject: input.name,
    draft: false,
    embedded_signing: true,
    text_tags: true,
    redirect_url: input.returnUrl,
    decline_redirect_url: input.declineUrl,
    // No client emails during the test phase.
    reminders: false,
    apply_signing_order: false,
    files: [
      {
        name: `${input.name}.html`,
        file_base64: Buffer.from(input.html, "utf8").toString("base64"),
      },
    ],
    recipients: [{ id: "1", name: input.signerName, email: input.signerEmail, send_email: false }],
    metadata: input.metadata ?? {},
  });
}
