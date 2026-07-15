const AYRSHARE_BASE = "https://api.ayrshare.com/api";

type AyrshareInit = Omit<RequestInit, "body"> & { profileKey?: string; body?: unknown };

export function envReady() {
  return {
    apiKey: process.env.AYRSHARE_API_KEY ?? "",
    domain: process.env.AYRSHARE_DOMAIN ?? "",
    appBaseUrl: process.env.APP_BASE_URL ?? "",
    ready: Boolean(process.env.AYRSHARE_API_KEY),
  };
}

export async function ayrshare(path: string, init: AyrshareInit = {}) {
  const { apiKey } = envReady();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  if (init.profileKey) headers.set("Profile-Key", init.profileKey);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(`${AYRSHARE_BASE}${path}`, {
    ...init,
    headers,
    body: init.body ? (typeof init.body === "string" ? init.body : JSON.stringify(init.body)) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* text response */ }
  if (!res.ok) {
    const message = (json as { message?: string } | null)?.message ?? text ?? `Ayrshare ${res.status}`;
    throw new Error(message);
  }
  return json as Record<string, unknown>;
}

function unwrapSecret(raw: string) {
  let value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim();
  }
  value = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (value.includes("\\n")) value = value.replace(/\\n/g, "\n");
  if (/%0A|%0D|%2B|%2F|%3D/i.test(value)) {
    try { value = decodeURIComponent(value); } catch { /* keep original */ }
  }
  return value.trim();
}

function cleanBase64(raw: string) {
  return raw.replace(/\s+/g, "").trim();
}

function maybeDecodeBase64(raw: string) {
  const compact = cleanBase64(raw);
  if (!/^[A-Za-z0-9+/=]+$/.test(compact) || compact.length < 80) return null;
  try {
    const decoded = Buffer.from(compact, "base64").toString("utf8").trim();
    return decoded.includes("-----BEGIN") ? decoded : null;
  } catch {
    return null;
  }
}

function canonicalPem(raw: string) {
  const key = unwrapSecret(raw);
  const typeMatch = key.match(/-----BEGIN\s+([A-Z ]*PRIVATE KEY)-----/);
  if (!typeMatch) return null;

  const type = typeMatch[1].replace(/\s+/g, " ").trim();
  const begin = `-----BEGIN ${type}-----`;
  const end = `-----END ${type}-----`;
  const start = key.indexOf(typeMatch[0]) + typeMatch[0].length;
  const endIndex = key.indexOf("-----END", start);
  if (endIndex === -1) return null;

  const body = key.slice(start, endIndex).replace(/\s+/g, "").trim();
  if (!body) return null;
  const lines = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `${begin}\n${lines}\n${end}\n`;
}

function pemFromBody(raw: string) {
  const body = cleanBase64(unwrapSecret(raw));
  if (!/^[A-Za-z0-9+/=]+$/.test(body) || body.length < 80) return null;
  const lines = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `-----BEGIN RSA PRIVATE KEY-----\n${lines}\n-----END RSA PRIVATE KEY-----\n`;
}

/**
 * Ayrshare accepts either the exact PEM file contents or the base64-encoded
 * private.key file with `base64: true`. Secrets are often pasted as escaped
 * newlines, one-line PEMs, URL-encoded text, or base64 strings, so normalize
 * those safe representations without exposing the key.
 */
export function buildAyrshareJwtBody(params: {
  domain?: string;
  privateKey?: string;
  privateKeyBase64?: string;
  profileKey: string;
}) {
  const raw = params.privateKey ? unwrapSecret(params.privateKey) : "";
  const explicitBase64 = params.privateKeyBase64 ? cleanBase64(unwrapSecret(params.privateKeyBase64)) : "";

  if (raw) {
    const pem = canonicalPem(raw);
    if (pem) {
      return { domain: params.domain || undefined, privateKey: pem, profileKey: params.profileKey };
    }

    const decodedPem = maybeDecodeBase64(raw);
    if (decodedPem) {
      return { domain: params.domain || undefined, privateKey: cleanBase64(raw), profileKey: params.profileKey, base64: true };
    }

    const bodyPem = pemFromBody(raw);
    if (bodyPem) {
      return { domain: params.domain || undefined, privateKey: bodyPem, profileKey: params.profileKey };
    }
  }

  if (explicitBase64) {
    return { domain: params.domain || undefined, privateKey: explicitBase64, profileKey: params.profileKey, base64: true };
  }

  throw new Error("Ayrshare private key is missing. Re-save the complete private.key file or a base64-encoded private.key value.");
}