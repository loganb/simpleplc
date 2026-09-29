import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useLoaders } from '../../lib/DataLoader2';
import type { ExistingRecord, Identifiable, ModelDefinition } from '../../lib/RestfulModelStore';
import { AxiosClient, Device, HostInterface, HostPort, Store } from '../../store';
import type { DeviceIoLabels, HostInterfaceFields, HostPortFields } from '../../store';
import { appTree } from '../../uxTree';
import { buttonClass as btn, inputClass as input, errorMessage } from './hardware';
import { useDrivers } from './useDrivers';

interface Reference { id: number; name: string; logic_diagram_id: number; output_enable?: boolean }
export interface Impact { devices: { id: number; name: string }[]; measurements: Reference[]; output_blocks: Reference[] }
export function ImpactView({ impact }: { impact: Impact }) {
  return <div class="space-y-1 text-sm">
    <p>{impact.devices.length} device(s), {impact.measurements.length} measurement(s), {impact.output_blocks.length} output assignment(s).</p>
    {[...impact.measurements, ...impact.output_blocks].map((ref, i) => <button key={i} class="block underline" onClick={() => {
      const root = appTree.subtree(); root.subtree('logic').set('selectedDiagramId', ref.logic_diagram_id); root.setActiveSubtree('logic');
    }}>{ref.name} — open diagram {ref.logic_diagram_id}{ref.output_enable ? ' (output enabled)' : ''}</button>)}
  </div>;
}

type Fields = Record<string, unknown>;
function Editor({ model, editId, defaults, prepare, children, onClose, onRefresh }: {
  model: ModelDefinition<Identifiable>; editId: number | null; defaults: Fields;
  prepare?: (fields: Fields) => Fields;
  children: (fields: Fields, change: (key: string, value: unknown) => void) => ComponentChildren;
  onClose: () => void; onRefresh: () => void;
}) {
  const [fields, setFields] = useState(defaults);
  const [loaded, setLoaded] = useState(editId === null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [comparing, setComparing] = useState(false);
  const [impact, setImpact] = useState<Impact | null>(null);
  const singular = model.name;
  const url = `/${model.inflections.plural}/${editId}`;
  const pick = (record: Fields) => Object.fromEntries([...Object.keys(defaults), 'configuration_revision'].map(k => [k, record[k]]));
  const { record } = useLoaders(() => ({ record: editId === null ? null : Store.m(model).fetch(editId) }), [Store], [editId]);
  // The saved configuration as the store currently has it; null while (re)loading.
  const current = record?._found && !record._loading ? pick(record as unknown as Fields) : null;
  const missing = !!record?._loaded && !record._found;
  // The draft captures the revision the form opened with; later store updates don't touch it.
  useEffect(() => { if (!loaded && current) { setFields(current); setLoaded(true); } }, [record]);
  const latest = comparing ? current : null;
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const save = () => run(async () => {
    const payload = prepare ? prepare(fields) : fields;
    if (editId === null) await AxiosClient.post(`/${model.inflections.plural}`, { [singular]: payload });
    else await AxiosClient.patch(url, { [singular]: payload });
    onRefresh(); onClose();
  });
  return <section class="rounded border border-border bg-surface-alt p-4 space-y-3">
    <h3 class="font-semibold">{editId === null ? 'New' : 'Edit'} {singular === 'device' ? 'Device' : 'Host Interface'}</h3>
    {missing && <p role="alert" class="text-error">This {singular === 'device' ? 'device' : 'interface'} no longer exists.</p>}
    {error && <div role="alert" class="text-error">{error}
      {editId !== null && <button class={btn} disabled={busy} onClick={() => { Store.m(model).fetch(editId, true); setComparing(true); }}>Reload for comparison</button>}
    </div>}
    {comparing && !latest && <p class="text-sm">Loading current configuration…</p>}
    {latest && <div class="space-y-2 text-sm">
      <p>Your draft is preserved. Compare it with the current configuration before saving again.</p>
      <pre class="overflow-auto">{JSON.stringify(latest, null, 2)}</pre>
      <button class={btn} onClick={() => { setFields({ ...fields, configuration_revision: latest.configuration_revision }); setComparing(false); setError(''); }}>Keep my draft against this revision</button>
      <button class={btn} onClick={() => { setFields(latest); setComparing(false); setError(''); }}>Use current configuration</button>
    </div>}
    {!loaded ? <p>Loading…</p> : <fieldset disabled={busy} class="space-y-3">{children(fields, (key, value) => { setFields(current => ({ ...current, [key]: value })); setImpact(null); })}</fieldset>}
    <div class="flex gap-2">
      <button class={btn} disabled={busy || !loaded} onClick={save}>{busy ? 'Working…' : 'Save'}</button>
      <button class={btn} disabled={busy} onClick={onClose}>Cancel</button>
      {editId !== null && <button class={`${btn} ml-auto text-error`} disabled={busy || !loaded} onClick={() => run(async () => {
        setImpact((await AxiosClient.get(`${url}/impact`)).data);
      })}>Review deletion</button>}
    </div>
    {impact && <div class="border border-error rounded p-3 space-y-2">
      <p>Delete this {singular === 'device' ? 'device' : 'interface and its devices'}?</p>
      <ImpactView impact={impact} />
      {impact.measurements.length + impact.output_blocks.length > 0 ? <p>Reassign or remove these dependencies in Logic before deleting.</p> :
        <button class={`${btn} text-error`} disabled={busy} onClick={() => run(async () => {
          await AxiosClient.delete(url, { params: { configuration_revision: fields.configuration_revision } });
          onRefresh(); onClose();
        })}>Confirm deletion</button>}
      <button class={btn} disabled={busy} onClick={() => setImpact(null)}>Keep it</button>
    </div>}
  </section>;
}

export function InterfaceEditor({ editId, prefill, onClose, onRefresh }: {
  editId: number | null; prefill?: { port: string; name: string } | null; onClose: () => void; onRefresh: () => void;
}) {
  // Force a rescan when the form opens and on each "Rescan ports"; plain reads otherwise.
  const [scanToken, setScanToken] = useState(0);
  const lastScanToken = useRef(-1);
  const { ports } = useLoaders(() => {
    const force = scanToken !== lastScanToken.current;
    lastScanToken.current = scanToken;
    return { ports: Store.m(HostPort).queryFor(null, {}, force) };
  }, [Store], [scanToken]);
  const foundPorts = ports.filter(p => p._found) as ExistingRecord<HostPortFields>[];
  return <Editor model={HostInterface} editId={editId}
    defaults={{ name: prefill?.name || '', port: prefill?.port || '', baud_rate: 9600, data_bits: 8, stop_bits: 1, parity: 'none' }} onClose={onClose} onRefresh={onRefresh}>
    {(f, change) => <>
      <p class="text-sm text-text-muted">Disable the bus before replacing its port or serial settings. New buses start disabled.</p>
      <label class="block text-sm">Name<input class={input} value={String(f.name)} onInput={e => change('name', e.currentTarget.value)} /></label>
      <label class="block text-sm">Choose / replace serial port<select class={input} value={String(f.port)} onChange={e => change('port', e.currentTarget.value)}>
        <option value={String(f.port)}>Current: {f.port || 'manual entry'}</option>
        {foundPorts.map(p => <option key={p.id} value={p.stable_path} disabled={p.host_interface_id !== null && p.host_interface_id !== editId}>
          {p.label} · {p.tty} · {p.usb_serial || p.identity_basis}{p.console ? ' — KERNEL CONSOLE' : ''}{p.host_interface_id !== null ? ' — configured' : ''}
        </option>)}
      </select></label>
      <button class={btn} disabled={ports._loading} onClick={() => setScanToken(token => token + 1)}>{ports._loading ? 'Scanning…' : 'Rescan ports'}</button>
      {foundPorts.some(p => p.stable_path === f.port && p.console) && <p class="text-error">The kernel console uses this port. Select a dedicated adapter.</p>}
      <label class="block text-sm">Port (manual)<input class={input} value={String(f.port)} onInput={e => change('port', e.currentTarget.value)} /></label>
      <div class="grid grid-cols-2 gap-3">
        <label>Baud<input type="number" class={input} value={Number(f.baud_rate)} onInput={e => change('baud_rate', Number(e.currentTarget.value))} /></label>
        <label>Data bits<select class={input} value={String(f.data_bits)} onChange={e => change('data_bits', Number(e.currentTarget.value))}>{[5, 6, 7, 8].map(n => <option value={n}>{n}</option>)}</select></label>
        <label>Stop bits<select class={input} value={String(f.stop_bits)} onChange={e => change('stop_bits', Number(e.currentTarget.value))}>{[1, 2].map(n => <option value={n}>{n}</option>)}</select></label>
        <label>Parity<select class={input} value={String(f.parity)} onChange={e => change('parity', e.currentTarget.value)}>{['none', 'even', 'odd'].map(v => <option value={v}>{v}</option>)}</select></label>
      </div>
    </>}
  </Editor>;
}

export function DeviceEditor({ editId, interfaces, onClose, onRefresh }: { editId: number | null; interfaces: HostInterfaceFields[]; onClose: () => void; onRefresh: () => void }) {
  const drivers = useDrivers();
  const labelsFor = (value: unknown): DeviceIoLabels => value && typeof value === 'object' ? value as DeviceIoLabels : {};
  const compactLabels = (value: unknown): DeviceIoLabels => {
    const labels = labelsFor(value);
    return (['inputs', 'outputs'] as const).reduce<DeviceIoLabels>((result, section) => {
      const entries = Object.entries(labels[section] ?? {}).flatMap(([key, label]) => {
        const trimmed = label.trim();
        return trimmed ? [[key, trimmed] as [string, string]] : [];
      });
      if (entries.length) result[section] = Object.fromEntries(entries);
      return result;
    }, {});
  };
  const prepare = (fields: Fields) => ({ ...fields, io_labels: compactLabels(fields.io_labels) });
  return <Editor model={Device} editId={editId}
    defaults={{ name: '', host_interface_id: interfaces[0]?.id || '', modbus_address: 1, driver: '', io_labels: {} }}
    prepare={prepare} onClose={onClose} onRefresh={onRefresh}>
    {(f, change) => <>
      <p class="text-sm text-text-muted">For discovered hardware, select a driver from its scan results. Manual setup has no compatibility evidence.</p>
      <label class="block">Name<input class={input} value={String(f.name)} onInput={e => change('name', e.currentTarget.value)} /></label>
      <label class="block">Interface<select class={input} value={String(f.host_interface_id)} onChange={e => change('host_interface_id', Number(e.currentTarget.value))}>
        <option value="">Select interface</option>{interfaces.map(i => <option value={i.id}>{i.name} — {i.port}</option>)}
      </select></label>
      <label class="block">Address<input type="number" min="1" max="247" class={input} value={Number(f.modbus_address)} onInput={e => change('modbus_address', Number(e.currentTarget.value))} /></label>
      <label class="block">Driver<select class={input} value={String(f.driver)} onChange={e => {
        const driver = drivers.find(candidate => candidate.id === e.currentTarget.value);
        const labels = labelsFor(f.io_labels);
        const allowedInputs = new Set(driver?.inputs.map(item => item.path) ?? []);
        const allowedOutputs = new Set(driver?.outputs.map(item => String(item.channel)) ?? []);
        change('driver', e.currentTarget.value);
        change('io_labels', {
          inputs: Object.fromEntries(Object.entries(labels.inputs ?? {}).filter(([key]) => allowedInputs.has(key))),
          outputs: Object.fromEntries(Object.entries(labels.outputs ?? {}).filter(([key]) => allowedOutputs.has(key))),
        });
      }}>
        <option value="">Select driver</option>{drivers.map(d => <option value={d.id}>{d.name}</option>)}
      </select></label>
      {drivers.filter(d => d.id === f.driver).map(d => <p class="text-sm text-text-muted">{d.channel_count} channels · {d.fields.join(', ')}. Configuration: {d.configuration_effects}</p>)}
      {drivers.filter(d => d.id === f.driver).map(driver => {
        const labels = labelsFor(f.io_labels);
        const changeLabel = (section: 'inputs' | 'outputs', key: string, value: string) => change('io_labels', {
          ...labels,
          [section]: { ...(labels[section] ?? {}), [key]: value },
        });
        return <div key={driver.id} class="grid gap-5 border-t border-border pt-4 md:grid-cols-2">
          <section class="space-y-2">
            <h4 class="font-semibold">Inputs</h4>
            {driver.inputs.length === 0 ? <p class="text-sm text-text-muted">This driver has no inputs.</p> : driver.inputs.map(item => <label key={item.path} class="block text-sm">
              <span class="flex justify-between gap-2"><span>{item.label}</span><code class="text-xs text-text-muted">{item.path}</code></span>
              <input class={input} aria-label={`Custom label for ${item.label}`} placeholder={item.label}
                value={labels.inputs?.[item.path] ?? ''} onInput={event => changeLabel('inputs', item.path, event.currentTarget.value)} />
            </label>)}
          </section>
          <section class="space-y-2">
            <h4 class="font-semibold">Outputs</h4>
            {driver.outputs.length === 0 ? <p class="text-sm text-text-muted">This driver has no outputs.</p> : driver.outputs.map(item => {
              const key = String(item.channel);
              return <label key={key} class="block text-sm">
                <span class="flex justify-between gap-2"><span>{item.label}</span><code class="text-xs text-text-muted">Channel {item.channel}</code></span>
                <input class={input} aria-label={`Custom label for ${item.label}`} placeholder={item.label}
                  value={labels.outputs?.[key] ?? ''} onInput={event => changeLabel('outputs', key, event.currentTarget.value)} />
              </label>;
            })}
          </section>
        </div>;
      })}
    </>}
  </Editor>;
}
