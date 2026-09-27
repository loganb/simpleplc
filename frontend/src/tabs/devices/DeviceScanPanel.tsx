import { useEffect, useRef, useState } from 'preact/hooks';
import { AxiosClient } from '../../store';
import type { DeviceFields, DriverFields, HostInterfaceFields, ScanDevice } from '../../store';
import { adoptResult, buttonClass as btn, deviceDraft, errorMessage, inputClass as input, scanActive, sortedSupport } from './hardware';
import type { DeviceDraft } from './hardware';
import { ImpactView } from './HardwareForms';
import type { Impact } from './HardwareForms';
const token = () => `hardware-${Date.now()}-${Math.random().toString(36).slice(2)}`;
interface Preview { devices: DeviceDraft[]; deleted_ids: number[]; impact: Impact }

export function DeviceScanPanel({ iface, devices, onRefresh }: { iface: HostInterfaceFields; devices: DeviceFields[]; onRefresh: () => void }) {
  const [drivers, setDrivers] = useState<DriverFields[]>([]);
  const [range, setRange] = useState({ first: 1, last: 247 });
  const [bauds, setBauds] = useState(String(iface.baud_rate));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<DeviceDraft[] | null>(null);
  const [revision, setRevision] = useState(iface.configuration_revision);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewRequest, setPreviewRequest] = useState<object | null>(null);
  const [current, setCurrent] = useState<{ rows: DeviceDraft[]; revision: number } | null>(null);
  const scanToken = useRef<string | null>(null);
  const active = scanActive(iface.scan_state);
  const changed = draft !== null && revision !== iface.configuration_revision;
  useEffect(() => { AxiosClient.get('/drivers').then(r => setDrivers(r.data.drivers)).catch(e => setError(errorMessage(e))); }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const edit = (rows: DeviceDraft[]) => { setDraft(rows); setPreview(null); setPreviewRequest(null); };
  const rows = draft ?? devices.map(deviceDraft);
  const choose = (result: ScanDevice, driver: string, id?: number) => {
    if (draft === null) setRevision(iface.configuration_revision);
    edit(adoptResult(rows, result, driver, iface.scan_request_id!, id));
  };
  const startScan = () => run(async () => {
    scanToken.current ||= token();
    const profiles = bauds.split(',').map(v => ({ baud_rate: Number(v.trim()), data_bits: iface.data_bits, stop_bits: iface.stop_bits, parity: iface.parity }));
    await AxiosClient.post(`/host_interfaces/${iface.id}/scan`, { request_id: scanToken.current, options: { first_address: range.first, last_address: range.last, profiles } });
    scanToken.current = null; onRefresh();
  });
  return <div class="mt-4 border-t border-border pt-4 space-y-3">
    <h4 class="font-semibold">Discover devices</h4>
    <p class="text-sm text-text-muted">Scan reads only. Disable this bus first. Other buses wait while it scans; existing relay states are unchanged.</p>
    <div class="grid grid-cols-2 gap-2">
      <label class="text-sm">First address<input class={input} type="number" min="1" max="247" value={range.first} disabled={active || busy} onInput={e => { setRange({ ...range, first: Number(e.currentTarget.value) }); scanToken.current = null; }} /></label>
      <label class="text-sm">Last address<input class={input} type="number" min="1" max="247" value={range.last} disabled={active || busy} onInput={e => { setRange({ ...range, last: Number(e.currentTarget.value) }); scanToken.current = null; }} /></label>
    </div>
    <label class="block text-sm">Baud rates (up to four, comma separated)<input class={input} value={bauds} disabled={active || busy} onInput={e => { setBauds(e.currentTarget.value); scanToken.current = null; }} /></label>
    <p class="text-xs text-text-muted">Using {iface.data_bits} data bits, {iface.parity} parity, {iface.stop_bits} stop bit(s). Edit the disabled interface to test other settings.</p>
    <div class="flex flex-wrap gap-2 items-center">
      <button class={btn} disabled={iface.enabled || active || busy || draft !== null} onClick={startScan}>{iface.scan_state === 'idle' ? 'Scan devices' : 'Scan again (replace results)'}</button>
      {active && <button class={btn} disabled={busy || iface.scan_cancel_requested} onClick={() => run(async () => {
        await AxiosClient.post(`/host_interfaces/${iface.id}/cancel_scan`, { request_id: iface.scan_request_id }); onRefresh();
      })}>{iface.scan_cancel_requested ? 'Cancelling…' : 'Cancel scan'}</button>}
      <span role="status" class="text-sm">{iface.scan_state} {active || iface.scan_finished_at ? `${iface.scan_results.completed || 0}/${iface.scan_results.total || 0}` : ''}</span>
    </div>
    {iface.scan_state === 'requested' && <p class="text-sm">Waiting for the poller. You can cancel if it is unavailable or busy with another bus.</p>}
    {iface.scan_started_at && <p class="text-xs text-text-muted">Started {new Date(iface.scan_started_at).toLocaleString()}{iface.scan_finished_at ? ` · Finished ${new Date(iface.scan_finished_at).toLocaleString()}` : ''}</p>}
    {iface.scan_results.error && <p role="alert" class="text-error">{iface.scan_results.error}</p>}
    {error && <p role="alert" class="text-error">{error}</p>}
    {iface.scan_state === 'completed' && !iface.scan_results.devices?.length && <p>No responding devices at the tested settings. Check wiring, power and serial settings.</p>}
    {(iface.scan_results.devices || []).map(result => <ScanResult key={`${iface.scan_request_id}-${result.profile_index}-${result.address}`} result={result} groupId={iface.id} drivers={drivers} rows={rows}
      disabled={busy || active || iface.enabled || changed} onChoose={(driver, id) => choose(result, driver, id)} />)}
    {iface.scan_results.diagnostics?.length ? <details><summary>Communication diagnostics</summary><pre class="text-xs overflow-auto">{JSON.stringify(iface.scan_results.diagnostics, null, 2)}</pre></details> : null}
    <div class="space-y-2 border-t border-border pt-3">
      <h4 class="font-semibold">Review configuration</h4>
      <p class="text-sm">Unmatched devices are kept until you explicitly remove them. Changes below are a draft until applied.</p>
      {draft === null && <button class={btn} disabled={busy || active || iface.enabled} onClick={() => { setRevision(iface.configuration_revision); edit(devices.map(deviceDraft)); }}>Edit device list</button>}
      {draft !== null && <>
        {rows.map((row, index) => <div key={index} class="rounded border border-border p-2 space-y-2">
          <label class="block text-xs">Device name<input class={input} value={row.name} disabled={busy} onInput={e => edit(rows.map((r, i) => i === index ? { ...r, name: e.currentTarget.value } : r))} /></label>
          <p class="text-sm">Address {row.modbus_address} · {drivers.find(d => d.id === row.driver)?.name || row.driver} · {row.id ? `existing #${row.id}` : 'new'}</p>
          <button class={`${btn} text-error`} disabled={busy} onClick={() => edit(rows.filter((_, i) => i !== index))}>Remove from proposed configuration</button>
        </div>)}
        {changed && <p class="text-error">Configuration changed since this draft began. Reload for comparison before previewing again.</p>}
        <div class="flex flex-wrap gap-2">
          <button class={btn} disabled={busy || active || iface.enabled || changed} onClick={() => run(async () => {
            const request = { configuration_revision: revision, request_id: token(), devices: rows };
            const r = await AxiosClient.post(`/host_interfaces/${iface.id}/preview`, request);
            setPreview(r.data); setPreviewRequest(request);
          })}>Preview changes</button>
          <button class={btn} disabled={busy} onClick={() => run(async () => {
            const [b, d] = await Promise.all([AxiosClient.get(`/host_interfaces/${iface.id}`), AxiosClient.get('/devices', { params: { host_interface_id: iface.id } })]);
            setCurrent({ revision: b.data.host_interfaces[0].configuration_revision, rows: (d.data.devices || []).map(deviceDraft) });
          })}>Reload for comparison</button>
          <button class={btn} disabled={busy} onClick={() => { setDraft(null); setPreview(null); setCurrent(null); setError(''); }}>Discard draft</button>
        </div>
        {current && <div class="space-y-2"><p>Current saved devices:</p>{current.rows.map(r => <p class="text-sm">#{r.id} {r.name}, address {r.modbus_address}</p>)}
          <button class={btn} onClick={() => { setRevision(current.revision); setCurrent(null); setPreview(null); }}>Keep draft against this revision</button>
          <button class={btn} onClick={() => { edit(current.rows); setRevision(current.revision); setCurrent(null); }}>Use saved devices</button>
        </div>}
        {preview && <div class="rounded border border-border p-3 space-y-2">
          <h5 class="font-semibold">Ready to apply</h5>
          {preview.devices.map((d, i) => <p key={i} class="text-sm">{d.id ? `Update/keep #${d.id}` : 'Add'}: {d.name} — address {d.modbus_address}</p>)}
          <p class="text-sm">Delete device IDs: {preview.deleted_ids.join(', ') || 'none'}</p>
          <ImpactView impact={preview.impact} />
          <button class={btn} disabled={busy || active || iface.enabled || changed} onClick={() => run(async () => {
            await AxiosClient.post(`/host_interfaces/${iface.id}/apply`, previewRequest);
            setDraft(null); setPreview(null); setPreviewRequest(null); onRefresh();
          })}>Apply configuration</button>
        </div>}
      </>}
    </div>
  </div>;
}

function ScanResult({ result, groupId, drivers, rows, disabled, onChoose }: { result: ScanDevice; groupId: number; drivers: DriverFields[]; rows: DeviceDraft[]; disabled: boolean; onChoose: (driver: string, id?: number) => void }) {
  const [driver, setDriver] = useState('');
  const [match, setMatch] = useState('new');
  return <section class="rounded border border-border p-3 space-y-2">
    <h5 class="font-semibold">Responding address {result.address}</h5>
    <p class="text-xs text-text-muted">{result.profile.baud_rate} baud · {result.profile.data_bits}/{result.profile.parity}/{result.profile.stop_bits} · {new Date(result.observed_at).toLocaleTimeString()}</p>
    <fieldset disabled={disabled} class="space-y-2">
      {sortedSupport(result.driver_support).map(verdict => <label key={verdict.driver} class="block text-sm">
        <input type="radio" name={`driver-${groupId}-${result.profile_index}-${result.address}`} checked={driver === verdict.driver} disabled={verdict.support === 'no'} onChange={() => setDriver(verdict.driver)} />
        {' '}{drivers.find(d => d.id === verdict.driver)?.name || verdict.driver} — <strong>{verdict.support.toUpperCase()}</strong>
        <span class="block text-xs text-text-muted ml-5">{verdict.reason}</span>
      </label>)}
      <label class="block text-sm">Use as<select class={input} value={match} onChange={e => setMatch(e.currentTarget.value)}>
        <option value="new">New device</option>{rows.filter(d => d.id).map(d => <option key={d.id} value={d.id}>Match #{d.id}: {d.name} (address {d.modbus_address})</option>)}
      </select></label>
      <button class={btn} disabled={!driver} onClick={() => onChoose(driver, match === 'new' ? undefined : Number(match))}>Add choice to draft</button>
    </fieldset>
    <details><summary class="text-xs">Read evidence</summary><pre class="text-xs overflow-auto">{JSON.stringify(result.driver_support, null, 2)}</pre></details>
  </section>;
}
