// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import type { HistoryGraphSeries } from './historyTypes';

const mocks = vi.hoisted(() => {
  const zr = { on: vi.fn(), off: vi.fn() };
  const instance = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn(), getZr: () => zr, containPixel: () => true, convertFromPixel: vi.fn(() => 1000), convertToPixel: () => 10, dispatchAction: vi.fn() };
  return { instance, zr, init: vi.fn(() => instance) };
});
vi.mock('echarts/core', () => ({ use: vi.fn(), init: mocks.init, graphic: { clipRectByRect: vi.fn() } }));
vi.mock('echarts/charts', () => ({ CustomChart: {}, LineChart: {} }));
vi.mock('echarts/components', () => ({ AriaComponent: {}, GridComponent: {}, MarkAreaComponent: {}, TooltipComponent: {} }));
vi.mock('echarts/renderers', () => ({ SVGRenderer: {} }));
import { MeasurementHistoryGraph } from './MeasurementHistoryGraph';

const source = { value_type: 'number' as const, logic_instance_id: 1, logic_instance_name: 'Room', logic_diagram_id: 1, logic_diagram_name: 'D', source_type: 'LogicOutput' as const, source_id: 1, source_name: '<unsafe>' };
const points: HistoryGraphSeries[] = [{ measurementId: 1, name: 'Temperature', color: '#123456', points: [1, 2].map(n => ({ id: String(n), measurement_id: 1, kind: 'sample' as const, start: new Date(n * 1000).toISOString(), end: new Date(n * 1000).toISOString(), recorded_at: new Date(n * 1000).toISOString(), value: n, count: 1, null_count: 0, source })) }];
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.instance.convertFromPixel.mockReturnValue(1000); });
describe('MeasurementHistoryGraph', () => {
  it('exposes keyboard details, replaces series and disposes the chart', () => {
    const onPlotWidth = vi.fn();
    const view = render(<MeasurementHistoryGraph series={points} since="1970-01-01T00:00:00Z" until="1970-01-01T00:01:00Z" onPlotWidth={onPlotWidth} />);
    expect(onPlotWidth).toHaveBeenCalled();
    expect(screen.getByLabelText('Cursor values').textContent).toContain('Temperature: 1');
    expect(screen.getByLabelText('Cursor values').textContent).not.toMatch(/Sample|unsafe|Room/);
    fireEvent.keyDown(screen.getByRole('group'), { key: 'ArrowRight' });
    expect(screen.getByText('2')).toBeTruthy();
    view.rerender(<MeasurementHistoryGraph series={[]} since="1970-01-01T00:00:00Z" until="1970-01-01T00:01:00Z" onPlotWidth={onPlotWidth} />);
    expect(mocks.instance.setOption.mock.lastCall?.[0].series).toEqual([]);
    expect(mocks.instance.setOption.mock.lastCall?.[1]).toEqual({ notMerge: true });
    view.unmount();
    expect(mocks.instance.dispose).toHaveBeenCalledOnce();
    expect(mocks.zr.off).toHaveBeenCalledTimes(2);
  });
  it('reports intervals under the pointer and keeps their fractions inspectable', () => {
    const booleanSource = { ...source, value_type: 'boolean' as const };
    const intervals: HistoryGraphSeries[] = [{ measurementId: 2, name: 'Fan', color: '#abcdef', points: [{
      id: 'bucket', measurement_id: 2, kind: 'bucket', start: new Date(0).toISOString(), end: new Date(5000).toISOString(), source: booleanSource,
      count: 4, null_count: 0, statistics: { true_fraction: 0.5 }, last_known: false, coverage: 'summary', gap_detail: 'minute',
    }] }];
    render(<MeasurementHistoryGraph series={intervals} since="1970-01-01T00:00:00Z" until="1970-01-01T00:01:00Z" />);
    const hover = mocks.zr.on.mock.calls.find(([name]) => name === 'mousemove')?.[1];
    expect(hover).toBeDefined();
    act(() => hover({ offsetX: 10, offsetY: 10 }));
    expect(screen.getByText('50% on')).toBeTruthy();
    const custom = mocks.instance.setOption.mock.lastCall?.[0].series[0];
    expect(custom.data).toEqual([[0, 5000, 0.5, 1]]);
  });

  it('moves to the immediately adjacent timestamp after hovering inside a bucket', () => {
    const bucket = { id: 'bucket', measurement_id: 1, kind: 'bucket' as const, start: new Date(-1000).toISOString(), end: new Date(4000).toISOString(), source,
      count: 1, null_count: 0, statistics: { min: 1, max: 1, mean: 1, last: null }, last_known: true, coverage: 'summary' as const, gap_detail: 'minute' as const };
    const mixed = [{ ...points[0], points: [bucket, ...points[0].points] }];
    render(<MeasurementHistoryGraph series={mixed} since="1970-01-01T00:00:00Z" until="1970-01-01T00:01:00Z" />);
    expect(screen.getByLabelText('Cursor values').textContent).not.toMatch(/summary|latest|Gaps/);
    const hover = mocks.zr.on.mock.calls.find(([name]) => name === 'mousemove')?.[1];
    mocks.instance.convertFromPixel.mockReturnValue(1500);
    act(() => hover({ offsetX: 10, offsetY: 10 }));
    const graph = screen.getByRole('group');
    fireEvent.keyDown(graph, { key: 'ArrowRight' });
    expect(screen.getByText(new Date(2000).toLocaleString(), { selector: 'strong' })).toBeTruthy();
    fireEvent.keyDown(graph, { key: 'ArrowLeft' });
    expect(screen.getByText(new Date(1000).toLocaleString(), { selector: 'strong' })).toBeTruthy();
  });

  it('formats values and units compactly and uses the actual pointer time', () => {
    const booleanSource = { ...source, value_type: 'boolean' as const };
    const fixtures: HistoryGraphSeries[] = [
      { ...points[0], points: [{ ...points[0].points[0], kind: 'sample', recorded_at: new Date(1000).toISOString(), value: 0 }] },
      { measurementId: 2, name: 'Missing', color: '#111', points: [{ ...points[0].points[0], kind: 'sample', recorded_at: new Date(1000).toISOString(), id: 'null', measurement_id: 2, value: null }] },
      { measurementId: 3, name: 'Fan', color: '#222', points: [{ ...points[0].points[0], kind: 'sample', recorded_at: new Date(1000).toISOString(), id: 'bool', measurement_id: 3, source: booleanSource, value: true }] },
      { measurementId: 4, name: 'Average', color: '#333', points: [{ id: 'bucket', measurement_id: 4, kind: 'bucket', start: new Date(0).toISOString(), end: new Date(5000).toISOString(), source, count: 4, null_count: 1, statistics: { mean: 1.234, min: 0, max: 3.456 }, last_known: false, coverage: 'summary', gap_detail: 'minute' }] },
    ];
    const resolver = vi.fn(() => '°C');
    render(<MeasurementHistoryGraph series={fixtures} since="1970-01-01T00:00:00Z" until="1970-01-01T00:01:00Z" unitsFor={resolver} />);
    const hover = mocks.zr.on.mock.calls.find(([name]) => name === 'mousemove')?.[1];
    mocks.instance.convertFromPixel.mockReturnValue(2500);
    act(() => hover({ offsetX: 10, offsetY: 10 }));
    const readout = screen.getByLabelText('Cursor values');
    expect(readout.textContent).toContain(new Date(2500).toLocaleString());
    expect(readout.textContent).toContain('Temperature: 0 °C');
    expect(readout.textContent).toContain('Missing: —');
    expect(readout.textContent).toContain('Fan: On');
    expect(readout.textContent).toContain('Average: 1.23 °C (0–3.46)');
    expect(readout.textContent).not.toMatch(/Room|unsafe|sample|latest|unavailable|summary/i);
    expect(readout.querySelectorAll('strong')).toHaveLength(1);
    expect(readout.getAttribute('aria-live')).toBe('off');
    fireEvent.keyDown(screen.getByRole('group'), { key: 'ArrowRight' });
    expect(readout.getAttribute('aria-live')).toBe('polite');
  });

  it('shows overlapping bucket groups with the units of each source', () => {
    const bucket = { id: 'a', measurement_id: 1, kind: 'bucket' as const, start: new Date(0).toISOString(), end: new Date(5000).toISOString(), source,
      count: 2, null_count: 0, statistics: { mean: 12 }, last_known: false, coverage: 'summary' as const, gap_detail: 'minute' as const };
    const otherSource = { ...source, source_type: 'LogicInput' as const, source_id: 2 };
    const grouped = [{ ...points[0], points: [bucket, { ...bucket, id: 'b', source: otherSource, statistics: { mean: 7 } }] }];
    render(<MeasurementHistoryGraph series={grouped} since="1970-01-01T00:00:00Z" until="1970-01-01T00:01:00Z" unitsFor={s => s.source_id === 1 ? '°C' : '°F'} />);
    expect(screen.getByRole('region', { name: 'Cursor values' }).textContent).toContain('Temperature: 12 °C / 7 °F');
  });

  it('keeps the cursor through a refresh and clears it on leaving the graph', () => {
    const view = render(<MeasurementHistoryGraph series={points} since="1970-01-01T00:00:00Z" until="1970-01-01T00:01:00Z" />);
    const hover = mocks.zr.on.mock.calls.find(([name]) => name === 'mousemove')?.[1];
    act(() => hover({ offsetX: 45, offsetY: 10 }));
    expect(mocks.instance.dispatchAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'updateAxisPointer', x: 45 }));
    view.rerender(<MeasurementHistoryGraph series={[...points]} since="1970-01-01T00:00:00Z" until="1970-01-01T00:01:00Z" />);
    expect(mocks.instance.dispatchAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'updateAxisPointer', x: 45 }));
    fireEvent.mouseLeave(screen.getByRole('group').firstElementChild!);
    expect(mocks.instance.dispatchAction).toHaveBeenCalledWith({ type: 'updateAxisPointer', currTrigger: 'leave' });
  });
  it('offers clipped edges for keyboard navigation while identifying actual samples', () => {
    const crossing = [{ ...points[0], points: [
      { ...points[0].points[0], start: new Date(-1000).toISOString(), end: new Date(-1000).toISOString(), recorded_at: new Date(-1000).toISOString() },
      { ...points[0].points[1], start: new Date(3000).toISOString(), end: new Date(3000).toISOString(), recorded_at: new Date(3000).toISOString() },
    ] }];
    render(<MeasurementHistoryGraph series={crossing} since="1970-01-01T00:00:00Z" until="1970-01-01T00:00:02Z" />);
    expect(screen.getByText('1')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('group'), { key: 'ArrowRight' });
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText(new Date(2000).toLocaleString(), { selector: 'strong' })).toBeTruthy();
  });

  it('restores the pointer after resize and removes it on leave', () => {
    let resize: ResizeObserverCallback = () => {};
    vi.stubGlobal('ResizeObserver', class { constructor(callback: ResizeObserverCallback) { resize = callback; } observe() {} disconnect() {} });
    try {
      render(<MeasurementHistoryGraph series={points} since="1970-01-01T00:00:00Z" until="1970-01-01T00:01:00Z" />);
      const hover = mocks.zr.on.mock.calls.find(([name]) => name === 'mousemove')?.[1];
      act(() => hover({ offsetX: 10, offsetY: 10 }));
      mocks.instance.dispatchAction.mockClear();
      act(() => resize([], {} as ResizeObserver));
      expect(mocks.instance.dispatchAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'updateAxisPointer', x: 10 }));
      fireEvent.mouseLeave(screen.getByRole('group').firstElementChild!);
      mocks.instance.dispatchAction.mockClear();
      act(() => resize([], {} as ResizeObserver));
      expect(mocks.instance.dispatchAction).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it('makes a false state spanning the window inspectable', () => {
    const booleanSource = { ...source, value_type: 'boolean' as const };
    const falseSeries: HistoryGraphSeries[] = [{ ...points[0], points: [-1, 3].map(n => ({ id: String(n), measurement_id: 1, kind: 'sample' as const, start: new Date(n * 1000).toISOString(), end: new Date(n * 1000).toISOString(), recorded_at: new Date(n * 1000).toISOString(), value: false, count: 1, null_count: 0, source: booleanSource })) }];
    render(<MeasurementHistoryGraph series={falseSeries} since="1970-01-01T00:00:00Z" until="1970-01-01T00:00:02Z" />);
    expect(screen.getByText('Off')).toBeTruthy();
    expect(mocks.instance.setOption.mock.lastCall?.[0].series[0].data).toEqual([[0, 2000, 0, 0]]);
  });

  it('highlights numeric data independently of overlapping boolean intervals and clears it on leave', () => {
    const booleanSource = { ...source, value_type: 'boolean' as const };
    const booleanSeries: HistoryGraphSeries = { measurementId: 2, name: 'Fan', color: '#abcdef', points: [{
      id: 'b', measurement_id: 2, kind: 'bucket', start: new Date(0).toISOString(), end: new Date(5000).toISOString(), source: booleanSource,
      count: 1, null_count: 0, statistics: { true_fraction: 1 }, last_known: false, coverage: 'summary', gap_detail: 'minute',
    }] };
    const view = render(<MeasurementHistoryGraph series={[...points, booleanSeries]} since="1970-01-01T00:00:00Z" until="1970-01-01T00:01:00Z" />);
    const hover = mocks.zr.on.mock.calls.find(([name]) => name === 'mousemove')?.[1];
    act(() => hover({ offsetX: 45, offsetY: 10 }));
    expect(mocks.instance.dispatchAction).toHaveBeenCalledWith({ type: 'highlight', seriesId: 'line-1-0', dataIndex: 0 });
    mocks.instance.dispatchAction.mockClear();
    view.rerender(<MeasurementHistoryGraph series={[...points, booleanSeries]} since="1970-01-01T00:00:00Z" until="1970-01-01T00:01:00Z" />);
    expect(mocks.instance.dispatchAction).toHaveBeenCalledWith({ type: 'highlight', seriesId: 'line-1-0', dataIndex: 0 });
    fireEvent.mouseLeave(screen.getByRole('group').firstElementChild!);
    expect(mocks.instance.dispatchAction).toHaveBeenCalledWith({ type: 'downplay', seriesId: 'line-1-0', dataIndex: 0 });
  });

});
