import { describe, expect, it } from 'vitest';
import { buildHistorySeries, hasVisibleHistory, numericDomain } from './historySeries';
import type { HistoryGraphSeries, HistorySamplePoint, HistoryBucketPoint, HistorySource } from './historyTypes';

const source = { value_type: 'number' as const, logic_instance_id: 1, logic_instance_name: 'Instance', logic_diagram_id: 1, logic_diagram_name: 'Diagram', source_type: 'LogicOutput' as const, source_id: 1, source_name: 'Output' };
const at = (n: number) => new Date(n * 1000).toISOString();
const sample = (n: number, value: number | boolean | null, src: HistorySource = source): HistorySamplePoint => ({ id: String(n), measurement_id: 1, kind: 'sample', start: at(n), end: at(n), recorded_at: at(n), value, source: src, count: value === null ? 0 : 1, null_count: value === null ? 1 : 0 });
const bucket = (start: number, end: number, min: number, max: number, mean: number): HistoryBucketPoint => ({ id: `b${start}`, measurement_id: 1, kind: 'bucket', start: at(start), end: at(end), source, count: 2, null_count: 0, statistics: { min, max, mean }, last_known: false, coverage: 'summary', gap_detail: 'minute' });
const series = (points: HistoryGraphSeries['points']): HistoryGraphSeries => ({ measurementId: 1, name: 'Test', color: '#123456', points });

describe('history series', () => {
  it('separates numeric observations at nulls, source changes and bucket boundaries', () => {
    const changed = { ...source, source_id: 2 };
    const result = buildHistorySeries(series([sample(1, -2), sample(2, 0), sample(3, null), sample(4, 5), sample(5, 6, changed), bucket(6, 9, -8, -1, -4)]));
    expect(result.lines.map(line => line.points.map(p => p.value))).toEqual([[-2, 0], [5], [6]]);
    expect(result.buckets.map(b => [b.start, b.end, b.min, b.max, b.mean])).toEqual([[6000, 9000, -8, -1, -4]]);
    expect(numericDomain([result])).toEqual([-8.7, 6.7]);
  });
  it('ends raw boolean shading at the next observation and preserves bucket fractions', () => {
    const bool = { ...source, value_type: 'boolean' as const };
    const b = { ...bucket(8, 10, 0, 1, 0), source: bool, statistics: { true_fraction: 0.5 } };
    const result = buildHistorySeries(series([sample(1, true, bool), sample(3, false, bool), sample(4, true, bool), sample(5, null, bool), sample(6, true, bool), b]));
    expect(result.booleans.map(x => [x.start, x.end, x.fraction])).toEqual([[1000, 3000, 1], [3000, 4000, 0], [4000, 5000, 1], [8000, 10000, 0.5]]);
    expect(numericDomain([result])).toBeNull();
  });
  it('joins adjacent compatible bucket means but breaks at gaps, nulls, and source changes', () => {
    const a = bucket(0, 2, -4, 0, -2), b = bucket(2, 5, 0, 4, 2);
    const incomplete = { ...bucket(5, 6, 1, 3, 2), null_count: 1 };
    const changed = { ...bucket(6, 7, 2, 4, 3), source: { ...source, source_id: 2 } };
    const afterGap = { ...bucket(9, 10, 2, 4, 3), source: changed.source };
    const result = buildHistorySeries(series([a, b, incomplete, changed, afterGap]));
    expect(result.bucketLines.map(line => line.points.map(p => [p.time, p.value]))).toEqual([
      [[0, -2], [2000, -2], [2000, 2], [5000, 2]],
      [[5000, 2], [6000, 2]], [[6000, 3], [7000, 3]], [[9000, 3], [10000, 3]],
    ]);
  });

  it('clips raw lines to the window and derives the domain from visible geometry', () => {
    const result = buildHistorySeries(series([sample(0, 1000), sample(10, 0), sample(20, 10), sample(30, 1010)]), { since: 9000, until: 21000 });
    expect(result.lines[0].points).toEqual([{ time: 9000, value: 100 }, { time: 10000, value: 0 }, { time: 20000, value: 10 }, { time: 21000, value: 110 }]);
    expect(numericDomain([result])).toEqual([-5.5, 115.5]);
  });
  it('does not draw outside observations or cross null and source boundaries', () => {
    const changed = { ...source, source_id: 2 };
    const window = { since: 10000, until: 20000 };
    expect(buildHistorySeries(series([sample(0, 1), sample(5, 2)]), window).lines).toEqual([]);
    expect(buildHistorySeries(series([sample(0, 1), sample(15, null), sample(30, 2)]), window).lines).toEqual([]);
    expect(buildHistorySeries(series([sample(0, 1), sample(30, 2, changed)]), window).lines).toEqual([]);
    expect(buildHistorySeries(series([sample(15, 2)]), window).lines[0].points).toEqual([{ time: 15000, value: 2 }]);
  });
  it('clips boolean intervals without extrapolating or crossing source changes', () => {
    const bool = { ...source, value_type: 'boolean' as const };
    const window = { since: 10000, until: 20000 };
    const result = buildHistorySeries(series([sample(0, true, bool), sample(15, true, bool), sample(30, false, bool)]), window);
    expect(result.booleans.map(x => [x.start, x.end])).toEqual([[10000, 15000], [15000, 20000]]);
    expect(buildHistorySeries(series([sample(0, true, bool), sample(15, true, { ...bool, source_id: 2 })]), window).booleans).toEqual([]);
    expect(buildHistorySeries(series([sample(15, true, bool)]), window).booleans).toEqual([]);
  });

  it('retains false observed intervals for inspection and detects context-only empty history', () => {
    const bool = { ...source, value_type: 'boolean' as const };
    const window = { since: 10000, until: 20000 };
    const falseSeries = series([sample(0, false, bool), sample(30, false, bool)]);
    expect(buildHistorySeries(falseSeries, window).booleans.map(x => [x.start, x.end, x.fraction])).toEqual([[10000, 20000, 0]]);
    expect(hasVisibleHistory(falseSeries, window)).toBe(true);
    expect(hasVisibleHistory(series([sample(0, 1), sample(5, 2)]), window)).toBe(false);
    expect(hasVisibleHistory(series([sample(15, null)]), window)).toBe(true);
  });

});
