export const CONTRACT_FIELDS = [
  { key: "client_name", label: "Client name" },
  { key: "business_name", label: "Business name" },
  { key: "services", label: "Services / purchased items" },
  { key: "project_date", label: "Project date" },
  { key: "today_date", label: "Today's date" },
  { key: "location", label: "Location" },
  { key: "project_name", label: "Project name" },
] as const;

export type ContractField = string;
export type ContractValues = Record<string, string>;

export type ContractFieldDefinition = {
  key: string;
  label: string;
  input: "text" | "date" | "textarea";
};

export const emptyContractValues = (): ContractValues => ({
  client_name: "",
  business_name: "",
  services: "",
  project_date: "",
  today_date: "",
  location: "",
  project_name: "",
});

export const CONTRACT_STARTER = `MEDIA SERVICES AGREEMENT

Date: {{today_date}}
Client: {{client_name}}
Business: {{business_name}}
Project: {{project_name}}
Project date: {{project_date}}
Location: {{location}}

SERVICES AND PURCHASED ITEMS
{{services}}

PAYMENT TERMS
[Enter the agreed price, due dates, deposit and accepted payment method.]

SCHEDULE AND DELIVERY
[Enter production dates, deliverables, delivery method and timing.]

REVISIONS AND CHANGES
[Enter revision allowances and how changes are approved and priced.]

CANCELLATION AND RESCHEDULING
[Enter notice periods and any applicable fees.]

USAGE RIGHTS AND RELEASES
[Enter ownership, permitted uses, and any required permissions.]

SIGNATURES
[Confirm the signing process before sending.]`;

const TOKEN = /{{\s*([^{}]+?)\s*}}/g;
const SAFE_TOKEN = /^[a-z][a-z0-9_]*$/;
const DREAM_WAVE_TOKEN = /^dwm_[a-z0-9_]+$/;
const longTextTokens =
  /(?:services|scope|strategy|deliverables|description|notes|terms|schedule|timeline|rights|revisions)$/;
const labels = new Map<string, string>(CONTRACT_FIELDS.map(({ key, label }) => [key, label]));

export function contractTokens(text: string): string[] {
  return [...new Set([...text.matchAll(TOKEN)].map((match) => match[1].trim()))];
}

export function contractFieldLabel(token: string): string {
  const known = labels.get(token);
  if (known) return known;
  return token
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function contractFieldsForTemplate(text: string): ContractFieldDefinition[] {
  return contractTokens(text)
    .filter((token) => SAFE_TOKEN.test(token) && !DREAM_WAVE_TOKEN.test(token))
    .map((key) => ({
      key,
      label: contractFieldLabel(key),
      input: /(^|_)date$/.test(key) ? "date" : longTextTokens.test(key) ? "textarea" : "text",
    }));
}

export function renderContract(text: string, values: ContractValues) {
  const unknown = contractTokens(text).filter(
    (token) =>
      !SAFE_TOKEN.test(token) ||
      (DREAM_WAVE_TOKEN.test(token) && !(values[token] ?? "").trim()),
  );
  const missing = contractTokens(text).filter(
    (token) =>
      SAFE_TOKEN.test(token) &&
      !DREAM_WAVE_TOKEN.test(token) &&
      !(values[token] ?? "").trim(),
  );
  const content = text.replace(TOKEN, (match, rawToken: string) => {
    const token = rawToken.trim();
    if (!SAFE_TOKEN.test(token)) return match;
    const value = (values[token] ?? "").trim();
    if (!value) return match;
    if (/(^|_)date$/.test(token) && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const date = new Date(`${value}T12:00:00`);
      if (!Number.isNaN(date.getTime()))
        return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    }
    return value;
  });
  return { content, unknown, missing };
}

export function contractGuidancePrompts(text: string): string[] {
  return [...text.matchAll(/\[(?:Enter|Confirm)\s+[^\]]+\]/g)].map((match) => match[0]);
}

export function todayLocalDate(): string {
  const date = new Date();
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function contractValuesFromJson(value: unknown): ContractValues {
  const result = emptyContractValues();
  if (!value || typeof value !== "object") return result;
  const raw = value as Record<string, unknown>;
  for (const [key, fieldValue] of Object.entries(raw)) {
    if (SAFE_TOKEN.test(key) && typeof fieldValue === "string") result[key] = fieldValue;
  }
  return result;
}
