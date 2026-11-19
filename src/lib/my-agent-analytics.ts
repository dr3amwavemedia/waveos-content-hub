export type AgentAnalyticsObservation = {
  metric_key: string;
  value: number | string;
  unit?: string | null;
  range_start: string;
  range_end: string;
  availability?: string | null;
  provider?: string | null;
  source_reference?: string | null;
  calculation_version?: string | null;
  captured_at?: string | null;
  evidence?: unknown;
};

function evidenceMode(evidence: unknown) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return null;
  const mode = (evidence as Record<string, unknown>).mode;
  return typeof mode === "string" ? mode : null;
}

function isUsable(row: AgentAnalyticsObservation) {
  return (
    typeof row.metric_key === "string" &&
    Boolean(row.metric_key) &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.range_start) &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.range_end) &&
    Number.isFinite(Number(row.value))
  );
}

/**
 * Keep one trustworthy value per metric and period for My Agent.
 * Analytics stores combined, organic, and paid observations for the same
 * period. Showing all three as peer values duplicates metrics and lets the
 * assistant quote a partial source instead of the combined workspace total.
 */
export function selectAgentAnalyticsObservations(
  rows: AgentAnalyticsObservation[],
  limit = 60,
) {
  const windows = new Map<string, AgentAnalyticsObservation[]>();
  const sorted = rows
    .filter(isUsable)
    .sort(
      (a, b) =>
        b.range_end.localeCompare(a.range_end) ||
        b.range_start.localeCompare(a.range_start) ||
        String(b.captured_at ?? "").localeCompare(String(a.captured_at ?? "")),
    );

  for (const row of sorted) {
    const key = `${row.range_start}|${row.range_end}`;
    const windowRows = windows.get(key) ?? [];
    windowRows.push(row);
    windows.set(key, windowRows);
  }

  const selected: AgentAnalyticsObservation[] = [];
  for (const windowRows of windows.values()) {
    const combined = windowRows.filter((row) => evidenceMode(row.evidence) === "combined");
    const legacy = windowRows.filter((row) => evidenceMode(row.evidence) === null);
    const preferred = combined.length ? combined : legacy.length ? legacy : windowRows;
    const seenMetrics = new Set<string>();

    for (const row of preferred) {
      if (seenMetrics.has(row.metric_key)) continue;
      seenMetrics.add(row.metric_key);
      selected.push(row);
      if (selected.length >= limit) return selected;
    }
  }

  return selected;
}

