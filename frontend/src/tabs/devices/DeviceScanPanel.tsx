import { useState } from 'preact/hooks';
import { useTxn } from '../../components/useTxn';
import type { ExistingRecord } from '../../lib/RestfulModelStore';
import { Device, HostInterface, Store } from '../../store';
import type { DeviceFields, DriverFields, HostInterfaceFields, ScanDevice } from '../../store';
import { buttonClass as btn, inputClass as input, matchesBus, scanActive, sortedSupport, txnErrorMessage } from './hardware';
import { useDrivers } from './useDrivers';

export function DeviceScanPanel({ iface, devices, onRefresh }: { iface: HostInterfaceFields; devices: DeviceFields[]; onRefresh: () => void }) {
  const drivers = useDrivers();
  const [range, setRange] = useState({ first: 1, last: 247 });
  const [bauds, setBauds] = useState(String(iface.baud_rate));
  const { start, busy, failure } = useTxn();
  const error = failure ? txnErrorMessage(failure) : '';
  const active = scanActive(iface.scan_state);
  const startScan = () => {
    const profiles = bauds.split(',').map(v => ({ baud_rate: Number(v.trim()), data_bits: iface.data_bits, stop_bits: iface.stop_bits, parity: iface.parity }));
    start(Store.m(HostInterface).patch(iface.id, { scan_state: 'requested', scan_options: { first_address: range.first, last_address: range.last, profiles } }), onRefresh);
  };
  // A result becomes a device by creating one, or by pointing an existing device at it.
  const adopt = (result: ScanDevice, driver: string, existing?: DeviceFields) => start(existing
    ? Store.m(Device).patch(existing.id, { driver, modbus_address: result.address, configuration_revision: existing.configuration_revision })
    : Store.m(Device).create({ host_interface_id: iface.id, name: `Device at ${result.address}`, driver, modbus_address: result.address }), onRefresh);
  return <div class="mt-4 border-t border-border pt-4 space-y-3">
    <h4 class="font-semibold">Discover devices</h4>
    <p class="text-sm text-text-muted">Scan reads only. Disable this bus first. Other buses wait while it scans; existing relay states are unchanged.</p>
    <div class="grid grid-cols-2 gap-2">
      <label class="text-sm">First address<input class={input} type="number" min="1" max="247" value={range.first} disabled={active || busy} onInput={e => setRange({ ...range, first: Number(e.currentTarget.value) })} /></label>
      <label class="text-sm">Last address<input class={input} type="number" min="1" max="247" value={range.last} disabled={active || busy} onInput={e => setRange({ ...range, last: Number(e.currentTarget.value) })} /></label>
    </div>
    <label class="block text-sm">Baud rates (up to four, comma separated)<input class={input} value={bauds} disabled={active || busy} onInput={e => setBauds(e.currentTarget.value)} /></label>
    <p class="text-xs text-text-muted">Using {iface.data_bits} data bits, {iface.parity} parity, {iface.stop_bits} stop bit(s). Edit the disabled interface to test other settings.</p>
    <div class="flex flex-wrap gap-2 items-center">
      <button class={btn} disabled={iface.enabled || active || busy} onClick={startScan}>{iface.scan_state === 'idle' ? 'Scan devices' : 'Scan again (replace results)'}</button>
      {active && <button class={btn} disabled={busy || iface.scan_state === 'cancelling'} onClick={() => start(Store.m(HostInterface).patch(iface.id, { scan_state: 'cancelling' }), onRefresh)}>
        {iface.scan_state === 'cancelling' ? 'Cancelling…' : 'Cancel scan'}</button>}
      <span role="status" class="text-sm">{iface.scan_state} {active || iface.scan_finished_at ? `${iface.scan_results.completed || 0}/${iface.scan_results.total || 0}` : ''}</span>
    </div>
    {iface.scan_state === 'requested' && <p class="text-sm">Waiting for the poller. You can cancel if it is unavailable or busy with another bus.</p>}
    {iface.scan_started_at && <p class="text-xs text-text-muted">Started {new Date(iface.scan_started_at).toLocaleString()}{iface.scan_finished_at ? ` · Finished ${new Date(iface.scan_finished_at).toLocaleString()}` : ''}</p>}
    {iface.scan_results.error && <p role="alert" class="text-error">{iface.scan_results.error}</p>}
    {error && <p role="alert" class="text-error">{error}</p>}
    {iface.scan_state === 'completed' && !iface.scan_results.devices?.length && <p>No responding devices at the tested settings. Check wiring, power and serial settings.</p>}
    {(iface.scan_results.devices || []).map(result => <ScanResult key={`${iface.scan_request_id}-${result.profile_index}-${result.address}`} result={result} iface={iface} drivers={drivers} devices={devices}
      disabled={busy || active || iface.enabled} onAdopt={(driver, existing) => adopt(result, driver, existing)} />)}
    {iface.scan_results.devices?.length ? <p class="text-xs text-text-muted">To remove a device that didn't respond, use its Edit Device dialog.</p> : null}
    {iface.scan_results.diagnostics?.length ? <details><summary>Communication diagnostics</summary><pre class="text-xs overflow-auto">{JSON.stringify(iface.scan_results.diagnostics, null, 2)}</pre></details> : null}
  </div>;
}

function ScanResult({ result, iface, drivers, devices, disabled, onAdopt }: {
  result: ScanDevice; iface: HostInterfaceFields; drivers: ExistingRecord<DriverFields>[]; devices: DeviceFields[];
  disabled: boolean; onAdopt: (driver: string, existing?: DeviceFields) => void;
}) {
  const [driver, setDriver] = useState('');
  const [match, setMatch] = useState('new');
  const existing = devices.find(d => String(d.id) === match);
  const settingsMatch = matchesBus(result.profile, iface);
  return <section class="rounded border border-border p-3 space-y-2">
    <h5 class="font-semibold">Responding address {result.address}</h5>
    <p class="text-xs text-text-muted">{result.profile.baud_rate} baud · {result.profile.data_bits}/{result.profile.parity}/{result.profile.stop_bits} · {new Date(result.observed_at).toLocaleTimeString()}</p>
    {!settingsMatch && <p class="text-sm text-error">Found at different serial settings from this interface. Edit the interface to use them before adding this device.</p>}
    <fieldset disabled={disabled || !settingsMatch} class="space-y-2">
      {sortedSupport(result.driver_support).map(verdict => <label key={verdict.driver} class="block text-sm">
        <input type="radio" name={`driver-${iface.id}-${result.profile_index}-${result.address}`} checked={driver === verdict.driver} disabled={verdict.support === 'no'} onChange={() => setDriver(verdict.driver)} />
        {' '}{drivers.find(d => d.id === verdict.driver)?.name || verdict.driver} — <strong>{verdict.support.toUpperCase()}</strong>
        <span class="block text-xs text-text-muted ml-5">{verdict.reason}</span>
      </label>)}
      <label class="block text-sm">Use as<select class={input} value={match} onChange={e => setMatch(e.currentTarget.value)}>
        <option value="new">New device</option>{devices.map(d => <option key={d.id} value={d.id}>Device #{d.id}: {d.name} (address {d.modbus_address})</option>)}
      </select></label>
      <button class={btn} disabled={!driver} onClick={() => onAdopt(driver, existing)}>{existing ? `Use for device #${existing.id}` : 'Add as new device'}</button>
    </fieldset>
    <details><summary class="text-xs">Read evidence</summary><pre class="text-xs overflow-auto">{JSON.stringify(result.driver_support, null, 2)}</pre></details>
  </section>;
}
