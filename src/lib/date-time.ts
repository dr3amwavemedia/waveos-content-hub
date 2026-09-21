export function formatInTimeZone(
  iso: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {},
) {
  return new Intl.DateTimeFormat(undefined, { timeZone, ...options }).format(new Date(iso));
}

export function dateKeyInTimeZone(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// Postgres `date` columns are calendar dates, not UTC instants. Parsing a
// YYYY-MM-DD value with `new Date(value)` shifts it to the previous day in
// timezones west of UTC, so construct date-only values in local calendar time.
export function projectDateToLocalDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    const [, year, month, day] = match.map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

export function formatProjectDate(value: string | null | undefined) {
  if (!value) return null;
  const date = projectDateToLocalDate(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function isoToDateTimeLocal(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

// Convert a wall-clock value from <input type="datetime-local"> in a named
// IANA timezone into the UTC instant stored by Postgres.
export function zonedDateTimeToIso(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Choose a valid publish date and time");
  const [, year, month, day, hour, minute] = match.map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = desiredUtc;

  for (let iteration = 0; iteration < 3; iteration++) {
    const rendered = isoToDateTimeLocal(new Date(candidate).toISOString(), timeZone);
    const renderedMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(rendered);
    if (!renderedMatch) break;
    const [, ry, rm, rd, rh, rmin] = renderedMatch.map(Number);
    const renderedUtc = Date.UTC(ry, rm - 1, rd, rh, rmin);
    const correction = desiredUtc - renderedUtc;
    candidate += correction;
    if (correction === 0) break;
  }

  return new Date(candidate).toISOString();
}

/** Add one calendar month while preserving local wall-clock time and clamping month-end dates. */
export function nextMonthlyChargeAt(iso: string, timeZone: string) {
  const local = isoToDateTimeLocal(iso, timeZone);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) throw new Error("invalid_autopay_charge_at");
  const [, year, month, day, hour, minute] = match.map(Number);
  const nextMonthStart = new Date(Date.UTC(year, month, 1));
  const nextYear = nextMonthStart.getUTCFullYear();
  const nextMonth = nextMonthStart.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  const nextLocal = `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(
    Math.min(day, lastDay),
  ).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return zonedDateTimeToIso(nextLocal, timeZone);
}
