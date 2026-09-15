export const CONTRACT_FIELDS = [
  { key: "client_name", label: "Client name" },
  { key: "business_name", label: "Business name" },
  { key: "services", label: "Services / purchased items" },
  { key: "project_date", label: "Project date" },
  { key: "today_date", label: "Today's date" },
  { key: "location", label: "Location" },
  { key: "project_name", label: "Project name" },
] as const;

export type ContractField = (typeof CONTRACT_FIELDS)[number]["key"];
export type ContractValues = Record<ContractField, string>;

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
const allowed = new Set<string>(CONTRACT_FIELDS.map(({ key }) => key));

export function contractTokens(text: string): string[] {
  return [...new Set([...text.matchAll(TOKEN)].map((match) => match[1].trim()))];
}

export function renderContract(text: string, values: ContractValues) {
  const unknown = contractTokens(text).filter((token) => !allowed.has(token));
  const missing = contractTokens(text).filter(
    (token) => allowed.has(token) && !values[token as ContractField].trim(),
  );
  const content = text.replace(TOKEN, (match, rawToken: string) => {
    const token = rawToken.trim();
    if (!allowed.has(token)) return match;
    const value = values[token as ContractField].trim();
    if (!value) return match;
    if ((token === "project_date" || token === "today_date") && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
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
  for (const { key } of CONTRACT_FIELDS) {
    if (typeof raw[key] === "string") result[key] = raw[key];
  }
  return result;
}
