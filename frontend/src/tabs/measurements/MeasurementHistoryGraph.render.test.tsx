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
