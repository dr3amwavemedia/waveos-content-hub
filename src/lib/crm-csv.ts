export interface CrmCsvRow {
  businessName: string;
  stage: string;
  priority: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  industry?: string | null;
  interestedServices?: string[] | null;
  leadSource?: string | null;
  referralName?: string | null;
  estimatedValueCents?: number | null;
  preferredContactMethod?: string | null;
  lastContactedAt?: string | null;
  nextFollowUpAt?: string | null;
  city?: string | null;
  state?: string | null;
  website?: string | null;
  linkedWorkspace?: string | null;
  createdAt: string;
  updatedAt: string;
}

const HEADERS = [
  "Business",
  "Stage",
  "Priority",
  "Primary contact",
  "Email",
  "Phone",
  "Industry",
  "Interested services",
  "Lead source",
  "Referral",
  "Estimated value",
  "Preferred contact",
  "Last contacted",
  "Next follow-up",
  "City",
  "State",
  "Website",
  "Linked workspace",
  "Created",
  "Updated",
] as const;

// Prefix spreadsheet formula characters before quoting. This prevents values
// such as =HYPERLINK(...) from executing when a CSV is opened in a spreadsheet.
export function escapeCsvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function displayDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-US");
}

function displayMoney(cents?: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function buildCrmCsv(rows: CrmCsvRow[]): string {
  const lines = rows.map((row) =>
    [
      row.businessName,
      row.stage,
      row.priority,
      row.contactName,
      row.email,
      row.phone,
      row.industry,
      row.interestedServices?.join("; "),
      row.leadSource,
      row.referralName,
      displayMoney(row.estimatedValueCents),
      row.preferredContactMethod,
      displayDate(row.lastContactedAt),
      displayDate(row.nextFollowUpAt),
      row.city,
      row.state,
      row.website,
      row.linkedWorkspace,
      displayDate(row.createdAt),
      displayDate(row.updatedAt),
    ]
      .map(escapeCsvCell)
      .join(","),
  );
  return `\uFEFF${HEADERS.map(escapeCsvCell).join(",")}\r\n${lines.join("\r\n")}\r\n`;
}

export function downloadCsv(filename: string, rows: CrmCsvRow[]): void {
  const blob = new Blob([buildCrmCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function safeCsvFilename(name: string): string {
  const safe = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return safe || "wavecrm-export";
}
