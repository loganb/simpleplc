import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import * as echarts from 'echarts/core';
import { CustomChart, LineChart } from 'echarts/charts';
import { AriaComponent, GridComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { MeasurementHistoryGraphProps, MeasurementHistoryPointFields } from './historyTypes';
import { buildHistorySeries, numericDomain } from './historySeries';

echarts.use([CustomChart, LineChart, GridComponent, TooltipComponent, AriaComponent, SVGRenderer]);
const formatNumber = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
const formatTime = (time: number) => new Date(time).toLocaleString();
const pointDescription = (point: MeasurementHistoryPointFields, unitsFor?: MeasurementHistoryGraphProps['unitsFor']) => {
  const units = point.source.value_type === 'number' ? unitsFor?.(point.source) : null;
  const suffix = units ? ` ${units}` : '';
  if (point.kind === 'sample') {
    if (point.value === null) return '—';
    if (typeof point.value === 'boolean') return point.value ? 'On' : 'Off';
    return `${formatNumber(point.value)}${suffix}`;
  }
  const stats = point.statistics;
  if (point.source.value_type === 'boolean') return stats.true_fraction == null ? '—' : `${formatNumber(stats.true_fraction * 100)}% on`;
  if (stats.mean == null) return '—';
  const range = stats.min != null && stats.max != null && stats.min !== stats.max ? ` (${formatNumber(stats.min)}–${formatNumber(stats.max)})` : '';
  return `${formatNumber(stats.mean)}${suffix}${range}`;
};

export function MeasurementHistoryGraph({ series, since, until, onPlotWidth, unitsFor }: MeasurementHistoryGraphProps) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const cursorTime = useRef<number | null>(null);
  const highlighted = useRef<{ seriesId: string; dataIndex: number }[]>([]);
  const clearHighlights = (instance: echarts.ECharts) => {
    highlighted.current.forEach(item => instance.dispatchAction({ type: 'downplay', ...item }));
    highlighted.current = [];
  };
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const restoreCursor = useRef<() => void>(() => {});
  const callback = useRef(onPlotWidth);
  callback.current = onPlotWidth;
  const transformed = useMemo(() => series.map(item => buildHistorySeries(item, { since: Date.parse(since), until: Date.parse(until) })), [series, since, until]);
  const times = useMemo(() => {
    const from = Date.parse(since), to = Date.parse(until);
    return [...new Set([...transformed.flatMap(s => [...s.lines.flatMap(line => line.points.map(point => point.time)), ...s.booleans.flatMap(interval => [interval.start, interval.end])]), ...series.flatMap(s => s.points.flatMap(p => {
      const start = Date.parse(p.start), end = Date.parse(p.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > to || (p.kind === 'bucket' ? end <= from : start < from)) return [];
      return [Math.max(start, from)];
    }))])].sort((a, b) => a - b);
  }, [series, transformed, since, until]);
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [keyboardDetails, setKeyboardDetails] = useState(false);
  const highlightNumeric = (instance: echarts.ECharts, time: number) => {
    clearHighlights(instance);
    for (const item of transformed) {
      const candidates = [
        ...item.lines.map((line, i) => ({ line, seriesId: `line-${item.series.measurementId}-${i}` })),
        ...item.bucketLines.map((line, i) => ({ line, seriesId: `bucket-line-${item.series.measurementId}-${i}` })),
      ];
      let closest: { seriesId: string; dataIndex: number; distance: number } | undefined;
      for (const { line, seriesId } of candidates) line.points.forEach((point, dataIndex) => {
        const distance = Math.abs(point.time - time);
        if (!closest || distance < closest.distance) closest = { seriesId, dataIndex, distance };
      });
      if (closest) {
        const { seriesId, dataIndex } = closest;
        highlighted.current.push({ seriesId, dataIndex });
        instance.dispatchAction({ type: 'highlight', seriesId, dataIndex });
      }
    }
  };
  const highlightRef = useRef(highlightNumeric); highlightRef.current = highlightNumeric;
  const selectPointer = (instance: echarts.ECharts, x: number, y: number) => {
    if (!instance.containPixel({ gridIndex: 0 }, [x, y])) return;
    const time = instance.convertFromPixel({ xAxisIndex: 0 }, x) as number;
    if (Number.isFinite(time)) {
      cursorTime.current = time;
      setSelectedTime(time);
      instance.dispatchAction({ type: 'updateAxisPointer', x, y });
      highlightRef.current(instance, time);
    }
  };
  const selectPointerRef = useRef(selectPointer); selectPointerRef.current = selectPointer;
  restoreCursor.current = () => {
    const instance = chart.current, time = cursorTime.current;
    if (!instance) return;
    if (pointer.current) { selectPointerRef.current(instance, pointer.current.x, pointer.current.y); return; }
    if (time === null) return;
    if (time < Date.parse(since) || time > Date.parse(until)) { cursorTime.current = null; return; }
    instance.dispatchAction({ type: 'updateAxisPointer', x: instance.convertToPixel({ xAxisIndex: 0 }, time), y: 30 });
    highlightRef.current(instance, time);
  };
  useEffect(() => {
    if (!container.current) return;
    const element = container.current;
    const instance = echarts.init(element, undefined, { renderer: 'svg' });
    chart.current = instance;
    const choose = (event: { offsetX: number; offsetY: number }) => {
      if (!instance.containPixel({ gridIndex: 0 }, [event.offsetX, event.offsetY])) return;
      pointer.current = { x: event.offsetX, y: event.offsetY };
      setKeyboardDetails(false);
      selectPointerRef.current(instance, event.offsetX, event.offsetY);
    };
    let lastHover = -Infinity;
    const hover = (event: { offsetX: number; offsetY: number }) => {
      const now = performance.now();
      if (now - lastHover < 75) return;
      lastHover = now;
      choose(event);
    };
    const leave = () => { pointer.current = null; cursorTime.current = null; instance.dispatchAction({ type: 'updateAxisPointer', currTrigger: 'leave' }); clearHighlights(instance); };
    element.addEventListener('mouseleave', leave);
    instance.getZr().on('click', choose);
    instance.getZr().on('mousemove', hover);
    const resize = () => {
      instance.resize();
      restoreCursor.current();
      callback.current?.(Math.max(1, element.clientWidth - 75));
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(element);
    resize();
    return () => { element.removeEventListener('mouseleave', leave); observer?.disconnect(); instance.getZr().off('click', choose); instance.getZr().off('mousemove', hover); instance.dispose(); chart.current = null; };
  }, []);
  useEffect(() => {
    const instance = chart.current;
    if (!instance) return;
    const domain = numericDomain(transformed);
    // ECharts custom series call these functions with its coordinate conversion API.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chartSeries: any[] = [];
    for (const item of transformed) {
      if (item.booleans.length) chartSeries.push({
        id: `boolean-${item.series.measurementId}`, type: 'custom', silent: true, z: 1, encode: { x: [0, 1], y: [] },
        data: item.booleans.map(interval => [interval.start, interval.end, interval.fraction, interval.point.kind === 'bucket' ? 1 : 0]),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        renderItem: (params: any, api: any) => {
          const x1 = api.coord([api.value(0), 0])[0], x2 = api.coord([api.value(1), 0])[0];
          const shape = echarts.graphic.clipRectByRect({ x: x1, y: params.coordSys.y, width: x2 - x1, height: params.coordSys.height }, params.coordSys);
          return shape && { type: 'rect', shape, style: { fill: item.series.color, fillOpacity: 0.12 * api.value(2), stroke: 'none' } };
        },
      });
      if (item.buckets.length) chartSeries.push({
        id: `bucket-${item.series.measurementId}`, type: 'custom', silent: true, z: 2, encode: { x: [0, 1], y: [2, 3, 4] },
        data: item.buckets.map(bucket => [bucket.start, bucket.end, bucket.min, bucket.max, bucket.mean]),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        renderItem: (params: any, api: any) => {
          const a = api.coord([api.value(0), api.value(3)]), b = api.coord([api.value(1), api.value(2)]);
          const band = echarts.graphic.clipRectByRect({ x: a[0], y: a[1], width: b[0] - a[0], height: b[1] - a[1] }, params.coordSys);
          return band && { type: 'rect', shape: band, style: { fill: item.series.color, opacity: 0.12 } };
        },
      });
      item.bucketLines.forEach((line, i) => chartSeries.push({ id: `bucket-line-${item.series.measurementId}-${i}`, type: 'line', data: line.points.map(p => [p.time, p.value]), showSymbol: false, smooth: false, connectNulls: false, lineStyle: { color: item.series.color, width: 2 }, z: 3 }));
      item.lines.forEach((line, i) => chartSeries.push({ id: `line-${item.series.measurementId}-${i}`, type: 'line', data: line.points.map(p => [p.time, p.value]), showSymbol: line.points.length === 1, symbolSize: 6, smooth: false, connectNulls: false, lineStyle: { color: item.series.color, width: 2 }, itemStyle: { color: item.series.color }, z: 3 }));
    }
    const duration = Date.parse(until) - Date.parse(since);
    const timeFormat = new Intl.DateTimeFormat(undefined, duration <= 600_000 ? { hour: 'numeric', minute: '2-digit', second: '2-digit' } : duration <= 86_400_000 ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    instance.setOption({ animation: false, aria: { enabled: true, label: { description: 'Measurement history chart. Use left and right arrow keys to explore readings.' } }, grid: { left: 55, right: 20, top: 15, bottom: 45 }, xAxis: { type: 'time', min: Date.parse(since), max: Date.parse(until), axisLabel: { hideOverlap: true, formatter: (value: number) => timeFormat.format(new Date(value)) }, axisPointer: { show: true, snap: false } }, yAxis: { type: 'value', min: domain?.[0] ?? 0, max: domain?.[1] ?? 1, show: domain !== null, axisLabel: { showMinLabel: false, showMaxLabel: false, formatter: (value: number) => new Intl.NumberFormat(undefined, { maximumSignificantDigits: 4 }).format(value) } }, tooltip: { trigger: 'axis', showContent: false, triggerOn: 'none' }, series: chartSeries }, { notMerge: true });
    restoreCursor.current();
    if (container.current) callback.current?.(Math.max(1, container.current.clientWidth - 75));
  }, [transformed, since, until]);
  const activeTime = selectedTime !== null && selectedTime >= Date.parse(since) && selectedTime <= Date.parse(until) ? selectedTime : times[0];
  const details = activeTime === undefined ? [] : series.flatMap((s, index) => {
    const buckets = s.points.filter(p => p.kind === 'bucket' && Date.parse(p.start) <= activeTime && activeTime < Date.parse(p.end));
    const visible = transformed[index];
    const intersects = visible.lines.some(line => line.points.length > 1 && line.points[0].time <= activeTime && activeTime <= line.points[line.points.length - 1].time)
      || visible.booleans.some(interval => interval.point.kind === 'sample' && interval.start <= activeTime && activeTime <= interval.end);
    const samples = s.points.filter(p => p.kind === 'sample' && (intersects || (Date.parse(p.start) >= Date.parse(since) && Date.parse(p.start) <= Date.parse(until))));
    const nearest = samples.reduce<MeasurementHistoryPointFields | undefined>((best, point) => !best || Math.abs(Date.parse(point.start) - activeTime) < Math.abs(Date.parse(best.start) - activeTime) ? point : best, undefined);
    const selected = buckets.length ? buckets : nearest ? [nearest] : [];
    return selected.length ? [{ name: s.name, color: s.color, points: selected }] : [];
  });
  return <div>
    <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Measurement legend">{series.map(s => <span key={s.measurementId}><span aria-hidden="true" style={{ color: s.color }}>●</span> {s.name}</span>)}</div>
    <div tabIndex={0} role="group" aria-label="Measurement history. Use left and right arrow keys to explore readings." onKeyDown={event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const next = event.key === 'ArrowRight'
        ? times.find(time => time > activeTime) ?? times[times.length - 1]
        : [...times].reverse().find(time => time < activeTime) ?? times[0];
      setKeyboardDetails(true);
      pointer.current = null;
      cursorTime.current = next ?? null;
      setSelectedTime(next ?? null);
      if (next !== undefined && chart.current) {
        chart.current.dispatchAction({ type: 'updateAxisPointer', x: chart.current.convertToPixel({ xAxisIndex: 0 }, next), y: 30 });
        highlightRef.current(chart.current, next);
      }
    }}>
      <div ref={container} class="h-60 w-full sm:h-80" />
    </div>
    <div role="region" aria-label="Cursor values" aria-live={keyboardDetails ? "polite" : "off"} class="text-sm text-text-muted">{activeTime === undefined ? null : <><strong>{formatTime(activeTime)}</strong><div class="flex flex-wrap gap-x-4 gap-y-1">{details.map(({ name, color, points }) => <span key={name}><span aria-hidden="true" class="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} /><span class="font-semibold">{name}:</span> <span>{points.map(point => pointDescription(point, unitsFor)).join(' / ')}</span></span>)}</div></>}</div>
  </div>;
}
