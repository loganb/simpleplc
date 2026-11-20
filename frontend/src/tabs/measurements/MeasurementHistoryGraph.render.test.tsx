// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import type { ECharts } from 'echarts/core';
import type { HistoryGraphSeries } from './historyTypes';

const renderer = vi.hoisted(() => ({ chart: null as ECharts | null, width: 1000, height: 320 }));
// Exercise ECharts' real SVG/custom-series renderer, with deterministic SSR size.
vi.mock('echarts/core', async importOriginal => {
  const real = await importOriginal<typeof import('echarts/core')>();
  real.setPlatformAPI({ measureText: (text: string) => ({ width: text.length * 7 }) });
  return { ...real, init: () => {
    renderer.chart = real.init(null, undefined, { renderer: 'svg', ssr: true, width: renderer.width, height: renderer.height });
    const resize = renderer.chart.resize.bind(renderer.chart);
    renderer.chart.resize = () => resize({ width: renderer.width, height: renderer.height });
    return renderer.chart;
  } };
});
import { MeasurementHistoryGraph } from './MeasurementHistoryGraph';
afterEach(cleanup);
const at = (n: number) => new Date(n * 1000).toISOString();
const source = { value_type: 'number' as const, logic_instance_id: 1, logic_instance_name: 'I', logic_diagram_id: 1, logic_diagram_name: 'D', source_type: 'LogicOutput' as const, source_id: 1, source_name: 'Flow' };

describe('measurement graph SVG rendering', () => {
  it('renders right-axis lines, bands and both marker types at phone width', () => {
    renderer.width = 342; renderer.height = 240;
    const base = { measurementId: 2, name: 'Pressure', color: '#123456', axis: 'right' as const };
    const raw = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, measurement_id: 2, kind: 'sample' as const, start: at(i), end: at(i), recorded_at: at(i), source, count: 1, null_count: 0, value: i === 9 ? 200000 : 1 }));
    const bucket = { id: 'b', measurement_id: 2, kind: 'bucket' as const, start: at(10), end: at(12), source, count: 20, null_count: 0, statistics: { min: -200000, max: 200000, mean: 1 }, last_known: false, coverage: 'summary' as const, gap_detail: 'minute' as const };
    const left: HistoryGraphSeries = { measurementId: 1, name: 'Temperature', color: '#abcdef', points: raw.slice(0, 2).map(p => ({ ...p, measurement_id: 1, value: 100000 })) };
    render(<MeasurementHistoryGraph series={[left, { ...base, points: [...raw, bucket] }]} since={at(0)} until={at(12)} />);
    const svg = renderer.chart!.renderToSVGString();
    expect(svg).not.toMatch(/NaN|Infinity/);
    const option = renderer.chart!.getOption();
    const series = option.series as { id: string; yAxisIndex: number; data: unknown[] }[];
    for (const id of ['line-2-0', 'bucket-2', 'bucket-line-2-0', 'clipped-2']) expect(series.find(item => item.id === id)?.yAxisIndex).toBe(1);
    expect(series.find(item => item.id === 'clipped-2')?.data).toEqual(expect.arrayContaining([[9000, 1, 0], [11000, 1, 1], [11000, -1, 1]]));
    const axes = option.yAxis as { min: number; max: number }[];
    expect(axes[0].min).toBeGreaterThan(100);
    expect(axes[1].max).toBe(2);
    expect(svg).toContain('100,000');
    fireEvent.click(screen.getByRole('checkbox', { name: 'show full range' }));
    expect((renderer.chart!.getOption().series as { id: string }[]).some(item => item.id === 'clipped-2')).toBe(false);
  });
  it.each([['sample', 1000, 320], ['bucket', 1000, 320], ['sample', 342, 240], ['bucket', 342, 240]] as const)('renders %s spikes at %ipx with the real renderer', (kind, width, height) => {
    renderer.width = width;
    renderer.height = height;
    const series: HistoryGraphSeries = { measurementId: 1, name: 'Flow', color: '#2563eb', points: Array.from({ length: 12 }, (_, i) => {
      const value = i === 9 ? 200000 : i === 10 ? -200000 : 1;
      const base = { id: String(i), measurement_id: 1, start: at(i), end: at(kind === 'bucket' ? i + 1 : i), source, count: 1, null_count: 0 };
      return kind === 'sample' ? { ...base, kind, recorded_at: at(i), value } : { ...base, kind, statistics: { min: value, max: value, mean: value }, last_known: false, coverage: 'summary' as const, gap_detail: 'minute' as const };
    }) };
    render(<MeasurementHistoryGraph series={[series]} since={at(0)} until={at(12)} />);
    const svg = renderer.chart!.renderToSVGString();
    expect(svg).toContain('<svg');
    expect(svg).not.toMatch(/NaN|Infinity/);
    expect(screen.getByRole('note').textContent).toContain('summary intervals (midpoints)');
    // Inspect actual rendered custom elements, rather than merely setOption args.
    const model = (renderer.chart as unknown as { getModel(): { getSeriesByIndex(index: number): { getData(): { count(): number; getItemGraphicEl(index: number): { type: string; shape: { points: number[][] }; style: { fill: string } } } } } }).getModel();
    const option = renderer.chart!.getOption();
    const allSeries = option.series as { id: string }[];
    const index = allSeries.findIndex(item => item.id === 'clipped-1');
    expect(index).toBeGreaterThanOrEqual(0);
    const data = model.getSeriesByIndex(index).getData();
    expect(data.count()).toBe(2);
    const upper = data.getItemGraphicEl(0), lower = data.getItemGraphicEl(1);
    expect(upper.type).toBe('polygon');
    expect(lower.type).toBe('polygon');
    expect(upper.shape.points[0][1]).toBe(15);
    expect(lower.shape.points[0][1]).toBe(height - 45);
    expect(upper.style.fill).toBe(kind === 'bucket' ? 'none' : '#2563eb');
    fireEvent.click(screen.getByRole('checkbox', { name: 'show full range' }));
    expect((renderer.chart!.getOption().series as { id: string }[]).some(item => item.id === 'clipped-1')).toBe(false);
    const fullSvg = renderer.chart!.renderToSVGString();
    expect(fullSvg).toContain('200,000');
  });
});
