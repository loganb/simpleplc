// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import TreeStore from '../../lib/TreeStore';
import type { MeasurementsUXTree } from '../../uxTree';
import type { MeasurementFields } from '../../store';
import type { ReifiedQueryResult } from '../../lib/RestfulModelStore';
import { MeasurementsTab } from './MeasurementsTab';
vi.mock('./MeasurementHistoryGraph', () => ({ MeasurementHistoryGraph: () => <div>Graph</div> }));
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
