import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLoaders } from '../../lib/DataLoader2';
import type { ReifiedQueryResult } from '../../lib/RestfulModelStore';
import { MeasurementHistoryPoint, Store } from '../../store';
import type { MeasurementHistoryPointFields } from './historyTypes';
import type { HistoryRange } from '../../uxTree';

export const RANGE_MS: Record<HistoryRange, number> = {
  '1m': 60_000, '10m': 600_000, '1hr': 3_600_000, '24hr': 86_400_000,
  '7d': 604_800_000, '30d': 2_592_000_000,
};
export const REFRESH_MS: Record<HistoryRange, number> = {
  '1m': 2_000, '10m': 5_000, '1hr': 15_000, '24hr': 60_000,
  '7d': 120_000, '30d': 300_000,
};

type Request = { selection: string; range: HistoryRange; budget: number; since: string; until: string; key: string };
type Snapshot = { request: Request; points: ReifiedQueryResult<MeasurementHistoryPointFields> };

export function useMeasurementHistory(ids: number[], range: HistoryRange, refreshToken: number) {
  const [width, setWidth] = useState(0);
  const [budget, setBudget] = useState(0);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [request, setRequest] = useState<Request | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const lastRefreshToken = useRef(refreshToken);
  const refreshPending = useRef(false);
  const onPlotWidth = useCallback((next: number) => setWidth(Number.isFinite(next) && next > 0 ? next : 0), []);
  useEffect(() => {
    const timer = setTimeout(() => setBudget(width > 0 ? Math.max(1, Math.ceil(width / 100) * 100) : 0), 150);
    return () => clearTimeout(timer);
  }, [width]);
  useEffect(() => {
    const changed = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  }, []);
  const selection = [...new Set(ids)].sort((a, b) => a - b).join(',');
  const start = useCallback(() => {
    const now = Date.now();
    const since = new Date(now - RANGE_MS[range]).toISOString();
    const until = new Date(now).toISOString();
    setRequest({ selection, range, budget, since, until, key: JSON.stringify([selection, range, budget, since, until]) });
  }, [selection, range, budget]);
  useEffect(() => {
    if (visible && selection && budget) start();
  }, [visible, selection, budget, range, start]);

  const result = useLoaders(() => ({ key: request?.key, points: request ? Store.m(MeasurementHistoryPoint).queryFor(null, {
    measurement_ids: request.selection.split(',').map(Number), since: request.since, until: request.until, target_points: request.budget,
  }) : null }), [Store], [request?.key]);
  // DataLoader2 may return an older dependency's result after a newer store event.
  const current = request && result.key === request.key ? result.points : null;
  const matches = !!request && request.selection === selection && request.range === range && request.budget === budget;
  useEffect(() => {
    if (lastRefreshToken.current !== refreshToken) {
      lastRefreshToken.current = refreshToken;
      refreshPending.current = true;
    }
    if (refreshPending.current && visible && selection && budget && matches && current && !current._loading) {
      refreshPending.current = false;
      start();
    }
  }, [refreshToken, visible, selection, budget, matches, current?._loading, request, start]);
  useEffect(() => {
    if (request && matches && current?._loaded && current._found && !current._loading) setSnapshot({ request, points: current });
  }, [request, matches, current]);
  useEffect(() => {
    if (!visible || !selection || !matches || !current || current._loading || !current._loaded) return;
    const timer = setTimeout(start, REFRESH_MS[range]);
    return () => clearTimeout(timer);
  }, [visible, selection, matches, current?._loading, current?._loaded, request, range, start]);

  const displayed = snapshot?.request.selection === selection && snapshot.request.range === range ? snapshot : null;
  // A placeholder window lets the graph measure itself before the first query.
  const placeholder = useMemo(() => {
    const now = Date.now();
    return { since: new Date(now - RANGE_MS[range]).toISOString(), until: new Date(now).toISOString() };
  }, [range, selection]);
  const window = displayed?.request ?? (matches ? request : null) ?? placeholder;
  const error = !!(matches && current?._loaded && !current._found);
  return { since: window.since, until: window.until, onPlotWidth, points: displayed?.points ?? null,
    loading: !!selection && !displayed && !error, updating: !!displayed && !!matches && !!current?._loading,
    error };
}
