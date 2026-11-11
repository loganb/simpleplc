import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLoaders } from '../../lib/DataLoader2';
import type { FoundRecord, ReifiedQueryResult, Txn } from '../../lib/RestfulModelStore';
import { useTxnStatus } from '../../components/useTxnStatus';
import { Measurement, Store } from '../../store';
import type { LogicInputFields, LogicOutputFields, MeasurementFields, MeasurementPatchFields } from '../../store';
import type { HistorySource } from './historyTypes';
import type { HistoryRange, MeasurementsUXState } from '../../uxTree';
import { MeasurementHistoryGraph } from './MeasurementHistoryGraph';
import { useMeasurementHistory } from './useMeasurementHistory';
import { hasVisibleHistory } from './historySeries';

const ranges: HistoryRange[] = ['1m', '10m', '1hr', '24hr', '7d', '30d'];
const colors = ['#2563eb', '#dc2626', '#059669', '#9333ea', '#d97706', '#0891b2', '#be185d', '#4d7c0f'];
const colorFor = (id: number) => colors[Math.abs(id) % colors.length];

export function MeasurementsTab({ measurements, ux, refreshToken, logicInputs = [], logicOutputs = [] }: { measurements: ReifiedQueryResult<MeasurementFields>; ux: MeasurementsUXState; refreshToken: number; logicInputs?: ReifiedQueryResult<LogicInputFields> | []; logicOutputs?: ReifiedQueryResult<LogicOutputFields> | [] }) {
  const unitEntries = [
    ...logicInputs.filter(port => port._found).map(port => ['LogicInput', port.id, port._found ? port.units : null]),
    ...logicOutputs.filter(port => port._found).map(port => ['LogicOutput', port.id, port._found ? port.units : null]),
  ];
  const unitsKey = JSON.stringify(unitEntries);
  const unitsFor = useMemo(() => {
    const units = new Map<string, string | null>((JSON.parse(unitsKey) as [string, number, string | null][]).map(([type, id, unit]) => [`${type}:${id}`, unit?.trim() || null]));
    return (source: HistorySource) => source.value_type === 'number' ? units.get(`${source.source_type}:${source.source_id}`) ?? null : null;
  }, [unitsKey]);
  const { range, deselected } = useLoaders(() => ({ range: ux.get('range') ?? '1hr', deselected: ux.get('deselectedIds') ?? [] }), [ux], []);
  const records = measurements.filter(record => record._found);
  const selected = records.filter(record => record._found && !deselected.includes(record.id as number));
  const [historyResetToken, setHistoryResetToken] = useState(0);
  const history = useMeasurementHistory(selected.map(record => record.id as number), range, refreshToken, historyResetToken);
  const selectedKey = JSON.stringify(selected.map(record => [record.id, record.name]));
  const series = useMemo(() => {
    const points = history.points?.filter(point => point._found) ?? [];
    return selected.map(record => ({ measurementId: record.id as number, name: record.name, color: colorFor(record.id as number), points: points.filter(point => point._found && point.measurement_id === record.id).map(point => point as import('./historyTypes').MeasurementHistoryPointFields) }));
  }, [selectedKey, history.points]);
  const hasHistory = useMemo(() => series.some(item => hasVisibleHistory(item, { since: Date.parse(history.since), until: Date.parse(history.until) })), [series, history.since, history.until]);
  return <section class="space-y-5">
    <div><h2 class="text-lg font-semibold">Measurements</h2><p class="text-sm text-text-muted">Measurement history from instance inputs and outputs.</p></div>
    {!measurements._loaded ? <p role="status">Loading measurements…</p> : !measurements._found ? <p role="alert" class="text-error">Could not load measurements. Retrying when available.</p> : records.length === 0 ?
      <p class="rounded border border-dashed border-border p-5 text-text-muted">No measurements yet. Attach one from an instance.</p> : <>
      <div class="flex flex-wrap justify-center gap-1" aria-label="History range">{ranges.map(item => <button type="button" aria-pressed={range === item} class={`rounded px-3 py-1.5 text-sm ${range === item ? 'bg-active-bg text-active font-semibold ring-1 ring-active' : 'bg-surface-alt'}`} onClick={() => ux.set('range', item)}>{item}</button>)}</div>
      <MeasurementHistoryGraph series={series} since={history.since} until={history.until} onPlotWidth={history.onPlotWidth} unitsFor={unitsFor} />
      {selected.length === 0 ? <p role="status">Select a measurement to see its history.</p> : history.error ? <p role="alert">Could not load measurement history.</p> : history.loading ? <p role="status">Loading history…</p> : history.updating ? <p role="status">Updating history…</p> : !hasHistory ? <p role="status">No history in this range.</p> : null}
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{records.map(record => record._found && <MeasurementCard key={String(record.id)} record={record} selected={!deselected.includes(record.id as number)} color={colorFor(record.id as number)} onSelect={() => ux.set('deselectedIds', deselected.includes(record.id as number) ? deselected.filter(id => id !== record.id as number) : [...deselected, record.id as number])} onClear={() => setHistoryResetToken(value => value + 1)} />)}</div>
    </>}
  </section>;
}

function MeasurementCard({ record, selected, color, onSelect, onClear }: { record: FoundRecord<MeasurementFields>; selected: boolean; color: string; onSelect: () => void; onClear: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [txn, setTxn] = useState<Txn>();
  const [action, setAction] = useState<'clear' | 'delete'>();
  const cardRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { txnResult, saving } = useTxnStatus(txn);
  useEffect(() => {
    if (txnResult?.status === 'succeeded') {
      if (action === 'clear') onClear();
      setTxn(undefined);
      setAction(undefined);
    }
  }, [txnResult, txn, action, onClear]);
  useEffect(() => {
    if (!menuOpen) return;
    const dismissOutside = (event: PointerEvent) => { if (!cardRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMenuOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', escape);
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { document.removeEventListener('pointerdown', dismissOutside); document.removeEventListener('keydown', escape); };
  }, [menuOpen]);
  const fail = txnResult?.status === 'error';
  const menuId = `measurement-actions-${record.id}`;
  const clear = () => {
    if (saving) return;
    if (!window.confirm(`Clear all recorded data for “${record.name}”? The measurement and its attachment will remain, and new data will be recorded during the next evaluation.`)) { setMenuOpen(false); triggerRef.current?.focus(); return; }
    const changes: MeasurementPatchFields = { clear_data: true };
    const request = Store.m(Measurement).patch(record.id, changes);
    setAction('clear');
    setTxn(request);
    setMenuOpen(false);
    triggerRef.current?.focus();
  };
  const remove = () => {
    if (saving) return;
    if (!window.confirm(`Delete “${record.name}” and all of its recorded data? Its instance, source port, and instance history will remain.`)) { setMenuOpen(false); triggerRef.current?.focus(); return; }
    const request = Store.m(Measurement).destroy(record.id);
    setAction('delete');
    setTxn(request);
    setMenuOpen(false);
  };
  const moveMenuFocus = (event: KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    if (!items.length) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  };
  return <div ref={cardRef} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setMenuOpen(false); }} class={`group relative rounded-lg border ${selected ? '' : 'opacity-60'} ${menuOpen ? 'z-30' : ''}`} style={{ borderColor: selected ? color : undefined }}>
    <button type="button" aria-label={`Select ${record.name} measurement`} aria-pressed={selected} onClick={onSelect} class="block min-h-full w-full rounded-lg p-4 pr-14 text-left">
      <span class="block font-semibold"><span aria-hidden="true" class="mr-2 inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />{record.name}</span>
      <span class="block text-sm text-text-muted">{record.source ? `${record.source.logic_instance_name} · ${record.source.name}` : 'Detached'}</span>
      {record.preview.length === 0 ? <span class="mt-3 block text-sm text-text-muted">No recorded points yet.</span> : <span class="mt-3 block space-y-2 text-sm">{record.preview.slice(0, 1).map(point => 'snapshot' in point ? <span key={point.id} class="block border-t border-border pt-2"><span class="font-semibold">{point.snapshot.value === null ? 'Unavailable' : typeof point.snapshot.value === 'number' ? point.snapshot.value.toLocaleString(undefined, { maximumSignificantDigits: 6 }) : String(point.snapshot.value)}</span> <span class="text-text-muted">· {point.snapshot.logic_instance_name} · {point.snapshot.source_name} · {new Date(point.recorded_at).toLocaleString()}</span></span> : <span key={point.id} class="block border-t border-border pt-2">Summary · {point.sample_count} samples · {new Date(point.bucket_start).toLocaleString()}{point.summaries.map((group, index) => <span key={index} class="block text-text-muted">{group.logic_instance_name} · {group.source_name} · {Object.entries(group.statistics).map(([key, value]) => `${key}: ${String(value)}`).join(', ')}</span>)}</span>)}</span>}
    </button>
    <button ref={triggerRef} type="button" aria-label={`Actions for ${record.name}`} aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuId} disabled={saving} onClick={() => setMenuOpen(open => !open)} class="absolute right-2 top-2 rounded p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:group-focus-within:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:focus-visible:opacity-100">
      <span aria-hidden="true">⋮</span>
    </button>
    {menuOpen && <div ref={menuRef} id={menuId} role="menu" aria-label={`${record.name} actions`} onKeyDown={moveMenuFocus} class="absolute right-2 top-12 z-20 min-w-48 rounded border border-border bg-surface p-1 shadow-lg">
      <button type="button" role="menuitem" disabled={saving} onClick={clear} class="block w-full rounded px-3 py-2 text-left hover:bg-surface-alt">Clear data…</button>
      <button type="button" role="menuitem" disabled={saving} onClick={remove} class="block w-full rounded px-3 py-2 text-left text-error hover:bg-surface-alt">Delete measurement…</button>
    </div>}
    {fail && <p role="alert" class="px-4 pb-3 text-sm text-error">Could not {action === 'clear' ? 'clear data' : 'delete measurement'}: {JSON.stringify(txnResult.errors ?? 'request failed')}</p>}
  </div>;
}
