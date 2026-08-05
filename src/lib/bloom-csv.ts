export interface BloomLeadRow {
  businessName: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  industry: string | null;
  leadSource: string;
  interestedServices: string[];
  estimatedValueCents: number | null;
  notes: string | null;
}

function parseCsvMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function pick(record: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const value = record[normalizeHeader(alias)]?.trim();
    if (value) return value;
  }
  return "";
}

function moneyToCents(value: string): number | null {
  if (!value) return null;
  const number = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
}

export function parseBloomLeadsCsv(text: string): BloomLeadRow[] {
  const matrix = parseCsvMatrix(text);
  if (matrix.length < 2) throw new Error("The CSV does not contain any lead rows.");

  const headers = matrix[0].map(normalizeHeader);
  const leads: BloomLeadRow[] = [];

  for (const values of matrix.slice(1)) {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (header) record[header] = values[index] ?? "";
    });
    if (!Object.values(record).some((value) => value.trim())) continue;

    const fullName = pick(record, ["contact name", "client name", "full name", "name"]);
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName =
      pick(record, ["first name", "contact first name", "client first name", "firstname"]) ||
      nameParts.shift() ||
      "Contact";
    const lastName =
      pick(record, ["last name", "contact last name", "client last name", "lastname"]) ||
      nameParts.join(" ");
    const email = pick(record, ["email", "email address", "client email", "contact email"]);
    const business = pick(record, [
      "business",
      "business name",
      "company",
      "company name",
      "organization",
      "lead name",
      "project name",
    ]);
    const fallbackName = [firstName, lastName].filter(Boolean).join(" ").trim();
    const businessName = (business || fallbackName || email.split("@")[0] || "Bloom lead").slice(
      0,
      160,
    );
    if (businessName.length < 2) continue;

    const services = pick(record, [
      "interested services",
      "services",
      "service",
      "project type",
      "package",
    ]);
    const source = pick(record, ["lead source", "source", "referral source"]);

    leads.push({
      businessName,
      firstName: firstName.slice(0, 80),
      lastName: lastName ? lastName.slice(0, 120) : null,
      email: email ? email.toLowerCase() : null,
      phone: pick(record, ["phone", "phone number", "mobile", "contact phone"]) || null,
      website: pick(record, ["website", "website url", "company website"]) || null,
      city: pick(record, ["city"]) || null,
      state: pick(record, ["state", "province", "region"]) || null,
      industry: pick(record, ["industry", "business type"]) || null,
      leadSource: source ? `Bloom — ${source}` : "Bloom CSV",
      interestedServices: services
        .split(/[;,|]/)
        .map((service) => service.trim())
        .filter(Boolean),
      estimatedValueCents: moneyToCents(
        pick(record, ["estimated value", "project value", "value", "budget", "price"]),
      ),
      notes:
        pick(record, ["notes", "note", "project notes", "client notes", "description"]) || null,
    });
  }

  if (!leads.length) {
    throw new Error("No usable Bloom leads were found. Check that the CSV has a header row.");
  }
  return leads;
}
