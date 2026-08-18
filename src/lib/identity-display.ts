const HIDDEN_INTERNAL_EMAILS = new Set(["dr3amwavemedia@gmail.com"]);

export function visibleAccountEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  if (!normalized || HIDDEN_INTERNAL_EMAILS.has(normalized)) return null;
  return email!.trim();
}

export function accountDisplayName({
  firstName,
  lastName,
  email,
  fallback,
}: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  fallback: string;
}) {
  return (
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    visibleAccountEmail(email) ||
    fallback
  );
}
