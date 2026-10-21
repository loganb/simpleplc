import { useEffect, useRef, useState } from 'preact/hooks';
import { useLoaders } from '../../lib/DataLoader2';
import { useTxnStatus } from '../../components/useTxnStatus';
import type { ExistingRecord, ReifiedQueryResult, Txn } from '../../lib/RestfulModelStore';
import { Measurement, MeasurementSeries, Store } from '../../store';
import type {
  LogicDiagramFields, LogicInputFields, LogicInstanceFields, LogicOutputFields,
  MeasurementFields, MeasurementPoint, MeasurementSeriesFields,
} from '../../store';
import type { MeasurementsUXState } from '../../uxTree';

type RecordOf<T extends { id: number }> = ExistingRecord<T>;
type SourceFilter = { logic_instance_id: number; logic_input_id?: number; logic_output_id?: number };
const RANGES = [
  { label: '15 minutes', seconds: 900 }, { label: '1 hour', seconds: 3600 },
  { label: '24 hours', seconds: 86400 }, { label: '7 days', seconds: 604800 },
  { label: '30 days', seconds: 2592000 }, { label: '2 years', seconds: 63072000 },
];

export function MeasurementsTab({ measurements, instances, diagrams, inputs, outputs, ux, onRefresh }: {
  measurements: ReifiedQueryResult<MeasurementFields>;
  instances: ReifiedQueryResult<LogicInstanceFields>;
  diagrams: ReifiedQueryResult<LogicDiagramFields>;
  inputs: ReifiedQueryResult<LogicInputFields>;
  outputs: ReifiedQueryResult<LogicOutputFields>;
  ux: MeasurementsUXState;
  onRefresh: () => void;
}) {
  const { selectedMeasurementId, sourceFilter } = useLoaders(() => ({
    selectedMeasurementId: ux.get('selectedMeasurementId') ?? null,
    sourceFilter: ux.get('sourceFilter') ?? null,
  }), [ux], [ux]);
  const all = found(measurements);
  const visible = sourceFilter ? all.filter(measurement => matchesSource(measurement, sourceFilter)) : all;
  const selected = visible.find(measurement => measurement.id === selectedMeasurementId) ?? visible[0] ?? null;
  const foundInstances = found(instances);
  const foundInputs = found(inputs);
  const foundOutputs = found(outputs);
  const foundDiagrams = found(diagrams);
  const [editing, setEditing] = useState<'new' | 'selected' | null>(null);
  const [rangeSeconds, setRangeSeconds] = useState(3600);

  return <section class="space-y-5">
    <div class="flex items-start justify-between gap-4">
      <div><h2 class="text-lg font-semibold">Measurements</h2>
        <p class="text-sm text-text-muted">Record evaluated input and output values over time.</p></div>
      <button class="rounded bg-active px-3 py-1.5 text-sm font-medium text-white" onClick={() => setEditing('new')}>+ New measurement</button>
    </div>
    {sourceFilter && <div class="flex items-center gap-3 rounded bg-active-bg px-3 py-2 text-sm">
      <span>Showing measurements attached to this instance port</span>
      <button class="text-active underline" onClick={() => ux.set('sourceFilter', null)}>Show all</button>
    </div>}
    {editing && <MeasurementForm key={editing === 'selected' ? selected?.id : 'new'}
      measurement={editing === 'selected' ? selected : null} initialSource={sourceFilter}
      instances={foundInstances} diagrams={foundDiagrams} inputs={foundInputs} outputs={foundOutputs}
      onClose={() => setEditing(null)} onSaved={onRefresh} />}
    {!measurements._loaded ? <p>Loading measurements…</p> : visible.length === 0 ?
      <p class="rounded border border-dashed border-border p-5 text-text-muted">No measurements here yet.</p> :
      <div class="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside class="overflow-hidden rounded-lg border border-border">
          <h3 class="border-b border-border px-4 py-3 text-sm font-semibold">Measurements</h3>
          {visible.map(measurement => <button key={measurement.id} class={`block w-full border-l-4 px-4 py-3 text-left ${selected?.id === measurement.id ? 'border-active bg-active-bg' : 'border-transparent'}`}
            onClick={() => ux.set('selectedMeasurementId', measurement.id)}>
            <span class="block truncate font-semibold">{measurement.name}</span>
            <span class="block truncate text-xs text-text-muted">{sourceLabel(measurement, foundInstances, foundInputs, foundOutputs)}</span>
          </button>)}
        </aside>
        {selected && <div class="space-y-4 rounded-lg border border-border p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div><h3 class="text-xl font-semibold">{selected.name}</h3>
              <p class="text-sm text-text-muted">{sourceLabel(selected, foundInstances, foundInputs, foundOutputs)}{selected.units ? ` · ${selected.units}` : ''}</p></div>
            <button class="rounded border border-border px-3 py-1.5 text-sm" onClick={() => setEditing('selected')}>Edit</button>
          </div>
          <label class="block w-fit text-sm">Time range
            <select class="ml-2 rounded border border-border bg-surface px-2 py-1" value={rangeSeconds}
              onChange={event => setRangeSeconds(Number((event.target as HTMLSelectElement).value))}>
              {RANGES.map(range => <option key={range.seconds} value={range.seconds}>{range.label}</option>)}
            </select>
          </label>
          <MeasurementHistory key={`${selected.id}:${rangeSeconds}`} measurement={selected} rangeSeconds={rangeSeconds} />
        </div>}
      </div>}
  </section>;
}

function MeasurementForm({ measurement, initialSource, instances, diagrams, inputs, outputs, onClose, onSaved }: {
  measurement: RecordOf<MeasurementFields> | null;
  initialSource: SourceFilter | null;
  instances: RecordOf<LogicInstanceFields>[];
  diagrams: RecordOf<LogicDiagramFields>[];
  inputs: RecordOf<LogicInputFields>[];
  outputs: RecordOf<LogicOutputFields>[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(measurement?.name ?? '');
  const [units, setUnits] = useState(measurement?.units ?? '');
  const initialInstance = measurement?.logic_instance_id ?? initialSource?.logic_instance_id ?? null;
  const [instanceId, setInstanceId] = useState<number | null>(initialInstance);
  const initialPort = measurement?.logic_input_id ? `input:${measurement.logic_input_id}` :
    measurement?.logic_output_id ? `output:${measurement.logic_output_id}` :
      initialSource?.logic_input_id ? `input:${initialSource.logic_input_id}` :
        initialSource?.logic_output_id ? `output:${initialSource.logic_output_id}` : '';
  const [port, setPort] = useState(initialPort);
  const [txn, setTxn] = useState<Txn | undefined>();
  const [deleting, setDeleting] = useState(false);
  const handled = useRef<number | null>(null);
  const { txnResult, saving } = useTxnStatus(txn);
  useEffect(() => {
    if (!txnResult || txnResult.seq === handled.current) return;
    handled.current = txnResult.seq;
    if (txnResult.status === 'succeeded') { onSaved(); onClose(); }
    else setDeleting(false);
  }, [txnResult, onSaved, onClose]);
  const instance = instances.find(candidate => candidate.id === instanceId);
  const availableInputs = inputs.filter(input => input.logic_diagram_id === instance?.logic_diagram_id);
  const availableOutputs = outputs.filter(output => output.logic_diagram_id === instance?.logic_diagram_id);
  const save = () => {
    const [kind, id] = port.split(':');
    const fields = {
      name, units: units || null, logic_instance_id: instanceId,
      logic_input_id: kind === 'input' ? Number(id) : null,
      logic_output_id: kind === 'output' ? Number(id) : null,
    };
    setTxn(measurement ? Store.m(Measurement).patch(measurement.id, fields) : Store.m(Measurement).create(fields));
  };
  return <div class="space-y-3 rounded-lg border border-border bg-surface-alt p-4">
    <h3 class="font-semibold">{measurement ? 'Edit measurement' : 'New measurement'}</h3>
    <div class="grid gap-3 md:grid-cols-4">
      <label class="text-sm">Name<input class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5" value={name}
        onInput={event => setName((event.target as HTMLInputElement).value)} /></label>
      <label class="text-sm">Units<input class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5" value={units}
        onInput={event => setUnits((event.target as HTMLInputElement).value)} /></label>
      <label class="text-sm">Instance<select class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5" value={instanceId ?? ''}
        onChange={event => { const value = (event.target as HTMLSelectElement).value; setInstanceId(value ? Number(value) : null); setPort(''); }}>
        <option value="">Detached</option>{instances.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name} · {diagrams.find(diagram => diagram.id === candidate.logic_diagram_id)?.name ?? 'Diagram'}</option>)}
      </select></label>
      <label class="text-sm">Port<select class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5" value={port} disabled={!instanceId}
        onChange={event => setPort((event.target as HTMLSelectElement).value)}>
        <option value="">Select port…</option>
        {availableInputs.map(input => <option key={`input:${input.id}`} value={`input:${input.id}`}>Input · {input.name}</option>)}
        {availableOutputs.map(output => <option key={`output:${output.id}`} value={`output:${output.id}`}>Output · {output.name}</option>)}
      </select></label>
    </div>
    {txnResult?.status === 'error' && <p role="alert" class="text-sm text-error">Measurement could not be saved.</p>}
    <div class="flex gap-2">
      <button class="rounded bg-active px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={saving || !name.trim() || (!!instanceId && !port)} onClick={save}>{saving && !deleting ? 'Saving…' : 'Save'}</button>
      <button class="rounded border border-border px-3 py-1.5 text-sm" onClick={onClose}>Cancel</button>
      {measurement && <button class="ml-auto rounded border border-error px-3 py-1.5 text-sm text-error" disabled={saving}
        onClick={() => { if (window.confirm(`Delete measurement "${measurement.name}" and its history?`)) { setDeleting(true); setTxn(Store.m(Measurement).destroy(measurement.id)); } }}>Delete measurement</button>}
    </div>
  </div>;
}

function MeasurementHistory({ measurement, rangeSeconds }: { measurement: RecordOf<MeasurementFields>; rangeSeconds: number }) {
  const [endMs, setEndMs] = useState(Date.now());
  const [following, setFollowing] = useState(true);
  useEffect(() => {
    if (!following) return;
    const timer = window.setInterval(() => setEndMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [following]);
  const since = new Date(endMs - rangeSeconds * 1000).toISOString();
  const until = new Date(endMs).toISOString();
  const series = useLoaders(() => Store.m(MeasurementSeries).queryFor(null, {
    measurement_id: measurement.id, since, until, max_points: 1000,
  }), [Store], [measurement.id, since, until]);
  const loadedSeries = series._loaded ? series.find(item => item._found) as ExistingRecord<MeasurementSeriesFields> | undefined : undefined;
  const controls = <div class="flex flex-wrap items-end gap-2 text-sm">
    <button class="rounded border border-border px-2 py-1" onClick={() => { setFollowing(false); setEndMs(value => value - rangeSeconds * 1000); }}>← Previous</button>
    <button class="rounded border border-border px-2 py-1" disabled={following} onClick={() => setEndMs(value => {
      const next = value + rangeSeconds * 1000;
      if (next >= Date.now()) { setFollowing(true); return Date.now(); }
      return next;
    })}>Next →</button>
    <button class="rounded border border-border px-2 py-1" onClick={() => { setFollowing(true); setEndMs(Date.now()); }}>Now</button>
    <label>Window end
      <input aria-label="Window end" type="datetime-local" class="ml-2 rounded border border-border bg-surface px-2 py-1"
        value={toLocalInput(endMs)} onChange={event => {
          const value = Date.parse((event.target as HTMLInputElement).value);
          if (!Number.isNaN(value)) { setFollowing(false); setEndMs(Math.min(value, Date.now())); }
        }} />
    </label>
  </div>;
  if (!series._loaded) return <div class="space-y-3">{controls}<p class="text-sm text-text-muted">Loading history…</p></div>;
  if (!loadedSeries || loadedSeries.points.length === 0) return <div class="space-y-3">{controls}<p class="rounded border border-dashed border-border p-5 text-sm text-text-muted">No recorded values in this range.</p></div>;
  return <div class="space-y-4">
    {controls}
    <p class="text-xs text-text-muted">Exact points are retained for 48 hours. Older points summarize one-minute samples.</p>
    <MeasurementChart points={loadedSeries.points} since={since} until={until} units={measurement.units} />
    <div class="overflow-x-auto"><table class="w-full text-left text-xs">
      <caption class="pb-2 text-left font-semibold">Latest points</caption>
      <thead><tr><th class="py-1">Time</th><th>Value</th><th>Precision</th></tr></thead>
      <tbody>{loadedSeries.points.slice(-12).reverse().map((point, index) => <tr key={`${point.recorded_at}:${index}`} class="border-t border-border">
        <td class="py-1">{new Date(point.recorded_at).toLocaleString()}</td>
        <td>{pointText(point, measurement.units)}</td><td>{point.precision === 'exact' ? 'Exact' : `Average of ${point.sample_count} samples`}</td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}

function toLocalInput(ms: number): string {
  const date = new Date(ms);
  return new Date(ms - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function MeasurementChart({ points, since, until, units }: { points: MeasurementPoint[]; since: string; until: string; units: string | null }) {
  const numbers = points.some(point => numericValue(point) !== null);
  const booleans = points.some(point => booleanValue(point) !== null);
  return <div class="space-y-3">
    {numbers && <SeriesPlot title="Numeric values" points={points} since={since} until={until} units={units} kind="number" />}
    {booleans && <SeriesPlot title="Boolean values" points={points} since={since} until={until} units={null} kind="boolean" />}
    {!numbers && !booleans && <p class="text-sm text-text-muted">All recorded values are unavailable.</p>}
  </div>;
}

function SeriesPlot({ title, points, since, until, units, kind }: {
  title: string; points: MeasurementPoint[]; since: string; until: string; units: string | null; kind: 'number' | 'boolean';
}) {
  const width = 800, height = 230, left = 52, right = 12, top = 12, bottom = 31;
  const start = Date.parse(since), end = Date.parse(until);
  const values = points.flatMap(point => kind === 'number' ? numericRange(point) : booleanValue(point) === null ? [] : [booleanValue(point)!]);
  const min = kind === 'boolean' ? 0 : Math.min(...values);
  const max = kind === 'boolean' ? 1 : Math.max(...values);
  const span = max - min || 1;
  const x = (point: MeasurementPoint) => left + (Date.parse(point.recorded_at) - start) / (end - start) * (width - left - right);
  const y = (value: number) => top + (max - value) / span * (height - top - bottom);
  const times = points.filter(point => (kind === 'number' ? numericValue(point) : booleanValue(point)) !== null)
    .map(point => Date.parse(point.recorded_at));
  const gaps = times.slice(1).map((time, index) => time - times[index]).sort((a, b) => a - b);
  const typicalGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
  let path = '';
  let previous: { time: number; value: number; interval: number } | null = null;
  for (const point of points) {
    const value = kind === 'number' ? numericValue(point) : booleanValue(point);
    if (value === null) { previous = null; continue; }
    const time = Date.parse(point.recorded_at);
    const interval = point.precision === 'rollup' ? point.interval_seconds * 1000 : 0;
    const previousPoint = previous as { time: number; value: number; interval: number } | null;
    const gap = previousPoint && time - previousPoint.time > Math.max(previousPoint.interval, interval, typicalGap, 1000) * 2.5;
    if (!previousPoint || gap) path += `M ${x(point)} ${y(value)} `;
    else if (kind === 'boolean' && point.precision === 'exact') path += `H ${x(point)} V ${y(value)} `;
    else path += `L ${x(point)} ${y(value)} `;
    previous = { time, value, interval };
  }
  return <div class="rounded border border-border p-3">
    <h4 class="mb-2 text-sm font-semibold">{title}{units ? ` · ${units}` : ''}</h4>
    <svg class="h-auto w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} chart from ${new Date(start).toLocaleString()} to ${new Date(end).toLocaleString()}`}>
      <path d={`M ${left} ${top} V ${height - bottom} H ${width - right}`} fill="none" stroke="currentColor" class="text-border" />
      <text x="4" y={top + 8} class="fill-text-muted text-xs">{kind === 'boolean' ? 'True' : formatNumber(max)}</text>
      <text x="4" y={height - bottom} class="fill-text-muted text-xs">{kind === 'boolean' ? 'False' : formatNumber(min)}</text>
      <path d={path} fill="none" stroke="currentColor" stroke-width="2" class="text-active" />
      {points.map((point, index) => {
        const value = kind === 'number' ? numericValue(point) : booleanValue(point);
        if (value === null) return null;
        const range = kind === 'number' ? numericRange(point) : [];
        return <g key={`${point.recorded_at}:${index}`}>
          {range.length > 1 && <line x1={x(point)} x2={x(point)} y1={y(range[0])} y2={y(range[1])} stroke="currentColor" class="text-active" opacity="0.55" />}
          <circle cx={x(point)} cy={y(value)} r={point.precision === 'exact' ? 2.5 : 2} fill="currentColor" class="text-active">
            <title>{`${new Date(point.recorded_at).toLocaleString()}: ${pointText(point, units)}`}</title>
          </circle>
        </g>;
      })}
      <text x={left} y={height - 5} class="fill-text-muted text-xs">{new Date(start).toLocaleString()}</text>
      <text x={width - right} y={height - 5} text-anchor="end" class="fill-text-muted text-xs">{new Date(end).toLocaleString()}</text>
    </svg>
  </div>;
}

function numericValue(point: MeasurementPoint): number | null {
  return point.precision === 'exact' ? typeof point.value === 'number' ? point.value : null : point.stats.number?.mean ?? null;
}

function numericRange(point: MeasurementPoint): number[] {
  return point.precision === 'exact' ? typeof point.value === 'number' ? [point.value] : [] :
    point.stats.number ? [point.stats.number.min, point.stats.number.max] : [];
}

function booleanValue(point: MeasurementPoint): number | null {
  return point.precision === 'exact' ? typeof point.value === 'boolean' ? Number(point.value) : null : point.stats.boolean?.true_fraction ?? null;
}

function pointText(point: MeasurementPoint, units: string | null): string {
  if (point.precision === 'exact') return point.value === null ? 'Unavailable' : `${point.value}${units && typeof point.value === 'number' ? ` ${units}` : ''}`;
  const number = point.stats.number;
  const boolean = point.stats.boolean;
  if (number && boolean) return `${formatNumber(number.mean)} ${units ?? ''}; ${Math.round(boolean.true_fraction * 100)}% true`;
  if (number) return `${formatNumber(number.mean)} ${units ?? ''} (range ${formatNumber(number.min)}–${formatNumber(number.max)})`;
  if (boolean) return `${Math.round(boolean.true_fraction * 100)}% true`;
  return 'Unavailable';
}

function formatNumber(value: number): string { return Number(value.toPrecision(5)).toString(); }

function sourceLabel(measurement: MeasurementFields, instances: RecordOf<LogicInstanceFields>[], inputs: RecordOf<LogicInputFields>[], outputs: RecordOf<LogicOutputFields>[]): string {
  if (!measurement.logic_instance_id) return 'Detached';
  const instance = instances.find(candidate => candidate.id === measurement.logic_instance_id);
  const port = measurement.logic_input_id ? inputs.find(candidate => candidate.id === measurement.logic_input_id) :
    outputs.find(candidate => candidate.id === measurement.logic_output_id);
  return `${instance?.name ?? 'Deleted instance'} · ${measurement.logic_input_id ? 'Input' : 'Output'} ${port?.name ?? 'Deleted port'}`;
}

function matchesSource(measurement: MeasurementFields, filter: SourceFilter): boolean {
  return measurement.logic_instance_id === filter.logic_instance_id &&
    (filter.logic_input_id !== undefined ? measurement.logic_input_id === filter.logic_input_id : measurement.logic_output_id === filter.logic_output_id);
}

function found<T extends { id: number }>(query: ReifiedQueryResult<T>): RecordOf<T>[] {
  return query._loaded ? query.filter(record => record._found) as RecordOf<T>[] : [];
}
