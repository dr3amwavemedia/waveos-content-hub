export type HistoryObservation = {
  metric_key: string; provider: string; availability: string; value: number | null;
  range_start: string | null; range_end: string | null; captured_at: string;
  source_reference: string | null; calculation_version: string | null;
  unit?: string | null;
  evidence?: { coverage?: string; mode?: string } | null;
};
const day = (value: string | null) => value ? Date.parse(value.slice(0,10) + "T00:00:00Z") : NaN;
export function historySeries(rows: HistoryObservation[], metric: string) {
  const unique = new Map<string, HistoryObservation>();
  for (const row of [...rows].sort((a,b)=>b.captured_at.localeCompare(a.captured_at))) {
    if (row.metric_key !== metric || row.value === null || !Number.isFinite(row.value) || !["available","true_zero"].includes(row.availability) || !row.source_reference || !row.calculation_version || !row.unit || !row.evidence?.coverage || !row.evidence.mode || !Number.isFinite(day(row.range_start)) || !Number.isFinite(day(row.range_end)) || day(row.range_end) < day(row.range_start)) continue;
    const key = [row.provider,row.calculation_version,row.unit,row.evidence.coverage,row.evidence.mode,row.range_start,row.range_end].join(":");
    if (!unique.has(key)) unique.set(key,row);
  }
  const observations = [...unique.values()].sort((a,b)=>day(a.range_end)-day(b.range_end));
  const latest = observations.at(-1);
  if (!latest) return [];
  return observations.filter(row=>row.provider===latest.provider && row.calculation_version===latest.calculation_version && row.unit===latest.unit && row.evidence?.coverage===latest.evidence?.coverage && row.evidence?.mode===latest.evidence?.mode && day(row.range_end)-day(row.range_start)===day(latest.range_end)-day(latest.range_start));
}
export function comparePeriods(rows: HistoryObservation[], metric: string) {
  const series = historySeries(rows,metric), current = series.at(-1);
  if (!current || current.value === null) return null;
  const previous = [...series].reverse().find(row=>day(row.range_end)<day(current.range_start));
  if (!previous || previous.value === null) return null;
  return { current, previous, change: previous.value === 0 ? null : (current.value-previous.value)/previous.value*100 };
}