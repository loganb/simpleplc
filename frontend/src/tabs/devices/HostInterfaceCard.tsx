import { useTxn } from '../../components/useTxn';
import { HostInterface, Store } from '../../store';
import type { DeviceFields, HostInterfaceFields } from '../../store';
import { DeviceScanPanel } from './DeviceScanPanel';
import { buttonClass as btn, txnErrorMessage } from './hardware';

export function HostInterfaceCard({ iface, devices, onEdit, onRefresh }: { iface: HostInterfaceFields; devices: DeviceFields[]; onEdit: () => void; onRefresh: () => void }) {
  const { start, busy, failure } = useTxn();
  const error = failure ? txnErrorMessage(failure) : '';
  // A plain toggle. The server refuses to enable a bus that has a scan pending or running.
  const toggle = () => start(Store.m(HostInterface).patch(iface.id, { enabled: !iface.enabled }), onRefresh);
  return <section class="rounded-lg border border-border bg-surface p-4 space-y-3">
    <div class="flex items-start justify-between"><h3 class="font-semibold">{iface.name}</h3><span class="text-sm capitalize">{!iface.port_present ? 'Missing · ' : ''}{iface.connection_state}</span></div>
    <p class="text-xs font-mono break-all">{iface.port}</p>
    <p class="text-sm text-text-muted">{iface.baud_rate} baud · {iface.data_bits}/{iface.parity}/{iface.stop_bits} · every {iface.update_period}s</p>
    {iface.connection_error && <p class="text-error text-sm">{iface.connection_error}</p>}
    {error && <p role="alert" class="text-error">{error}</p>}
    <div class="flex flex-wrap gap-2">
      <button class={btn} onClick={onEdit}>Edit / Replace port</button>
      <button class={btn} disabled={busy} onClick={toggle}>{iface.enabled ? 'Disable' : 'Enable'}</button>
    </div>
    <DeviceScanPanel iface={iface} devices={devices} onRefresh={onRefresh} />
  </section>;
}
