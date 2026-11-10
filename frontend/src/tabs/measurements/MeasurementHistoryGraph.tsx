import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import * as echarts from 'echarts/core';
import { CustomChart, LineChart } from 'echarts/charts';
import { AriaComponent, GridComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { MeasurementHistoryGraphProps, MeasurementHistoryPointFields } from './historyTypes';
import { buildHistorySeries, numericDomain } from './historySeries';

echarts.use([CustomChart, LineChart, GridComponent, TooltipComponent, AriaComponent, SVGRenderer]);
const formatNumber = (value: number) => new Intl.NumberFormat(undefined, { maximumSignificantDigits: 6 }).format(value);
const formatTime = (time: number) => new Date(time).toLocaleString();
const pointDescription = (point: MeasurementHistoryPointFields) => {
  const source = `${point.source.logic_instance_name} · ${point.source.source_name}`;
  if (point.kind === 'sample') return `Sample at ${formatTime(Date.parse(point.start))}: ${point.value === null ? 'unavailable' : typeof point.value === 'number' ? formatNumber(point.value) : String(point.value)} · ${source}`;
  const stats = point.statistics;
  const value = point.source.value_type === 'boolean' ? `Fraction of samples true: ${stats.true_fraction === undefined ? 'unavailable' : `${formatNumber(stats.true_fraction * 100)}%`}` : `Mean: ${stats.mean === undefined ? 'unavailable' : formatNumber(stats.mean)}, min: ${stats.min === undefined ? 'unavailable' : formatNumber(stats.min)}, max: ${stats.max === undefined ? 'unavailable' : formatNumber(stats.max)}`;
  const last = point.last_known ? (stats.last === null || stats.last === undefined ? 'unavailable' : typeof stats.last === 'number' ? formatNumber(stats.last) : String(stats.last)) : 'unknown';
  const label = point.coverage === 'raw' ? 'Raw-sample summary' : point.coverage === 'mixed' ? 'Combined summary' : 'Minute summary';
  return `${label} ${formatTime(Date.parse(point.start))}–${formatTime(Date.parse(point.end))} · ${value} · latest: ${last} · ${point.count} samples${point.null_count ? `, ${point.null_count} unavailable` : ''} · ${source}`;
};

export function MeasurementHistoryGraph({ series, since, until, onPlotWidth }: MeasurementHistoryGraphProps) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const callback = useRef(onPlotWidth);
  callback.current = onPlotWidth;
  const transformed = useMemo(() => series.map(buildHistorySeries), [series]);
  const times = useMemo(() => {
    const from = Date.parse(since), to = Date.parse(until);
    return [...new Set(series.flatMap(s => s.points.flatMap(p => {
      const start = Date.parse(p.start), end = Date.parse(p.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > to || (p.kind === 'bucket' ? end <= from : start < from)) return [];
      return [Math.max(start, from)];
    })))].sort((a, b) => a - b);
  }, [series, since, until]);
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [keyboardDetails, setKeyboardDetails] = useState(false);
  const timesRef = useRef(times); timesRef.current = times;
  const seriesRef = useRef(series); seriesRef.current = series;
  useEffect(() => {
    if (!container.current) return;
    const element = container.current;
    const instance = echarts.init(element, undefined, { renderer: 'svg' });
    chart.current = instance;
    const choose = (event: { offsetX: number; offsetY: number }) => {
      if (!instance.containPixel({ gridIndex: 0 }, [event.offsetX, event.offsetY])) return;
      const time = instance.convertFromPixel({ xAxisIndex: 0 }, event.offsetX) as number;
      const nearest = timesRef.current.reduce<number | null>((best, next) => best === null || Math.abs(next - time) < Math.abs(best - time) ? next : best, null);
      const inBucket = seriesRef.current.some(s => s.points.some(p => p.kind === 'bucket' && Date.parse(p.start) <= time && time < Date.parse(p.end)));
      setKeyboardDetails(false);
      if (inBucket) setSelectedTime(time);
      else if (nearest !== null) setSelectedTime(nearest);
    };
    let lastHover = -Infinity;
    const hover = (event: { offsetX: number; offsetY: number }) => {
      const now = performance.now();
      if (now - lastHover < 75) return;
      lastHover = now;
      choose(event);
    };
    instance.getZr().on('click', choose);
    instance.getZr().on('mousemove', hover);
    const resize = () => {
      instance.resize();
      callback.current?.(Math.max(1, element.clientWidth - 75));
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(element);
    resize();
    return () => { observer?.disconnect(); instance.getZr().off('click', choose); instance.getZr().off('mousemove', hover); instance.dispose(); chart.current = null; };
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
    instance.setOption({ animation: false, aria: { enabled: true, label: { description: 'Measurement history chart. Use left and right arrow keys to explore readings.' } }, grid: { left: 55, right: 20, top: 15, bottom: 45 }, xAxis: { type: 'time', min: Date.parse(since), max: Date.parse(until), axisLabel: { hideOverlap: true, formatter: (value: number) => timeFormat.format(new Date(value)) }, axisPointer: { show: true, snap: false } }, yAxis: { type: 'value', min: domain?.[0] ?? 0, max: domain?.[1] ?? 1, show: domain !== null, axisLabel: { showMinLabel: false, showMaxLabel: false, formatter: (value: number) => new Intl.NumberFormat(undefined, { maximumSignificantDigits: 4 }).format(value) } }, tooltip: { trigger: 'axis', showContent: false, triggerOn: 'mousemove|click' }, series: chartSeries }, { notMerge: true });
    if (container.current) callback.current?.(Math.max(1, container.current.clientWidth - 75));
  }, [transformed, since, until]);
  const activeTime = selectedTime !== null && selectedTime >= Date.parse(since) && selectedTime <= Date.parse(until) ? selectedTime : times[0];
  const details = activeTime === undefined ? [] : series.flatMap(s => {
    const buckets = s.points.filter(p => p.kind === 'bucket' && Date.parse(p.start) <= activeTime && activeTime < Date.parse(p.end));
    const samples = s.points.filter(p => p.kind === 'sample');
    const nearest = samples.reduce<MeasurementHistoryPointFields | undefined>((best, point) => !best || Math.abs(Date.parse(point.start) - activeTime) < Math.abs(Date.parse(best.start) - activeTime) ? point : best, undefined);
    return [...buckets, ...(nearest ? [nearest] : [])].map(point => ({ name: s.name, point }));
  });
  const notes = [
    details.some(({ point }) => point.kind === 'bucket' && point.gap_detail === 'minute') ? 'Gaps within summarized minutes are unknown.' : '',
    details.some(({ point }) => point.kind === 'bucket' && point.source.value_type === 'boolean') ? 'Fractions describe samples, not elapsed time on.' : '',
    details.some(({ point }) => point.kind === 'sample' && point.source.value_type === 'boolean') ? 'Boolean samples show observed states, not exact transition times.' : '',
  ].filter(Boolean);
  return <div>
    <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Measurement legend">{series.map(s => <span key={s.measurementId}><span aria-hidden="true" style={{ color: s.color }}>●</span> {s.name}</span>)}</div>
    <div tabIndex={0} role="group" aria-label="Measurement history. Use left and right arrow keys to explore readings." onKeyDown={event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const next = event.key === 'ArrowRight'
        ? times.find(time => time > activeTime) ?? times[times.length - 1]
        : [...times].reverse().find(time => time < activeTime) ?? times[0];
      setKeyboardDetails(true);
      setSelectedTime(next ?? null);
      if (next !== undefined && chart.current) chart.current.dispatchAction({ type: 'updateAxisPointer', x: chart.current.convertToPixel({ xAxisIndex: 0 }, next), y: 30 });
    }}>
      <div ref={container} class="h-60 w-full sm:h-80" />
    </div>
    <div aria-live={keyboardDetails ? "polite" : "off"} class="text-sm text-text-muted">{activeTime === undefined ? null : <><strong>{formatTime(activeTime)}</strong>{details.map(({ name, point }) => <div key={`${name}-${point.id}`}><span class="font-semibold">{name}:</span> {pointDescription(point)}</div>)}{notes.length > 0 && <p class="mt-1">{notes.join(' ')}</p>}</>}</div>
  </div>;
}
