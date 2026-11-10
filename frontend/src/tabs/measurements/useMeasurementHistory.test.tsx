// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import TreeStore from '../../lib/TreeStore';
import type { MeasurementsUXTree } from '../../uxTree';
import type { MeasurementFields } from '../../store';
import type { ReifiedQueryResult } from '../../lib/RestfulModelStore';
import { MeasurementsTab } from './MeasurementsTab';
const graphProps = vi.hoisted(() => vi.fn());
vi.mock('./MeasurementHistoryGraph', () => ({ MeasurementHistoryGraph: (props: { series: unknown; onPlotWidth: (width: number) => void }) => { graphProps(props); return <button onClick={() => props.onPlotWidth(300)}>Graph</button>; } }));
const records = Object.assign([{ id: 2, name: 'Two', source: null, preview: [], _found: true }, { id: 1, name: 'One', source: null, preview: [], _found: true }], { _loaded: true, _found: true }) as unknown as ReifiedQueryResult<MeasurementFields>;
afterEach(cleanup);
describe('measurement history controls', () => {
  it('preserves card selection and range in the tree', () => {
    const ux = new TreeStore<MeasurementsUXTree>().subtree();
    const view = render(<MeasurementsTab measurements={records} ux={ux} refreshToken={0} />);
    expect(screen.getByRole('button', { name: /One/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /One/ }));
    fireEvent.click(screen.getByRole('button', { name: '24hr' }));
    view.unmount();
    render(<MeasurementsTab measurements={records} ux={ux} refreshToken={0} />);
    expect(screen.getByRole('button', { name: /One/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: '24hr' }).getAttribute('aria-pressed')).toBe('true');
  });
});

import { Store } from '../../store';
import { useMeasurementHistory } from './useMeasurementHistory';
import { waitFor } from '@testing-library/preact';
function HistoryProbe({ ids, range = '1hr', refresh = 0 }: { ids: number[]; range?: '1hr' | '24hr'; refresh?: number }) {
  const history = useMeasurementHistory(ids, range, refresh);
  return <><button onClick={() => history.onPlotWidth(351)}>Width</button><output>{JSON.stringify({ since: history.since, until: history.until, loading: history.loading, points: history.points?.map(point => point.id) })}</output></>;
}
it('queries the real store with sorted IDs and a quantized budget; old results cannot replace the current range', async () => {
  Store.io_rate_limiter.currentRps = 1_000_000;
  const pending: ((value: unknown) => void)[] = [];
  const get = vi.spyOn(Store.axios, 'get').mockImplementation(() => new Promise(resolve => pending.push(resolve)) as never);
  const view = render(<HistoryProbe ids={[902, 901, 902]} />);
  fireEvent.click(screen.getByText('Width'));
  await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  const first = JSON.parse(decodeURIComponent(String(get.mock.calls[0][0]).split('?q=')[1]));
  expect(first.measurement_ids).toEqual([901, 902]);
  expect(first.target_points).toBe(400);
  expect(Date.parse(first.until) - Date.parse(first.since)).toBe(3_600_000);
  view.rerender(<HistoryProbe ids={[902, 901]} range="24hr" />);
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  const second = JSON.parse(decodeURIComponent(String(get.mock.calls[1][0]).split('?q=')[1]));
  expect(Date.parse(second.until) - Date.parse(second.since)).toBe(86_400_000);
  pending[1]({ data: { query: [], measurement_history_points: [] } });
  await waitFor(() => expect(JSON.parse(screen.getByRole('status').textContent!).loading).toBe(false));
  pending[0]({ data: { query: ['old-point'], measurement_history_points: [{ id: 'old-point', measurement_id: 901, kind: 'sample', start: first.since, end: first.since, recorded_at: first.since, value: 1, count: 1, null_count: 0, source: {} }] } });
  await waitFor(() => expect(JSON.parse(screen.getByRole('status').textContent!).since).toBe(second.since));
  expect(JSON.parse(screen.getByRole('status').textContent!).loading).toBe(false);
  expect(JSON.parse(screen.getByRole('status').textContent!).points).toEqual([]);
  view.rerender(<HistoryProbe ids={[]} range="24hr" />);
  expect(get).toHaveBeenCalledTimes(2);
  get.mockRestore();
});

import { act } from '@testing-library/preact';
import type { HistoryRange } from '../../uxTree';
function LiveProbe({ ids = [74191], range = '1m', refresh = 0 }: { ids?: number[]; range?: HistoryRange; refresh?: number }) {
  const h = useMeasurementHistory(ids, range, refresh);
  return <><button onClick={() => h.onPlotWidth(300)}>Set width</button><output>{JSON.stringify({ since: h.since, until: h.until, loading: h.loading, updating: h.updating, error: h.error, points: h.points?.map(p => p.id) })}</output></>;
}
const output = () => JSON.parse(screen.getByRole('status').textContent!);
const emptyResponse = { data: { query: [], measurement_history_points: [] } };
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
async function resolveRequest(resolve: (value: unknown) => void, value: unknown = emptyResponse) {
  await act(async () => { resolve(value); await Promise.resolve(); await vi.advanceTimersByTimeAsync(20); });
  await advance(20);
}
describe('live measurement history', () => {
  let clockDay = 0;
  let get: ReturnType<typeof vi.spyOn>;
  let pending: ((value: unknown) => void)[];
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2030-01-01T00:00:00Z') + clockDay++ * 86_400_000);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    Store.io_rate_limiter.currentRps = 1_000_000;
    Store.is_dirty = false;
    pending = [];
    get = vi.spyOn(Store.axios, 'get').mockImplementation(() => new Promise(resolve => pending.push(resolve)) as never);
  });
  afterEach(() => { cleanup(); get.mockRestore(); vi.useRealTimers(); });
  it.each([['1m', 2000], ['10m', 5000], ['1hr', 15000], ['24hr', 60000], ['7d', 120000], ['30d', 300000]] as const)('refreshes %s after completion at its cadence', async (range, interval) => {
    render(<LiveProbe ids={[74191 + interval]} range={range} />);
    fireEvent.click(screen.getByText('Set width'));
    await advance(200);
    await advance(20);
    expect(get).toHaveBeenCalledTimes(1);
    await advance(interval * 2);
    expect(get).toHaveBeenCalledTimes(1);
    await resolveRequest(pending[0]);
    const shown = output();
    expect(shown.loading).toBe(false);
    await advance(interval - 21);
    expect(get).toHaveBeenCalledTimes(1);
    await advance(25);
    await advance(20);
    expect(get).toHaveBeenCalledTimes(2);
    expect(output().until).toBe(shown.until);
    expect(output().updating).toBe(true);
    await resolveRequest(pending[1]);
    expect(output().until).not.toBe(shown.until);
  });
  it('keeps graph series stable when the updating status changes', async () => {
    const tree = new TreeStore<MeasurementsUXTree>().subtree();
    tree.set('range', '1m');
    const liveRecords = Object.assign([{ id: 99003, name: 'Live', source: null, preview: [], _found: true }], { _loaded: true, _found: true }) as unknown as ReifiedQueryResult<MeasurementFields>;
    graphProps.mockClear();
    render(<MeasurementsTab measurements={liveRecords} ux={tree} refreshToken={0} />);
    fireEvent.click(screen.getByText('Graph'));
    await advance(200); await advance(20);
    await resolveRequest(pending[0]);
    const priorSeries = graphProps.mock.lastCall![0].series;
    await advance(2001); await advance(20);
    expect(screen.getByText('Updating history…')).toBeTruthy();
    expect(graphProps.mock.lastCall![0].series).toBe(priorSeries);
    await resolveRequest(pending[1]);
    expect(graphProps.mock.lastCall![0].series).not.toBe(priorSeries);
  });
  it('coalesces an explicit refresh while the current query is pending', async () => {
    const view = render(<LiveProbe ids={[99002]} />);
    fireEvent.click(screen.getByText('Set width'));
    await advance(200); await advance(20);
    view.rerender(<LiveProbe ids={[99002]} refresh={1} />);
    await advance(100);
    expect(get).toHaveBeenCalledTimes(1);
    await resolveRequest(pending[0]);
    await advance(20);
    expect(get).toHaveBeenCalledTimes(2);
    await resolveRequest(pending[1]);
  });
  it('retains a successful window and reports a failed background request', async () => {
    let reject!: (reason: unknown) => void;
    get.mockImplementationOnce(() => new Promise(resolve => pending.push(resolve)) as never)
      .mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }) as never);
    render(<LiveProbe ids={[99001]} />);
    fireEvent.click(screen.getByText('Set width'));
    await advance(200); await advance(20);
    await resolveRequest(pending[0]);
    const shown = output();
    await advance(2001); await advance(20);
    await act(async () => { reject({ response: { status: 404 } }); await Promise.resolve(); });
    await advance(40);
    expect(output().error).toBe(true);
    expect(output().until).toBe(shown.until);
    expect(output().points).toEqual([]);
  });
  it('pauses while hidden, resumes immediately, and respects explicit refresh and selection', async () => {
    const view = render(<LiveProbe ids={[84201]} />);
    fireEvent.click(screen.getByText('Set width'));
    await advance(200);
    await advance(20);
    await resolveRequest(pending[0]);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await advance(10_000);
    expect(get).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await advance(20);
    expect(get).toHaveBeenCalledTimes(2);
    await resolveRequest(pending[1]);
    view.rerender(<LiveProbe ids={[84201]} refresh={1} />);
    await advance(20);
    expect(get).toHaveBeenCalledTimes(3);
    view.rerender(<LiveProbe ids={[]} refresh={1} />);
    await advance(10_000);
    expect(get).toHaveBeenCalledTimes(3);
    view.unmount();
    await advance(10_000);
    expect(get).toHaveBeenCalledTimes(3);
  });
});
