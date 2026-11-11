// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import TreeStore from '../../lib/TreeStore';
import type { MeasurementsUXTree } from '../../uxTree';
const graphProps = vi.hoisted(() => vi.fn());
vi.mock('./MeasurementHistoryGraph', () => ({ MeasurementHistoryGraph: (props: { series: { points: unknown[] }[]; onPlotWidth: (width: number) => void }) => { graphProps(props); return <button onClick={() => props.onPlotWidth(300)}>Graph</button>; } }));
const ux = new TreeStore<MeasurementsUXTree>().subtree();
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import type { ReifiedQueryResult } from '../../lib/RestfulModelStore';
import type { LogicInputFields, LogicOutputFields, MeasurementFields } from '../../store';
import type { HistorySource } from './historyTypes';
import { MeasurementsTab } from './MeasurementsTab';
import { Store } from '../../store';

const query = (records: Partial<MeasurementFields>[], loaded = true) => Object.assign(records.map(r => ({ ...r, _found: true })), { _loaded: loaded, _found: loaded }) as unknown as ReifiedQueryResult<MeasurementFields>;
afterEach(cleanup);
describe('MeasurementsTab', () => {
  it('shows detached history without losing false, zero or null', () => {
    const samples = [false, 0, null].map((value, i) => ({ id: i + 10, name: `Test ${i}`, source: null, preview_kind: 'samples' as const, preview: [{ id: i, measurement_id: i + 10, recorded_at: '2026-01-01T00:00:00Z', snapshot: { value, source_name: 'Port', logic_instance_name: 'AHU', value_type: 'number' as const, logic_instance_id: 1, logic_diagram_id: 1, logic_diagram_name: 'Diagram', source_type: 'LogicInput' as const, source_id: 1 } }] }));
    render(<MeasurementsTab ux={ux} refreshToken={0} measurements={query(samples)} />);
    expect(screen.getAllByText('Detached')[0]).toBeTruthy();
    expect(screen.getByText('false')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.getByText('Unavailable')).toBeTruthy();
  });
  it('labels summary fallback and empty state', () => {
    render(<MeasurementsTab ux={ux} refreshToken={0} measurements={query([{ id: 1, name: 'Old', source: null, preview_kind: 'rollups', preview: [{ id: 2, measurement_id: 1, bucket_start: '2026-01-01T00:00:00Z', sample_count: 2, summaries: [] }] }, { id: 2, name: 'New', source: null, preview_kind: null, preview: [] }])} />);
    expect(screen.getByText(/Summary · 2 samples/)).toBeTruthy();
    expect(screen.getByText('No recorded points yet.')).toBeTruthy();
  });
  it('distinguishes loading, error, and no measurements', () => {
    const { rerender } = render(<MeasurementsTab ux={ux} refreshToken={0} measurements={query([], false)} />);
    expect(screen.getByText('Loading measurements…')).toBeTruthy();
    rerender(<MeasurementsTab ux={ux} refreshToken={0} measurements={Object.assign(query([]), { _found: false })} />);
    expect(screen.getByRole('alert').textContent).toContain('Could not load measurements');
    rerender(<MeasurementsTab ux={ux} refreshToken={0} measurements={query([])} />);
    expect(screen.getByText(/No measurements yet/)).toBeTruthy();
  });

  it('resolves units by historical source type and ID and follows current port changes', () => {
    const measurement = query([{ id: 1, name: 'Temperature', source: { id: 99, name: 'Current', value_type: 'number', logic_diagram_id: 1, logic_diagram_name: 'D', logic_instance_name: 'I' }, preview_kind: null, preview: [] }]);
    const ports = <T,>(records: unknown[]) => records as ReifiedQueryResult<T & { id: number }>;
    const inputs = ports<LogicInputFields>([{ id: 1, _found: true, units: '°C' }, { id: 2, _found: true, units: '  ' }, { id: 3, _found: false }, { id: 99, _found: true, units: 'wrong' }]);
    const outputs = ports<LogicOutputFields>([{ id: 1, _found: true, units: 'V' }]);
    const source = (source_type: 'LogicInput' | 'LogicOutput', source_id: number, value_type: 'number' | 'boolean' = 'number') => ({ source_type, source_id, value_type } as HistorySource);
    const view = render(<MeasurementsTab ux={ux} refreshToken={0} measurements={measurement} logicInputs={inputs} logicOutputs={outputs} />);
    const resolver = graphProps.mock.lastCall![0].unitsFor;
    expect(resolver(source('LogicInput', 1))).toBe('°C');
    expect(resolver(source('LogicOutput', 1))).toBe('V');
    expect(resolver(source('LogicInput', 1, 'boolean'))).toBeNull();
    expect(resolver(source('LogicInput', 2))).toBeNull();
    expect(resolver(source('LogicInput', 3))).toBeNull();
    expect(resolver(source('LogicInput', 4))).toBeNull();
    view.rerender(<MeasurementsTab ux={ux} refreshToken={1} measurements={measurement} logicInputs={[...inputs] as typeof inputs} logicOutputs={[...outputs] as typeof outputs} />);
    expect(graphProps.mock.lastCall![0].unitsFor).toBe(resolver);
    const changedInputs = ports<LogicInputFields>([{ id: 1, _found: true, units: '°F' }]);
    view.rerender(<MeasurementsTab ux={ux} refreshToken={1} measurements={measurement} logicInputs={changedInputs} logicOutputs={outputs} />);
    expect(graphProps.mock.lastCall![0].unitsFor(source('LogicInput', 1))).toBe('°F');
    expect(graphProps.mock.lastCall![0].unitsFor(source('LogicInput', 99))).toBeNull();
  });

  it('keeps menu clicks separate from graph selection and sends no request on cancellation', async () => {
    ux.set('deselectedIds', []);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const patch = vi.spyOn(Store.axios, 'patch');
    const destroy = vi.spyOn(Store.axios, 'delete');
    render(<MeasurementsTab ux={ux} refreshToken={0} measurements={query([{ id: 81, name: 'Supply temp', source: null, preview: [] }])} />);
    const selection = screen.getByRole('button', { name: 'Select Supply temp measurement' });
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Supply temp' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear data…' }));
    expect(selection.getAttribute('aria-pressed')).toBe('true');
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Supply temp'));
    expect(patch).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
    fireEvent.click(selection);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Select Supply temp measurement' }).getAttribute('aria-pressed')).toBe('false'));
    confirm.mockRestore(); patch.mockRestore(); destroy.mockRestore();
  });

  it('sends the write-only clear flag through Store and leaves the card selectable', async () => {
    ux.set('deselectedIds', []);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const patch = vi.spyOn(Store.axios, 'patch').mockResolvedValue({ data: { measurements: [{ id: 82, name: 'Return temp', logic_instance_id: null, source_type: null, source_id: null, source: null, preview_kind: null, preview: [] }], invalidates: {} } } as never);
    render(<MeasurementsTab ux={ux} refreshToken={0} measurements={query([{ id: 82, name: 'Return temp', source: null, preview: [] }])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Return temp' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear data…' }));
    expect(patch).toHaveBeenCalledWith('/measurements/82', { measurement: { clear_data: true } }, expect.anything());
    expect(screen.getByRole('button', { name: 'Select Return temp measurement' }).getAttribute('aria-pressed')).toBe('true');
    confirm.mockRestore(); patch.mockRestore();
  });

  it('does not dismiss the menu when Safari blurs a menu item during a pointer press', async () => {
    ux.set('deselectedIds', []);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const patch = vi.spyOn(Store.axios, 'patch').mockResolvedValue({ data: { measurements: [] } } as never);
    render(<MeasurementsTab ux={ux} refreshToken={0} measurements={query([{ id: 87, name: 'Safari focus', source: null, preview: [] }])} />);
    const trigger = screen.getByRole('button', { name: 'Actions for Safari focus' });
    fireEvent.click(trigger);
    const clear = screen.getByRole('menuitem', { name: 'Clear data…' });
    expect(document.activeElement).toBe(clear);
    fireEvent.pointerDown(clear);
    await act(async () => { clear.blur(); });
    expect(document.activeElement).not.toBe(clear);
    fireEvent.pointerUp(clear);
    expect(screen.getByRole('menuitem', { name: 'Clear data…' })).toBeTruthy();
    fireEvent.click(clear);
    expect(patch).toHaveBeenCalledWith('/measurements/87', { measurement: { clear_data: true } }, expect.anything());
    confirm.mockRestore(); patch.mockRestore();
  });

  it('clears a visible graph after the confirmed Store mutation succeeds', async () => {
    ux.set('range', '1m');
    ux.set('deselectedIds', []);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    Store.io_rate_limiter.currentRps = 1_000_000;
    const pointTime = new Date().toISOString();
    const oldPoint = { id: 'old-point', measurement_id: 86, kind: 'sample', start: pointTime, end: pointTime, recorded_at: pointTime, value: 23, count: 1, null_count: 0, source: {} };
    const get = vi.spyOn(Store.axios, 'get').mockResolvedValueOnce({ data: { query: ['old-point'], measurement_history_points: [oldPoint] } } as never)
      .mockResolvedValueOnce({ data: { query: [], measurement_history_points: [] } } as never);
    const patch = vi.spyOn(Store.axios, 'patch').mockResolvedValue({ data: { measurements: [{ id: 86, name: 'Clear integration', logic_instance_id: null, source_type: null, source_id: null, source: null, preview_kind: null, preview: [] }], invalidates: { measurement_history_point: 'queries' } } } as never);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    graphProps.mockClear();
    try {
      render(<MeasurementsTab ux={ux} refreshToken={0} measurements={query([{ id: 86, name: 'Clear integration', source: null, preview: [] }])} />);
      fireEvent.click(screen.getByText('Graph'));
      await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(graphProps.mock.lastCall![0].series[0].points).toHaveLength(1));

      fireEvent.click(screen.getByRole('button', { name: 'Actions for Clear integration' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Clear data…' }));
      expect(patch).toHaveBeenCalledWith('/measurements/86', { measurement: { clear_data: true } }, expect.anything());
      await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(graphProps.mock.lastCall![0].series[0].points).toHaveLength(0));
    } finally {
      get.mockRestore(); patch.mockRestore(); confirm.mockRestore();
    }
  });

  it('keeps the card and reports clear failures', async () => {
    ux.set('deselectedIds', []);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const patch = vi.spyOn(Store.axios, 'patch').mockRejectedValue({ response: { data: { errors: { base: ['offline'] } }, status: 503 } });
    render(<MeasurementsTab ux={ux} refreshToken={0} measurements={query([{ id: 83, name: 'Exhaust temp', source: null, preview: [] }])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Exhaust temp' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear data…' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('offline'));
    expect(screen.getByRole('button', { name: 'Select Exhaust temp measurement' })).toBeTruthy();
    confirm.mockRestore(); patch.mockRestore();
  });

  it('supports arrow navigation, escape, and trigger focus restoration', () => {
    ux.set('deselectedIds', []);
    render(<MeasurementsTab ux={ux} refreshToken={0} measurements={query([{ id: 84, name: 'Mixed air', source: null, preview: [] }])} />);
    const trigger = screen.getByRole('button', { name: 'Actions for Mixed air' });
    fireEvent.click(trigger);
    const clear = screen.getByRole('menuitem', { name: 'Clear data…' });
    const remove = screen.getByRole('menuitem', { name: 'Delete measurement…' });
    expect(document.activeElement).toBe(clear);
    fireEvent.keyDown(clear, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(remove);
    fireEvent.keyDown(remove, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('deletes through Store, blocks repeats while pending, and keeps the card after failure', async () => {
    ux.set('deselectedIds', []);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let reject!: (reason: unknown) => void;
    const destroy = vi.spyOn(Store.axios, 'delete').mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }) as never);
    render(<MeasurementsTab ux={ux} refreshToken={0} measurements={query([{ id: 85, name: 'Zone humidity', source: null, preview: [] }])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Zone humidity' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete measurement…' }));
    expect(destroy).toHaveBeenCalledWith('/measurements/85.json');
    expect(screen.getByRole('button', { name: 'Actions for Zone humidity' }).hasAttribute('disabled')).toBe(true);
    reject({ response: { data: { errors: { base: ['delete failed'] } }, status: 503 } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('delete failed'));
    expect(screen.getByRole('button', { name: 'Select Zone humidity measurement' })).toBeTruthy();
    confirm.mockRestore(); destroy.mockRestore();
  });

});
