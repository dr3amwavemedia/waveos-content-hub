export type CsvTable = { headers: string[]; rows: string[][] };

/** Parse a bounded RFC 4180 style CSV, including quoted commas and newlines. */
export function parseBloomCsv(input: string): CsvTable {
  if (input.length > 5_000_000) throw new Error("CSV exceeds the 5 MB limit.");
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (quoted) quoted = false;
      else if (cell === "") quoted = true;
      else throw new Error(`Invalid quote near character ${i + 1}.`);
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      if (rows.length > 2001) throw new Error("CSV exceeds the 2,000 row limit.");
    } else cell += char;
  }
  if (quoted) throw new Error("CSV has an unclosed quote.");
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  const [headers = [], ...data] = rows;
  if (!headers.length || !data.length) throw new Error("CSV needs a header and at least one row.");
  if (headers.length > 60 || headers.some((h) => !h.trim()))
    throw new Error("CSV headers are missing or too wide.");
  if (data.some((values) => values.length !== headers.length))
    throw new Error("CSV row width does not match the header.");
  return { headers: headers.map((h) => h.trim()), rows: data };
}

export function dollarsToCents(raw: string): number {
  const cleaned = raw.trim().replace(/^\$/, "").replace(/,/g, "");
  const match = cleaned.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error(`Invalid amount: ${raw}`);
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error(`Invalid amount: ${raw}`);
  return cents;
}
