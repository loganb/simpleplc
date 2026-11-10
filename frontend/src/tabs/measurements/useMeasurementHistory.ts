import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useLoaders } from '../../lib/DataLoader2';
import { MeasurementHistoryPoint, Store } from '../../store';
import type { HistoryRange } from '../../uxTree';

export const RANGE_MS: Record<HistoryRange, number> = {
  '1m': 60_000, '10m': 600_000, '1hr': 3_600_000, '24hr': 86_400_000,
  '7d': 604_800_000, '30d': 2_592_000_000,
};

export function useMeasurementHistory(ids: number[], range: HistoryRange, refreshToken: number) {
  const [width, setWidth] = useState(0);
  const [budget, setBudget] = useState(0);
  const onPlotWidth = useCallback((next: number) => setWidth(Number.isFinite(next) && next > 0 ? next : 0), []);
  useEffect(() => {
    const timer = setTimeout(() => setBudget(width > 0 ? Math.max(1, Math.ceil(width / 100) * 100) : 0), 150);
    return () => clearTimeout(timer);
  }, [width]);
  const window = useMemo(() => {
    const until = Date.now();
    return { since: new Date(until - RANGE_MS[range]).toISOString(), until: new Date(until).toISOString() };
  }, [range, refreshToken]);
  const idsKey = [...new Set(ids)].sort((a, b) => a - b).join(',');
  const key = JSON.stringify([idsKey, window.since, window.until, budget]);
  const result = useLoaders(() => ({ key, points: idsKey && budget ? Store.m(MeasurementHistoryPoint).queryFor(null, {
    measurement_ids: idsKey.split(',').map(Number), since: window.since, until: window.until, target_points: budget,
  }) : null }), [Store], [key]);
  // DataLoader2 can retain a newer-sequence result from previous dependencies.
  // Never display it under the new range, selection or point budget.
  const points = result.key === key ? result.points : null;
  return { ...window, onPlotWidth, points, loading: !!idsKey && (!budget || !points || !points._loaded), error: !!points && points._loaded && !points._found };
}
