import type { HistoryGraphSeries, MeasurementHistoryPointFields } from './historyTypes';

type NumericPoint = { time: number; value: number };
export interface TransformedHistory {
  series: HistoryGraphSeries;
  lines: { points: NumericPoint[] }[];
  bucketLines: { points: NumericPoint[] }[];
  buckets: { start: number; end: number; min: number; max: number; mean: number; point: MeasurementHistoryPointFields }[];
  booleans: { start: number; end: number; fraction: number; point: MeasurementHistoryPointFields }[];
}
const sourceKey = ({ source: s }: MeasurementHistoryPointFields) => JSON.stringify([
  s.logic_instance_id, s.logic_diagram_id, s.source_type, s.source_id, s.value_type,
  s.logic_instance_name, s.logic_diagram_name, s.source_name,
]);
export function buildHistorySeries(series: HistoryGraphSeries): TransformedHistory {
  const result: TransformedHistory = { series, lines: [], bucketLines: [], buckets: [], booleans: [] };
  const points = [...series.points].sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || Date.parse(a.end) - Date.parse(b.end));
  let line: NumericPoint[] = [];
  let previous: MeasurementHistoryPointFields | undefined;
  const flush = () => { if (line.length) result.lines.push({ points: line }); line = []; };
  for (const point of points) {
    const start = Date.parse(point.start), end = Date.parse(point.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) { flush(); previous = undefined; continue; }
    if (point.kind === 'sample' && point.source.value_type === 'number' && typeof point.value === 'number' && Number.isFinite(point.value)) {
      if (!previous || previous.kind !== 'sample' || sourceKey(previous) !== sourceKey(point) || previous.value === null) flush();
      line.push({ time: start, value: point.value });
    } else {
      flush();
      if (point.kind === 'bucket' && point.count > 0 && point.source.value_type === 'number') {
        const { min, max, mean } = point.statistics;
        if (typeof min === 'number' && typeof max === 'number' && typeof mean === 'number' && [min, max, mean].every(Number.isFinite)) result.buckets.push({ start, end, min, max, mean, point });
      }
      if (point.kind === 'bucket' && point.count > 0 && point.source.value_type === 'boolean' && typeof point.statistics.true_fraction === 'number') {
        result.booleans.push({ start, end, fraction: Math.max(0, Math.min(1, point.statistics.true_fraction)), point });
      }
    }
    if (point.kind === 'sample' && previous?.kind === 'sample' && previous.source.value_type === 'boolean' && previous.value === true && sourceKey(previous) === sourceKey(point) && start > Date.parse(previous.start)) {
      result.booleans.push({ start: Date.parse(previous.start), end: start, fraction: 1, point: previous });
    }
    previous = point;
  }
  flush();
  let current: NumericPoint[] = [];
  let prior: typeof result.buckets[number] | undefined;
  for (const bucket of result.buckets) {
    const compatible = prior && prior.end === bucket.start && prior.point.null_count === 0 && bucket.point.null_count === 0 && sourceKey(prior.point) === sourceKey(bucket.point);
    if (!compatible && current.length) { result.bucketLines.push({ points: current }); current = []; }
    current.push({ time: bucket.start, value: bucket.mean }, { time: bucket.end, value: bucket.mean });
    prior = bucket;
  }
  if (current.length) result.bucketLines.push({ points: current });
  return result;
}
export function numericDomain(series: TransformedHistory[]): [number, number] | null {
  let min = Infinity, max = -Infinity;
  const include = (value: number) => { min = Math.min(min, value); max = Math.max(max, value); };
  for (const item of series) {
    for (const line of item.lines) for (const point of line.points) include(point.value);
    for (const bucket of item.buckets) { include(bucket.min); include(bucket.max); }
  }
  if (min === Infinity) return null;
  const padding = min === max ? Math.max(Math.abs(min) * 0.05, 1) : (max - min) * 0.05;
  return [min - padding, max + padding];
}
