import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { useTxnStatus } from '../../components/useTxnStatus';
import { useLoaders } from '../../lib/DataLoader2';
import type { ExistingRecord, ReifiedQueryResult, Txn } from '../../lib/RestfulModelStore';
import {
  LogicInputBinding,
  LogicInstance,
  LogicOutputBinding,
  Measurement,
  Store,
  Trace,
} from '../../store';
import type {
  DeviceFields,
  LogicDiagramFields,
  LogicInputBindingFields,
  LogicInputFields,
  LogicInstanceFields,
  LogicOutputBindingFields,
  LogicOutputFields,
  MeasurementFields,
  MeasurementSourceType,
} from '../../store';
import type { InstancesUXState } from '../../uxTree';

type RecordOf<T extends { id: number }> = ExistingRecord<T>;

export function InstancesTab({ instances, diagrams, inputs, outputs, inputBindings, outputBindings, devices, measurements, ux, onRefresh }: {
  instances: ReifiedQueryResult<LogicInstanceFields>;
  diagrams: ReifiedQueryResult<LogicDiagramFields>;
  inputs: ReifiedQueryResult<LogicInputFields>;
  outputs: ReifiedQueryResult<LogicOutputFields>;
  inputBindings: ReifiedQueryResult<LogicInputBindingFields>;
  outputBindings: ReifiedQueryResult<LogicOutputBindingFields>;
  devices: ReifiedQueryResult<DeviceFields>;
  measurements?: ReifiedQueryResult<MeasurementFields>;
  ux: InstancesUXState;
  onRefresh: () => void;
}) {
  const { selectedInstanceId, showInstanceForm } = useLoaders(() => ({
    selectedInstanceId: ux.get('selectedInstanceId') ?? null,
    showInstanceForm: ux.get('showInstanceForm') ?? false,
  }), [ux], [ux]);
  const foundInstances = found(instances);
  const foundDiagrams = found(diagrams);
  const foundInputs = found(inputs);
  const foundOutputs = found(outputs);
  const foundInputBindings = found(inputBindings);
  const foundOutputBindings = found(outputBindings);
  const foundDevices = found(devices);
  const current = foundInstances.find(instance => instance.id === selectedInstanceId) ?? foundInstances[0] ?? null;

  return <section class="space-y-5">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h2 class="text-lg font-semibold">Logic instances</h2>
        <p class="text-sm text-text-muted">Connect a reusable logic diagram to real device inputs and outputs.</p>
      </div>
      <button class="rounded bg-active px-3 py-1.5 text-sm font-medium text-white"
        onClick={() => ux.set('showInstanceForm', true)}>+ New instance</button>
    </div>

    {showInstanceForm && <NewInstanceForm diagrams={foundDiagrams} onClose={() => ux.set('showInstanceForm', false)} onCreated={onRefresh} />}

    {!instances._loaded ? <p class="text-text-muted">Loading instances…</p> : foundInstances.length === 0 ?
      <p class="rounded border border-dashed border-border p-5 text-text-muted">No logic instances configured yet.</p> :
      <div class="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside class="overflow-hidden rounded-lg border border-border">
          <h3 class="border-b border-border px-4 py-3 text-sm font-semibold">Instances</h3>
          {foundInstances.map(instance => {
            const diagram = foundDiagrams.find(candidate => candidate.id === instance.logic_diagram_id);
            const instanceInputs = foundInputs.filter(input => input.logic_diagram_id === instance.logic_diagram_id);
            const instanceOutputs = foundOutputs.filter(output => output.logic_diagram_id === instance.logic_diagram_id);
            const connected = foundInputBindings.filter(binding => binding.logic_instance_id === instance.id).length +
              foundOutputBindings.filter(binding => binding.logic_instance_id === instance.id).length;
            const total = instanceInputs.length + instanceOutputs.length;
            return <button key={instance.id}
              class={`flex w-full items-start gap-3 border-l-4 px-4 py-4 text-left ${current?.id === instance.id ? 'border-active bg-active-bg' : 'border-transparent'}`}
              onClick={() => ux.set('selectedInstanceId', instance.id)}>
              <span class={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${instance.output_enable ? 'bg-ok' : 'bg-border'}`} />
              <span class="min-w-0">
                <span class="block truncate text-sm font-semibold">{instance.name}</span>
                <span class="block truncate text-xs text-text-muted">{diagram?.name ?? 'Unknown diagram'} · {connected} of {total} connected</span>
              </span>
            </button>;
          })}
        </aside>
        {current && <InstanceEditor key={current.id} instance={current} diagrams={foundDiagrams}
          inputs={foundInputs.filter(input => input.logic_diagram_id === current.logic_diagram_id)}
          outputs={foundOutputs.filter(output => output.logic_diagram_id === current.logic_diagram_id)}
          inputBindings={foundInputBindings.filter(binding => binding.logic_instance_id === current.id)}
          outputBindings={foundOutputBindings.filter(binding => binding.logic_instance_id === current.id)}
          devices={foundDevices} measurements={measurements ? found(measurements) : []} onRefresh={onRefresh}
          onDeleted={() => { ux.set('selectedInstanceId', null); onRefresh(); }} />}
      </div>}
  </section>;
}

function NewInstanceForm({ diagrams, onClose, onCreated }: {
  diagrams: RecordOf<LogicDiagramFields>[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [diagramId, setDiagramId] = useState(String(diagrams[0]?.id ?? ''));
  const [txn, setTxn] = useState<Txn | undefined>();
  const handledSeq = useRef<number | null>(null);
  const { txnResult, saving } = useTxnStatus(txn);
  useEffect(() => {
    if (!txnResult || handledSeq.current === txnResult.seq) return;
    handledSeq.current = txnResult.seq;
    if (txnResult.status === 'succeeded') { onCreated(); onClose(); }
  }, [txnResult, onCreated, onClose]);
  return <div class="space-y-3 rounded-lg border border-border bg-surface-alt p-4">
    <h3 class="text-sm font-semibold">New instance</h3>
    <div class="grid gap-3 md:grid-cols-2">
      <label><span class="text-xs text-text-muted">Instance name</span>
        <input class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm" value={name}
          onInput={event => setName((event.target as HTMLInputElement).value)} />
      </label>
      <label><span class="text-xs text-text-muted">Logic diagram</span>
        <select class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm" value={diagramId}
          onChange={event => setDiagramId((event.target as HTMLSelectElement).value)}>
          {diagrams.map(diagram => <option key={diagram.id} value={diagram.id}>{diagram.name}</option>)}
        </select>
      </label>
    </div>
    {txnResult?.status === 'error' && <p class="text-sm text-error">Could not create instance.</p>}
    <div class="flex gap-2">
      <button class="rounded bg-active px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        disabled={saving || !name || !diagramId} onClick={() => setTxn(Store.m(LogicInstance).create({
          name, logic_diagram_id: Number(diagramId), update_period: 60, output_enable: false,
        }))}>{saving ? 'Creating…' : 'Create instance'}</button>
      <button class="rounded border border-border px-3 py-1.5 text-sm" onClick={onClose}>Cancel</button>
    </div>
  </div>;
}

function InstanceEditor({ instance, diagrams, inputs, outputs, inputBindings, outputBindings, devices, measurements, onRefresh, onDeleted }: {
  instance: RecordOf<LogicInstanceFields>;
  diagrams: RecordOf<LogicDiagramFields>[];
  inputs: RecordOf<LogicInputFields>[];
  outputs: RecordOf<LogicOutputFields>[];
  inputBindings: RecordOf<LogicInputBindingFields>[];
  outputBindings: RecordOf<LogicOutputBindingFields>[];
  devices: RecordOf<DeviceFields>[];
  measurements: RecordOf<MeasurementFields>[];
  onRefresh: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(instance.name);
  const [period, setPeriod] = useState(String(instance.update_period));
  const [txn, setTxn] = useState<Txn | undefined>();
  const [deleting, setDeleting] = useState(false);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [selection, setSelection] = useState<{ id: number; name: string } | null>(null);
  const [measurementTxn, setMeasurementTxn] = useState<Txn | undefined>();
  const measurementStatus = useTxnStatus(measurementTxn);
  const handledMeasurement = useRef<number | null>(null);
  useEffect(() => {
    const result = measurementStatus.txnResult;
    if (!result || handledMeasurement.current === result.seq) return;
    handledMeasurement.current = result.seq;
    if (result.status === 'succeeded') { setSelection(null); onRefresh(); }
  }, [measurementStatus.txnResult, onRefresh]);
  useEffect(() => {
    if (!selection) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelection(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection]);
  useEffect(() => { setSelection(null); }, [instance.logic_diagram_id]);
  const attach = (source_type: MeasurementSourceType, source_id: number) => {
    if (selection && !measurementStatus.saving) setMeasurementTxn(Store.m(Measurement).patch(selection.id, { logic_instance_id: instance.id, source_type, source_id }));
  };
  const detach = (id: number) => !measurementStatus.saving && setMeasurementTxn(Store.m(Measurement).patch(id, { logic_instance_id: null, source_type: null, source_id: null }));
  const handledSeq = useRef<number | null>(null);
  const { txnResult, saving } = useTxnStatus(txn);
  useEffect(() => {
    if (!txnResult || handledSeq.current === txnResult.seq) return;
    handledSeq.current = txnResult.seq;
    if (txnResult.status === 'succeeded') {
      if (deleting) onDeleted(); else onRefresh();
    } else if (deleting) {
      setDeleting(false);
    }
  }, [txnResult, deleting, onDeleted, onRefresh]);
  const run = (next: Txn | undefined) => setTxn(next);
  const connected = inputBindings.length + outputBindings.length;
  const total = inputs.length + outputs.length;

  return <div class="space-y-5 rounded-lg border border-border bg-surface p-5">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div><p class="text-xs font-semibold uppercase text-text-muted">Instance</p><h3 class="text-xl font-semibold">{instance.name}</h3></div>
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" class="peer sr-only" checked={instance.output_enable} disabled={saving}
          onChange={() => run(Store.m(LogicInstance).patch(instance.id, { output_enable: !instance.output_enable }))} />
        <span class="relative h-6 w-11 rounded-full bg-border after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-active peer-checked:after:translate-x-5" />
        <span>Outputs enabled</span>
      </label>
    </div>

    <div class="grid gap-3 md:grid-cols-3">
      <label><span class="text-xs text-text-muted">Instance name</span>
        <input class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm" value={name}
          onInput={event => setName((event.target as HTMLInputElement).value)}
          onBlur={() => name !== instance.name && run(Store.m(LogicInstance).patch(instance.id, { name }))} />
      </label>
      <label><span class="text-xs text-text-muted">Logic diagram</span>
        <select class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
          value={instance.logic_diagram_id}
          onChange={event => run(Store.m(LogicInstance).patch(instance.id, { logic_diagram_id: Number((event.target as HTMLSelectElement).value) }))}>
          {diagrams.map(diagram => <option key={diagram.id} value={diagram.id}>{diagram.name}</option>)}
        </select>
      </label>
      <label><span class="text-xs text-text-muted">Update period (seconds)</span>
        <input type="number" min="1" class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
          value={period} onInput={event => setPeriod((event.target as HTMLInputElement).value)}
          onBlur={() => Number(period) !== instance.update_period && run(Store.m(LogicInstance).patch(instance.id, { update_period: Number(period) }))} />
      </label>
    </div>

    <div class="flex items-center gap-3">
      <button class="rounded border border-border px-3 py-1.5 text-sm" onClick={() => setShowMeasurements(true)}>Attach measurement</button>
      {selection && <p role="status" class="text-sm text-active">Select an input or output for {selection.name}. <button class="underline" onClick={() => setSelection(null)}>Cancel</button></p>}
    </div>
    {measurementStatus.txnResult?.status === 'error' && <p role="alert" class="text-sm text-error">Measurement change could not be saved. Try again.</p>}
    {showMeasurements && <MeasurementPicker measurements={measurements} onClose={() => setShowMeasurements(false)} onRefresh={onRefresh}
      onSelect={measurement => { setSelection(measurement); setShowMeasurements(false); }} />}

    <ConnectionSection title="Input connections" helper="Values this diagram receives">
      {inputs.map(input => <InputConnection key={input.id} instance={instance} input={input}
        binding={inputBindings.find(candidate => candidate.logic_input_id === input.id) ?? null}
        devices={devices} run={run} selection={selection !== null} attach={() => attach('LogicInput', input.id)}
        measurements={measurements.filter(m => m.logic_instance_id === instance.id && m.source_type === 'LogicInput' && m.source_id === input.id)} detach={detach} />)}
      {inputs.length === 0 && <EmptyConnections text="This diagram has no inputs." />}
    </ConnectionSection>

    <ConnectionSection title="Output connections" helper="Commands this diagram sends">
      {outputs.map(output => <OutputConnection key={output.id} instance={instance} output={output}
        binding={outputBindings.find(candidate => candidate.logic_output_id === output.id) ?? null}
        devices={devices} run={run} selection={selection !== null} attach={() => attach('LogicOutput', output.id)}
        measurements={measurements.filter(m => m.logic_instance_id === instance.id && m.source_type === 'LogicOutput' && m.source_id === output.id)} detach={detach} />)}
      {outputs.length === 0 && <EmptyConnections text="This diagram has no outputs." />}
    </ConnectionSection>

    <p class="rounded border border-active/30 bg-active-bg px-3 py-2 text-xs text-active">
      Output changes are applied on the next runner and poller cycles while outputs are enabled.
    </p>
    {txnResult?.status === 'error' && <p role="alert" class="text-sm text-error">Change could not be saved.</p>}
    <div class="flex flex-wrap items-center gap-3 border-t border-border pt-4 text-sm">
      <span class={connected === total ? 'text-ok' : 'text-text-muted'}>{connected} of {total} ports connected</span>
      <span class="ml-auto text-text-muted">{saving ? 'Saving…' : txnResult?.status === 'succeeded' ? '✓ Changes saved' : ''}</span>
      <button class="rounded border border-border px-3 py-1.5" disabled={saving}
        onClick={() => run(Store.m(Trace).create({ logic_instance_id: instance.id }))}>Compute now</button>
      <button class="rounded border border-error px-3 py-1.5 text-error" disabled={saving}
        onClick={() => { if (window.confirm(`Delete instance "${instance.name}" and its traces?`)) {
          setDeleting(true);
          run(Store.m(LogicInstance).destroy(instance.id));
        } }}>Delete instance</button>
    </div>
  </div>;
}

function ConnectionSection({ title, helper, children }: { title: string; helper: string; children: ComponentChildren }) {
  return <section class="space-y-3 border-t border-border pt-4">
    <div><h4 class="font-semibold">{title}</h4><p class="text-sm text-text-muted">{helper}</p></div>{children}
  </section>;
}

function InputConnection({ instance, input, binding, devices, run, selection, attach, measurements, detach }: {
  instance: RecordOf<LogicInstanceFields>; input: RecordOf<LogicInputFields>;
  binding: RecordOf<LogicInputBindingFields> | null; devices: RecordOf<DeviceFields>[];
  run: (txn: Txn | undefined) => void;
  selection: boolean; attach: () => void; measurements: RecordOf<MeasurementFields>[]; detach: (id: number) => void;
}) {
  const compatible = devices.flatMap(device => device.inputs
    .filter(source => source.value_type === input.value_type || (input.value_type === 'number' && source.value_type === 'boolean'))
    .map(source => ({ device, source })));
  const selectedSource = binding?.source_kind === 'fixed_value'
    ? 'fixed_value'
    : binding ? `device:${binding.device_id}:${binding.source_path}` : '';
  const setSource = (selection: string) => {
    if (!selection) { if (binding) run(Store.m(LogicInputBinding).destroy(binding.id)); return; }
    if (selection === 'fixed_value') {
      const fixed = input.value_type === 'boolean' ? false : 0;
      const fields = { source_kind: 'fixed_value' as const, device_id: null, source_path: null, fixed_value: fixed };
      run(binding ? Store.m(LogicInputBinding).patch(binding.id, fields)
        : Store.m(LogicInputBinding).create({ ...fields, logic_instance_id: instance.id, logic_input_id: input.id }));
      return;
    }
    const [, deviceId, ...path] = selection.split(':');
    const fields = {
      source_kind: 'device_input' as const,
      device_id: Number(deviceId),
      source_path: path.join(':'),
      fixed_value: null,
    };
    run(binding ? Store.m(LogicInputBinding).patch(binding.id, fields)
      : Store.m(LogicInputBinding).create({ ...fields, logic_instance_id: instance.id, logic_input_id: input.id }));
  };
  return <ConnectionRow name={input.name} type={input.value_type} units={input.units} selection={selection} attach={attach} measurements={measurements} detach={detach}>
    <select aria-label={`${input.name} source`} class={selectClass} value={selectedSource} onChange={event => setSource((event.target as HTMLSelectElement).value)}>
      <option value="">Not connected</option>
      <option value="fixed_value">Fixed value</option>
      {compatible.map(({ device, source }) => <option key={`${device.id}:${source.path}`} value={`device:${device.id}:${source.path}`}>
        {device.name} · {source.label}
      </option>)}
    </select>
    {binding?.source_kind === 'fixed_value' && (input.value_type === 'boolean' ?
      <select aria-label={`${input.name} fixed value`} class={selectClass} value={String(binding.fixed_value)} onChange={event => run(Store.m(LogicInputBinding).patch(binding.id, { fixed_value: (event.target as HTMLSelectElement).value === 'true' }))}>
        <option value="false">False</option><option value="true">True</option>
      </select> :
      <input aria-label={`${input.name} fixed value`} type="number" step="any" class={selectClass} value={String(binding.fixed_value ?? '')}
        onChange={event => run(Store.m(LogicInputBinding).patch(binding.id, { fixed_value: Number((event.target as HTMLInputElement).value) }))} />)}
  </ConnectionRow>;
}

function OutputConnection({ instance, output, binding, devices, run, selection, attach, measurements, detach }: {
  instance: RecordOf<LogicInstanceFields>; output: RecordOf<LogicOutputFields>;
  binding: RecordOf<LogicOutputBindingFields> | null; devices: RecordOf<DeviceFields>[];
  run: (txn: Txn | undefined) => void;
  selection: boolean; attach: () => void; measurements: RecordOf<MeasurementFields>[]; detach: (id: number) => void;
}) {
  const compatible = devices.flatMap(device => device.outputs.filter(target => target.value_type === output.value_type)
    .map(target => ({ device, target })));
  return <ConnectionRow name={output.name} type={output.value_type} units={output.units} selection={selection} attach={attach} measurements={measurements} detach={detach}>
    <select aria-label={`${output.name} target`} class={selectClass} value={binding ? `${binding.device_id}:${binding.channel}` : ''}
      onChange={event => {
        const [deviceId, channel] = (event.target as HTMLSelectElement).value.split(':');
        if (!deviceId) { if (binding) run(Store.m(LogicOutputBinding).destroy(binding.id)); return; }
        const fields = { device_id: Number(deviceId), channel: Number(channel), target_kind: 'device_output' as const };
        run(binding ? Store.m(LogicOutputBinding).patch(binding.id, fields) : Store.m(LogicOutputBinding).create({
          ...fields, logic_instance_id: instance.id, logic_output_id: output.id, output_enable: true,
        }));
      }}>
      <option value="">Not connected</option>
      {compatible.map(({ device, target }) => <option key={`${device.id}:${target.channel}`} value={`${device.id}:${target.channel}`}>
        {device.name} · {target.label}
      </option>)}
    </select>
    {binding && <label class="flex items-center gap-2 whitespace-nowrap text-xs text-text-muted">
      <input type="checkbox" checked={binding.output_enable}
        onChange={() => run(Store.m(LogicOutputBinding).patch(binding.id, { output_enable: !binding.output_enable }))} /> Enabled
    </label>}
  </ConnectionRow>;
}

function ConnectionRow({ name, type, units, children, selection, attach, measurements, detach }: {
  name: string; type: string; units: string | null; children: ComponentChildren;
  selection: boolean; attach: () => void; measurements: RecordOf<MeasurementFields>[]; detach: (id: number) => void;
}) {
  if (selection) return <button type="button" aria-label={`Attach to ${name}`} onClick={attach}
    class="grid w-full cursor-crosshair items-center gap-3 rounded-lg border border-active bg-active-bg p-3 text-left hover:bg-active/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-active md:grid-cols-[16rem_minmax(0,1fr)]">
    <span><span class="block font-mono text-sm font-semibold">{name}</span><span class="block text-xs capitalize text-text-muted">{type}{units ? ` · ${units}` : ''}</span></span>
    <span class="text-sm text-active">Attach to {name}</span>
  </button>;
  return <div class="rounded-lg bg-surface-alt p-3">
    <div class="flex items-center justify-between gap-3">
      <p class="min-w-0 font-mono text-sm font-semibold">{name}</p>
      {measurements.length > 0 && <MeasurementMenu name={name} measurements={measurements} detach={detach} />}
    </div>
    <div class="grid items-center gap-3 md:grid-cols-[16rem_minmax(0,1fr)]">
      <p class="text-xs capitalize text-text-muted">{type}{units ? ` · ${units}` : ''}</p>
      <div class="flex min-w-0 gap-2">{children}</div>
    </div>
  </div>;
}
function MeasurementMenu({ name, measurements, detach }: {
  name: string; measurements: RecordOf<MeasurementFields>[]; detach: (id: number) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const position = () => {
    if (!trigger.current || !panel.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    const above = rect.top;
    const opensAbove = below < 160 && above > below;
    Object.assign(panel.current.style, {
      left: 'auto',
      right: `${Math.max(8, window.innerWidth - rect.right)}px`,
      top: opensAbove ? 'auto' : `${rect.bottom}px`,
      bottom: opensAbove ? `${window.innerHeight - rect.top}px` : 'auto',
      maxHeight: `${Math.max(0, (opensAbove ? above : below) - 8)}px`,
    });
  };
  useEffect(() => {
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, []);
  return <>
    <button ref={trigger} type="button" popovertarget={id} aria-label={`Measurements for ${name}`}
      class="shrink-0 cursor-pointer rounded px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-active"
      title="Measurements" onClick={position}>◉</button>
    <div ref={panel} id={id} popover="auto" class="fixed m-0 min-w-48 max-w-[calc(100vw-1rem)] overflow-auto rounded border border-border bg-surface p-2 shadow-lg">
      {measurements.map(m => <div key={m.id} class="flex items-center justify-between gap-3 py-1 text-sm"><span>{m.name}</span><button class="text-error underline" onClick={() => detach(m.id)}>Detach</button></div>)}
    </div>
  </>;
}

function EmptyConnections({ text }: { text: string }) {
  return <p class="rounded border border-dashed border-border p-3 text-sm text-text-muted">{text}</p>;
}

function found<T extends { id: number }>(query: ReifiedQueryResult<T>): RecordOf<T>[] {
  return query._loaded ? query.filter(record => record._found) as RecordOf<T>[] : [];
}

const selectClass = 'min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1.5 text-sm';

function MeasurementPicker({ measurements, onClose, onSelect, onRefresh }: {
  measurements: RecordOf<MeasurementFields>[]; onClose: () => void;
  onSelect: (measurement: { id: number; name: string }) => void; onRefresh: () => void;
}) {
  const [name, setName] = useState('');
  const [txn, setTxn] = useState<Txn | undefined>();
  const { txnResult, saving } = useTxnStatus(txn);
  const handled = useRef<number | null>(null);
  useEffect(() => {
    if (!txnResult || handled.current === txnResult.seq) return;
    handled.current = txnResult.seq;
    if (txnResult.status === 'succeeded' && typeof txnResult.id === 'number') {
      onRefresh(); onSelect({ id: txnResult.id, name });
    }
  }, [txnResult, name, onRefresh, onSelect]);
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== 'Tab' || !dialog.current) return;
      const controls = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'));
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); previousFocus?.focus(); };
  }, []);
  return <div class="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" role="presentation">
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="measurement-picker-title" class="w-full max-w-lg space-y-4 rounded-lg bg-surface p-5 shadow-lg">
      <h3 id="measurement-picker-title" class="font-semibold">Attach measurement</h3>
      <p class="text-sm text-text-muted">Select an existing measurement or create a new one.</p>
      <div class="max-h-64 space-y-2 overflow-auto">{measurements.map(m => <button key={m.id} disabled={saving} class="block w-full rounded border border-border p-2 text-left disabled:opacity-50" onClick={() => onSelect({ id: m.id, name: m.name })}>
        <span class="block font-medium">{m.name}</span><span class="text-xs text-text-muted">{m.source ? `${m.source.logic_instance_name} · ${m.source.name}` : 'Detached'}</span>
      </button>)}{measurements.length === 0 && <p class="text-sm text-text-muted">No existing measurements.</p>}</div>
      <label class="block text-sm">New measurement name<input class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5" disabled={saving} value={name} onInput={event => setName((event.target as HTMLInputElement).value)} /></label>
      {txnResult?.status === 'error' && <p role="alert" class="text-sm text-error">Could not create measurement. Check the name and try again.</p>}
      <div class="flex gap-2"><button disabled={!name.trim() || saving} class="rounded bg-active px-3 py-1.5 text-sm text-white disabled:opacity-50" onClick={() => setTxn(Store.m(Measurement).create({ name: name.trim() }))}>{saving ? 'Creating…' : 'Create and select'}</button>
        <button class="rounded border border-border px-3 py-1.5 text-sm" onClick={onClose}>Cancel</button></div>
    </div>
  </div>;
}
