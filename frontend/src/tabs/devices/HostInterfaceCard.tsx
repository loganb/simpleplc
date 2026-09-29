import { useEffect, useState } from 'preact/hooks';
import { useTxn } from '../../components/useTxn';
import { HostInterface, Store } from '../../store';
import type { DeviceFields, HostInterfaceFields } from '../../store';
import { DeviceScanPanel } from './DeviceScanPanel';
import { ImpactView } from './HardwareForms';
import { buttonClass as btn, scanActive, txnErrorMessage } from './hardware';
import { useImpact } from './useImpact';

export function HostInterfaceCard({ iface, devices, onEdit, onRefresh }: { iface: HostInterfaceFields; devices: DeviceFields[]; onEdit: () => void; onRefresh: () => void }) {
  const { start, busy, failure } = useTxn();
  const error = failure ? txnErrorMessage(failure) : '';
  const [reviewing, setReviewing] = useState(false);
  const impact = useImpact(devices);
  const [verification, setVerification] = useState<Record<number, { last: string | null; count: number }> | null>(null);
  const [started, setStarted] = useState(0);
  useEffect(() => {
    if (!iface.enabled) return;
    if (!verification) return;
    let changed = false;
    const next = { ...verification };
    for (const device of devices) {
      const old = next[device.id];
      if (old && device.last_polled_at && Date.parse(device.last_polled_at) >= started && device.last_polled_at !== old.last) {
        next[device.id] = { last: device.last_polled_at, count: device.current_state?.status === 'ok' ? Math.min(2, old.count + 1) : 0 }; changed = true;
      }
    }
    if (changed) setVerification(next);
  }, [devices, iface.enabled, started]);
  const setEnabled = (enabled: boolean, then: () => void) =>
    start(Store.m(HostInterface).patch(iface.id, { enabled, configuration_revision: iface.configuration_revision }), () => { then(); onRefresh(); });
  const enable = () => {
    const baseline = Object.fromEntries(devices.map(d => [d.id, { last: d.last_polled_at, count: 0 }]));
    setEnabled(true, () => { setStarted(Date.now()); setVerification(baseline); setReviewing(false); });
  };
  const verified = verification && Object.keys(verification).length > 0 && Object.values(verification).every(v => v.count >= 2);
  return <section class="rounded-lg border border-border bg-surface p-4 space-y-3">
    <div class="flex items-start justify-between"><h3 class="font-semibold">{iface.name}</h3><span class="text-sm">{!iface.port_present ? 'Missing · ' : ''}{iface.enabled ? iface.connection_state : 'Disabled'}{scanActive(iface.scan_state) ? ` · ${iface.scan_state}` : ''}</span></div>
    <p class="text-xs font-mono break-all">{iface.port}</p>
    <p class="text-sm text-text-muted">{iface.baud_rate} baud · {iface.data_bits}/{iface.parity}/{iface.stop_bits}</p>
    {iface.connection_error && <p class="text-error text-sm">{iface.connection_error}</p>}
    {error && <p role="alert" class="text-error">{error}</p>}
    <div class="flex flex-wrap gap-2">
      <button class={btn} onClick={onEdit}>Edit / Replace port</button>
      <button class={btn} disabled={busy || scanActive(iface.scan_state)} onClick={() => {
        if (!iface.enabled) setReviewing(true);
        else setEnabled(false, () => setVerification(null));
      }}>{iface.enabled ? 'Disable' : 'Review and enable'}</button>
      {iface.enabled && <button class={btn} onClick={() => { setStarted(Date.now()); setVerification(Object.fromEntries(devices.map(d => [d.id, { last: d.last_polled_at, count: 0 }]))); }}>Verify fresh polls</button>}
    </div>
    {reviewing && !iface.enabled && <div class="rounded border border-border p-3 space-y-2">
      <p>Enabling starts normal polling, driver configuration and any enabled output assignments. Relay configuration sets inputs and outputs to unrelated mode.</p>
      {impact ? <ImpactView impact={impact} /> : <p class="text-sm">Checking dependencies…</p>}
      <button class={btn} disabled={busy || scanActive(iface.scan_state)} onClick={enable}>Enable operation</button>
      <button class={btn} onClick={() => setReviewing(false)}>Keep disabled</button>
    </div>}
    {verification && iface.enabled && <p role="status" class="text-sm">{verified ? 'Verified: two successful fresh polls for every device.' : devices.length ? 'Waiting for two successful fresh polls per device…' : 'No devices configured to verify.'}</p>}
    <DeviceScanPanel iface={iface} devices={devices} onRefresh={onRefresh} />
  </section>;
}
