// Client-side URL validation. Server enforces the same rule via CHECK
// constraints on client_invoices.hosted_url and client_deliveries.url.
export function isValidHttpsUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (!/^https:\/\/[^\s]+$/i.test(trimmed)) return false;
  try {
    const u = new URL(trimmed);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

export const URL_VALIDATION_MESSAGE =
  "Enter a full https:// link (Frame.io, Pixieset, Google Drive, Dropbox, Vimeo, YouTube, etc.).";
