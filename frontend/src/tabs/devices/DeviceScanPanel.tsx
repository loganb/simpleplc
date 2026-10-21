import { useState } from 'preact/hooks';
import { useTxn } from '../../components/useTxn';
import { useLoaders } from '../../lib/DataLoader2';
import type { ExistingRecord } from '../../lib/RestfulModelStore';
import { Device, DeviceScan, Store } from '../../store';
import type { DeviceFields, DeviceScanFields, DriverFields, HostInterfaceFields, ScanResult } from '../../store';
import { bestSupport, buttonClass as btn, describeEvidence, distinctEvidence, inputClass as input, scanActive, sortedSupport, txnErrorMessage } from './hardware';
import { useDrivers } from './useDrivers';

/** The bus's latest scan (a new scan deletes older ones). Progress arrives over the record stream. */
function useLatestScan(interfaceId: number): ExistingRecord<DeviceScanFields> | null {
  const { scans } = useLoaders(() => ({ scans: Store.m(DeviceScan).queryFor(null, { host_interface_id: interfaceId }) }), [Store], [interfaceId]);
  return ([...scans].filter(s => s._found) as ExistingRecord<DeviceScanFields>[]).sort((a, b) => b.id - a.id)[0] ?? null;
}

export function DeviceScanPanel({ iface, devices, onRefresh }: { iface: HostInterfaceFields; devices: DeviceFields[]; onRefresh: () => void }) {
  const drivers = useDrivers();
  const scan = useLatestScan(iface.id);
  const [configuring, setConfiguring] = useState(false);
  const [range, setRange] = useState({ first: 1, last: 247 });
  const { start, busy, failure } = useTxn();
  const error = failure ? txnErrorMessage(failure) : '';
  const active = !!scan && scanActive(scan.state);
  const refreshScan = () => { Store.m(DeviceScan).queryFor(null, { host_interface_id: iface.id }, true); onRefresh(); };
  const startScan = () => start(Store.m(DeviceScan).create({ host_interface_id: iface.id, first_address: range.first, last_address: range.last }),
    () => { setConfiguring(false); refreshScan(); });
  const cancel = () => scan && start(Store.m(DeviceScan).patch(scan.id, { state: 'cancelled' }), refreshScan);
  // A result becomes a device by creating one, or by pointing an existing device at it.
  const adopt = (result: ScanResult, driver: string, existing?: DeviceFields) => start(existing
    ? Store.m(Device).patch(existing.id, { driver, modbus_address: result.address })
    : Store.m(Device).create({ host_interface_id: iface.id, name: `Device at ${result.address}`, driver, modbus_address: result.address }), onRefresh);
  return <div class="mt-4 border-t border-border pt-4 space-y-3">
    <h4 class="font-semibold">Discover devices</h4>
    {!active && !configuring && <div class="flex flex-wrap items-center gap-2">
      <button class={btn} disabled={iface.enabled || busy} onClick={() => setConfiguring(true)}>Scan for devices</button>
      {iface.enabled && <span class="text-sm text-text-muted">Disable the bus to scan.</span>}
    </div>}
    {!active && configuring && <div class="space-y-2">
      <p class="text-sm text-text-muted">Reads only, at this bus's serial settings ({iface.baud_rate} baud, {iface.data_bits}/{iface.parity}/{iface.stop_bits}). Other buses wait while it scans.</p>
      <div class="grid grid-cols-2 gap-2">
        <label class="text-sm">First address<input class={input} type="number" min="1" max="247" value={range.first} disabled={busy} onInput={e => setRange({ ...range, first: Number(e.currentTarget.value) })} /></label>
        <label class="text-sm">Last address<input class={input} type="number" min="1" max="247" value={range.last} disabled={busy} onInput={e => setRange({ ...range, last: Number(e.currentTarget.value) })} /></label>
      </div>
      <div class="flex gap-2">
        <button class={btn} disabled={iface.enabled || busy} onClick={startScan}>Start</button>
        <button class={btn} disabled={busy} onClick={() => setConfiguring(false)}>Close</button>
      </div>
    </div>}
    {scan && active && <div class="space-y-2">
      <progress class="w-full" max={scan.total} value={scan.completed} aria-label="Scan progress" />
      <div class="flex flex-wrap items-center gap-2">
        <span role="status" class="text-sm">{scan.state === 'pending' ? 'Waiting for the poller…' : `Scanning ${scan.completed}/${scan.total}`}</span>
        <button class={btn} disabled={busy} onClick={cancel}>Cancel scan</button>
      </div>
    </div>}
    {error && <p role="alert" class="text-error">{error}</p>}
    {scan && !active && <ScanSummary scan={scan} iface={iface} />}
    {scan && scan.results.map(result => <ScanResultRow key={`${scan.id}-${result.address}`} result={result} drivers={drivers} devices={devices}
      disabled={busy || active || iface.enabled} onAdopt={(driver, existing) => adopt(result, driver, existing)} />)}
  </div>;
}

function ScanSummary({ scan, iface }: { scan: DeviceScanFields; iface: HostInterfaceFields }) {
  if (scan.state === 'failed') return <p role="alert" class="text-error">Scan failed{scan.error ? `: ${scan.error}` : '.'}</p>;
  const range = `addresses ${scan.first_address}–${scan.last_address}`;
  if (scan.state === 'cancelled') return <p role="status" class="text-sm">Scan cancelled after {scan.completed}/{scan.total} ({range}).</p>;
  if (scan.results.length === 0) {
    return <p role="status" class="text-sm">No devices responded at {iface.baud_rate} baud, {iface.data_bits}/{iface.parity}/{iface.stop_bits}. Check wiring, power and serial settings.</p>;
  }
  return <p role="status" class="text-sm">Scan finished ({range}): {scan.results.length} responded.</p>;
}

function ScanResultRow({ result, drivers, devices, disabled, onAdopt }: {
  result: ScanResult; drivers: ExistingRecord<DriverFields>[]; devices: DeviceFields[];
  disabled: boolean; onAdopt: (driver: string, existing?: DeviceFields) => void;
}) {
  const best = bestSupport(result.driver_support);
  const [driver, setDriver] = useState(best?.driver ?? '');
  const [match, setMatch] = useState('new');
  const driverName = (id: string) => drivers.find(d => d.id === id)?.name || id;
  const configured = devices.find(d => d.modbus_address === result.address);
  const existing = devices.find(d => String(d.id) === match);
  const configuredVerdict = configured && result.driver_support.find(v => v.driver === configured.driver);
  // The evidence disagrees with what's configured: ruled out, or another driver fits and this one doesn't clearly.
  const disagrees = !!configured && (configuredVerdict?.support === 'no'
    || (best?.support === 'yes' && best.driver !== configured.driver && configuredVerdict?.support !== 'yes'));
  return <section class="rounded border border-border p-3 space-y-2">
    <h5 class="font-semibold">Responding address {result.address}</h5>
    {configured ? <>
      <p class="text-sm">Configured as <strong>{configured.name || `Device #${configured.id}`}</strong> ({driverName(configured.driver)})</p>
      {disagrees && <p class="text-sm text-error">The scan evidence disagrees with this driver{best ? `; it looks more like ${driverName(best.driver)}` : ''}. See why below.</p>}
    </> : <fieldset disabled={disabled} class="space-y-2">
      <label class="block text-sm">Driver<select class={input} value={driver} onChange={e => setDriver(e.currentTarget.value)}>
        <option value="">Select driver</option>
        {sortedSupport(result.driver_support).map(v => <option key={v.driver} value={v.driver} disabled={v.support === 'no'}>{driverName(v.driver)} — {v.support.toUpperCase()}</option>)}
      </select></label>
      <label class="block text-sm">Use as<select class={input} value={match} onChange={e => setMatch(e.currentTarget.value)}>
        <option value="new">New device</option>{devices.map(d => <option key={d.id} value={d.id}>Device #{d.id}: {d.name} (address {d.modbus_address})</option>)}
      </select></label>
      <button class={btn} disabled={!driver} onClick={() => onAdopt(driver, existing)}>{existing ? `Use for device #${existing.id}` : 'Add as new device'}</button>
    </fieldset>}
    <details class="text-sm"><summary class="text-xs cursor-pointer">Why?</summary>
      <ul class="mt-1 space-y-1">{sortedSupport(result.driver_support).map(v => <li key={v.driver}>
        {driverName(v.driver)} — <strong>{v.support.toUpperCase()}</strong>: <span class="text-text-muted">{v.reason}</span>
      </li>)}</ul>
      <p class="mt-2 text-xs font-semibold">Registers read</p>
      <ul class="text-xs text-text-muted">{distinctEvidence(result.driver_support).map((item, i) => <li key={i}>{describeEvidence(item)}</li>)}</ul>
    </details>
  </section>;
}
