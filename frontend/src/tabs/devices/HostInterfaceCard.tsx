import { useEffect, useState } from 'preact/hooks';
import { AxiosClient } from '../../store';
import type { DeviceFields, HostInterfaceFields } from '../../store';
import { DeviceScanPanel } from './DeviceScanPanel';
import { ImpactView } from './HardwareForms';
import type { Impact } from './HardwareForms';
import { buttonClass as btn, errorMessage, scanActive } from './hardware';

export function HostInterfaceCard({ iface, devices, onEdit, onRefresh }: { iface: HostInterfaceFields; devices: DeviceFields[]; onEdit: () => void; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [impact, setImpact] = useState<Impact | null>(null);
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
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const enable = () => run(async () => {
    const baseline = Object.fromEntries(devices.map(d => [d.id, { last: d.last_polled_at, count: 0 }]));
    await AxiosClient.patch(`/host_interfaces/${iface.id}`, { host_interface: { enabled: true, configuration_revision: iface.configuration_revision } });
    setStarted(Date.now()); setVerification(baseline); setImpact(null); onRefresh();
  });
  const verified = verification && Object.keys(verification).length > 0 && Object.values(verification).every(v => v.count >= 2);
  return <section class="rounded-lg border border-border bg-surface p-4 space-y-3">
    <div class="flex items-start justify-between"><h3 class="font-semibold">{iface.name}</h3><span class="text-sm">{!iface.port_present ? 'Missing · ' : ''}{iface.enabled ? iface.connection_state : 'Disabled'}{scanActive(iface.scan_state) ? ` · ${iface.scan_state}` : ''}</span></div>
    <p class="text-xs font-mono break-all">{iface.port}</p>
    <p class="text-sm text-text-muted">{iface.baud_rate} baud · {iface.data_bits}/{iface.parity}/{iface.stop_bits}</p>
    {iface.connection_error && <p class="text-error text-sm">{iface.connection_error}</p>}
    {error && <p role="alert" class="text-error">{error}</p>}
    <div class="flex flex-wrap gap-2">
      <button class={btn} onClick={onEdit}>Edit / Replace port</button>
      <button class={btn} disabled={busy || scanActive(iface.scan_state)} onClick={() => run(async () => {
        if (!iface.enabled) { setImpact((await AxiosClient.get(`/host_interfaces/${iface.id}/impact`)).data); return; }
        await AxiosClient.patch(`/host_interfaces/${iface.id}`, { host_interface: { enabled: false, configuration_revision: iface.configuration_revision } });
        setVerification(null); onRefresh();
      })}>{iface.enabled ? 'Disable' : 'Review and enable'}</button>
      {iface.enabled && <button class={btn} onClick={() => { setStarted(Date.now()); setVerification(Object.fromEntries(devices.map(d => [d.id, { last: d.last_polled_at, count: 0 }]))); }}>Verify fresh polls</button>}
    </div>
    {impact && !iface.enabled && <div class="rounded border border-border p-3 space-y-2">
      <p>Enabling starts normal polling, driver configuration and any enabled output assignments. Relay configuration sets inputs and outputs to unrelated mode.</p>
      <ImpactView impact={impact} />
      <button class={btn} disabled={busy || scanActive(iface.scan_state)} onClick={enable}>Enable operation</button>
      <button class={btn} onClick={() => setImpact(null)}>Keep disabled</button>
    </div>}
    {verification && iface.enabled && <p role="status" class="text-sm">{verified ? 'Verified: two successful fresh polls for every device.' : devices.length ? 'Waiting for two successful fresh polls per device…' : 'No devices configured to verify.'}</p>}
    <DeviceScanPanel iface={iface} devices={devices} onRefresh={onRefresh} />
  </section>;
}
