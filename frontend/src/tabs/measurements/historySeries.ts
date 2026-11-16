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
export function buildHistorySeries(series: HistoryGraphSeries, window?: { since: number; until: number }): TransformedHistory {
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
    if (point.kind === 'sample' && previous?.kind === 'sample' && previous.source.value_type === 'boolean' && typeof previous.value === 'boolean' && sourceKey(previous) === sourceKey(point) && start > Date.parse(previous.start)) {
      result.booleans.push({ start: Date.parse(previous.start), end: start, fraction: previous.value ? 1 : 0, point: previous });
    }
    previous = point;
  }
  flush();
  if (window) {
    const { since, until } = window;
    result.lines = result.lines.flatMap(({ points }) => {
      const clipped: NumericPoint[] = [];
      const add = (point: NumericPoint) => {
        if (!clipped.length || clipped[clipped.length - 1].time !== point.time) clipped.push(point);
      };
      if (points.length === 1 && points[0].time >= since && points[0].time <= until) add(points[0]);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        if (b.time < since || a.time > until) continue;
        const interpolate = (time: number) => ({ time, value: a.value + (b.value - a.value) * (time - a.time) / (b.time - a.time) });
        add(a.time < since ? interpolate(since) : a);
        add(b.time > until ? interpolate(until) : b);
      }
      return clipped.length ? [{ points: clipped }] : [];
    });
    result.booleans = result.booleans.flatMap(interval => {
      const start = Math.max(interval.start, since), end = Math.min(interval.end, until);
      return start < end ? [{ ...interval, start, end }] : [];
    });
    result.buckets = result.buckets.flatMap(bucket => {
      const start = Math.max(bucket.start, since), end = Math.min(bucket.end, until);
      return start < end ? [{ ...bucket, start, end }] : [];
    });
  }
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
function paddedDomain(min: number, max: number): [number, number] | null {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const padding = min === max ? Math.max(Math.abs(min) * 0.05, 1) : (Number.isFinite(max - min) ? (max - min) * 0.05 : max * 0.05 - min * 0.05);
  return [Number.isFinite(min - padding) ? min - padding : min, Number.isFinite(max + padding) ? max + padding : max];
}

export function numericDomain(series: TransformedHistory[]): [number, number] | null {
  let min = Infinity, max = -Infinity;
  const include = (value: number) => { if (Number.isFinite(value)) { min = Math.min(min, value); max = Math.max(max, value); } };
  for (const item of series) {
    for (const line of item.lines) for (const point of line.points) include(point.value);
    for (const bucket of item.buckets) { include(bucket.min); include(bucket.max); }
  }
  return paddedDomain(min, max);
}

/** Whether a series has observations or supported geometry in the visible window. */
export function hasVisibleHistory(series: HistoryGraphSeries, window: { since: number; until: number }): boolean {
  if (series.points.some(point => {
    const start = Date.parse(point.start), end = Date.parse(point.end);
    return point.kind === 'sample' ? start >= window.since && start < window.until : start < window.until && end > window.since;
  })) return true;
  const visible = buildHistorySeries(series, window);
  return visible.lines.length > 0 || visible.booleans.length > 0 || visible.buckets.length > 0;
}

export function analyzeHistoryRange(series: TransformedHistory[], window: { since: number; until: number }) {
  const full = numericDomain(series);
  let min = Infinity, max = -Infinity;
  for (const item of series) {
    const values = item.series.points.flatMap(point => {
      const start = Date.parse(point.start), end = Date.parse(point.end);
      if (point.source.value_type !== 'number') return [];
      if (point.kind === 'sample') return start >= window.since && start < window.until && typeof point.value === 'number' && Number.isFinite(point.value) ? [point.value] : [];
      const mean = point.statistics.mean;
      return start < window.until && end > window.since && point.count > 0 && typeof mean === 'number' && Number.isFinite(mean) ? [mean] : [];
    }).sort((a, b) => a - b);
    const geometry = [...item.lines.flatMap(line => line.points.map(point => point.value)), ...item.buckets.flatMap(bucket => [bucket.min, bucket.max, bucket.mean])].filter(Number.isFinite);
    let retained = geometry;
    if (values.length >= 8) {
      const quantile = (p: number) => { const i = (values.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return values[lo] + (values[hi] - values[lo]) * (i - lo); };
      const q1 = quantile(0.25), q3 = quantile(0.75), iqr = q3 - q1, low = q1 - 3 * iqr, high = q3 + 3 * iqr;
      if ([q1, q3, iqr, low, high].every(Number.isFinite)) {
        const filtered = geometry.filter(value => value >= low && value <= high);
        if (filtered.length) retained = filtered;
      }
    }
    for (const value of retained) { min = Math.min(min, value); max = Math.max(max, value); }
  }
  return { full, robust: paddedDomain(min, max) };
}

export interface ClippedHistoryMarker {
  measurementId: number;
  time: number;
  direction: 1 | -1;
  kind: 'sample' | 'bucket';
}

/** Classify against the final shared, padded axis, not an individual fence. */
export function historyClipping(series: TransformedHistory[], window: { since: number; until: number }, domain: [number, number] | null) {
  const markers: ClippedHistoryMarker[] = [];
  if (!domain) return { hasClipped: false, markers };
  const outside = (value: number) => Number.isFinite(value) && (value < domain[0] || value > domain[1]);
  let hasClipped = false;
  for (const item of series) {
    if (item.lines.some(line => line.points.some(point => outside(point.value)))) hasClipped = true;
    for (const point of item.series.points) {
      const time = Date.parse(point.start);
      if (point.kind !== 'sample' || point.source.value_type !== 'number' || typeof point.value !== 'number' || time < window.since || time > window.until || !Number.isFinite(time) || !outside(point.value)) continue;
      markers.push({ measurementId: item.series.measurementId, time, direction: point.value > domain[1] ? 1 : -1, kind: 'sample' });
    }
    for (const bucket of item.buckets) {
      const time = bucket.start + (bucket.end - bucket.start) / 2;
      if ([bucket.min, bucket.max, bucket.mean].some(outside)) hasClipped = true;
      if (bucket.max > domain[1]) markers.push({ measurementId: item.series.measurementId, time, direction: 1, kind: 'bucket' });
      if (bucket.min < domain[0]) markers.push({ measurementId: item.series.measurementId, time, direction: -1, kind: 'bucket' });
    }
  }
  return { hasClipped, markers };
}
