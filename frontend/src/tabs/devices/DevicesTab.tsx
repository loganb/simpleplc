import { useLoaders } from '../../lib/DataLoader2';
import type { ExistingRecord, ReifiedQueryResult } from '../../lib/RestfulModelStore';
import type { DeviceFields, HostInterfaceFields } from '../../store';
import type { DevicesUXState } from '../../uxTree';
import { DeviceStateCard } from '../dashboard/DeviceStateCard';
import { DeviceForm } from './DeviceForm';
import { HostInterfaceForm } from './HostInterfaceForm';

export function DevicesTab({ devices, interfaces, ux, onRefresh }: {
  devices: ReifiedQueryResult<DeviceFields>;
  interfaces: ReifiedQueryResult<HostInterfaceFields>;
  ux: DevicesUXState;
  onRefresh: () => void;
}) {
  const { showHostInterfaceForm, showDeviceForm } = useLoaders(() => ({
    showHostInterfaceForm: ux.get('showHostInterfaceForm') ?? null,
    showDeviceForm: ux.get('showDeviceForm') ?? null,
  }), [ux], [ux]);

  const foundInterfaces = interfaces._loaded
    ? interfaces.filter((i) => i._found) as ExistingRecord<HostInterfaceFields>[]
    : [];
  const foundDevices = devices._loaded
    ? devices.filter((d) => d._found) as ExistingRecord<DeviceFields>[]
    : [];

  return (
    <div class="space-y-8">
      <section class="space-y-4">
        <div class="flex items-center justify-between gap-4">
          <h2 class="text-lg font-semibold">Host Interfaces</h2>
          <button
            class="rounded bg-active px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            onClick={() => ux.set('showHostInterfaceForm', 'new')}
          >
            New Interface
          </button>
        </div>

        {showHostInterfaceForm !== null && (
          <HostInterfaceForm
            editId={showHostInterfaceForm === 'new' ? null : showHostInterfaceForm}
            onClose={() => ux.set('showHostInterfaceForm', null)}
            onRefresh={onRefresh}
          />
        )}

        {!interfaces._loaded ? (
          <p class="text-text-muted">Loading host interfaces...</p>
        ) : foundInterfaces.length === 0 ? (
          <p class="text-text-muted">No host interfaces configured yet.</p>
        ) : (
          <div class="grid gap-3 lg:grid-cols-2">
            {foundInterfaces.map((iface) => (
              <button
                key={iface.id}
                class="rounded-lg border border-border bg-surface p-4 text-left hover:border-active"
                onClick={() => ux.set('showHostInterfaceForm', iface.id)}
              >
                <div class="flex items-center justify-between gap-3">
                  <h3 class="text-sm font-semibold">{iface.port}</h3>
                  <span class="text-xs text-text-muted">Edit</span>
                </div>
                <p class="mt-2 text-xs text-text-muted">
                  {iface.baud_rate} baud, {iface.data_bits}{iface.parity.charAt(0).toUpperCase()}{iface.stop_bits}
                </p>
              </button>
            ))}
          </div>
        )}
      </section>

      <section class="space-y-4">
        <div class="flex items-center justify-between gap-4">
          <h2 class="text-lg font-semibold">Devices</h2>
          <button
            class="rounded bg-active px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            disabled={foundInterfaces.length === 0}
            onClick={() => ux.set('showDeviceForm', 'new')}
          >
            New Device
          </button>
        </div>

        {showDeviceForm !== null && (
          <DeviceForm
            editId={showDeviceForm === 'new' ? null : showDeviceForm}
            interfaces={interfaces}
            onClose={() => ux.set('showDeviceForm', null)}
            onRefresh={onRefresh}
          />
        )}

        {!devices._loaded ? (
          <p class="text-text-muted">Loading devices...</p>
        ) : foundDevices.length === 0 ? (
          <p class="text-text-muted">No devices configured yet.</p>
        ) : (
          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {foundDevices.map((device) => (
              <div key={device.id} class="space-y-2">
                <DeviceStateCard device={device} interfaces={interfaces} />
                <button
                  class="w-full rounded border border-border px-3 py-1.5 text-sm font-medium text-text-muted hover:text-text"
                  onClick={() => ux.set('showDeviceForm', device.id)}
                >
                  Edit Device
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
