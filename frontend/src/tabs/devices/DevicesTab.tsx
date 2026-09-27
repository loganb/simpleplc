import { useEffect, useRef, useState } from 'preact/hooks';
import { useLoaders } from '../../lib/DataLoader2';
import type { ExistingRecord, ReifiedQueryResult } from '../../lib/RestfulModelStore';
import { Device, HostInterface, HostPort, Store } from '../../store';
import type { DeviceFields, HostInterfaceFields, HostPortFields } from '../../store';
import type { DevicesUXState } from '../../uxTree';
import { DeviceStateCard } from '../dashboard/DeviceStateCard';
import { DeviceForm } from './DeviceForm';
import { HostInterfaceCard } from './HostInterfaceCard';
import { HostInterfaceForm } from './HostInterfaceForm';
import { HostPortScanner } from './HostPortScanner';

export function DevicesTab({ devices, interfaces, ux, onRefresh }: {
  devices: ReifiedQueryResult<DeviceFields>;
  interfaces: ReifiedQueryResult<HostInterfaceFields>;
  ux: DevicesUXState;
  onRefresh: () => void;
}) {
  useEffect(() => {
    const timer = setInterval(() => {
      Store.m(HostInterface).queryFor(null, {}, true);
      Store.m(Device).queryFor(null, {}, true);
    }, 3000);
    return () => clearInterval(timer);
  }, []);
  // Scans are forced separately from the app-wide refresh so "Rescan" re-reads
  // the host even though nothing in the database changed.
  const [scanToken, setScanToken] = useState(0);
  const lastScanToken = useRef(0);

  const { showHostInterfaceForm, showDeviceForm, showPortScan, prefillPortId, ports } = useLoaders(() => {
    const force = scanToken !== lastScanToken.current;
    lastScanToken.current = scanToken;
    return ({
    showHostInterfaceForm: ux.get('showHostInterfaceForm') ?? null,
    showDeviceForm: ux.get('showDeviceForm') ?? null,
    showPortScan: ux.get('showPortScan') ?? false,
    prefillPortId: ux.get('prefillPortId') ?? null,
    ports: Store.m(HostPort).queryFor(null, {}, force),
    });
  }, [ux, Store], [ux, scanToken]);

  const prefillRecord = prefillPortId !== null ? Store.m(HostPort).fetch(prefillPortId) : null;
  const prefillPort = prefillRecord?._found
    ? prefillRecord as ExistingRecord<HostPortFields>
    : null;

  const usePort = (port: ExistingRecord<HostPortFields>) => {
    ux.set('prefillPortId', port.id);
    ux.set('showHostInterfaceForm', 'new');
  };

  const closeInterfaceForm = () => {
    ux.set('showHostInterfaceForm', null);
    ux.set('prefillPortId', null);
  };

  const refreshAfterInterfaceChange = () => {
    // A new or deleted interface changes which ports read as claimed.
    setScanToken((token) => token + 1);
    onRefresh();
  };

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
            class="rounded border border-border px-3 py-1.5 text-sm font-medium text-text-muted hover:text-text"
            onClick={() => {
              ux.set('prefillPortId', null);
              ux.set('showHostInterfaceForm', 'new');
            }}
          >
            Add Manually
          </button>
        </div>

        <HostPortScanner
          ports={ports}
          expanded={showPortScan}
          onToggle={() => ux.set('showPortScan', !showPortScan)}
          onRescan={() => setScanToken((token) => token + 1)}
          onUsePort={usePort}
        />

        {showHostInterfaceForm !== null && (
          <HostInterfaceForm
            key={`${showHostInterfaceForm}-${prefillPortId}`}
            editId={showHostInterfaceForm === 'new' ? null : showHostInterfaceForm}
            prefill={showHostInterfaceForm === 'new' && prefillPort
              ? { port: prefillPort.stable_path, name: prefillPort.label }
              : null}
            onClose={closeInterfaceForm}
            onRefresh={refreshAfterInterfaceChange}
          />
        )}

        {!interfaces._loaded ? (
          <p class="text-text-muted">Loading host interfaces...</p>
        ) : foundInterfaces.length === 0 ? (
          <p class="text-text-muted">
            No host interfaces configured yet. Expand the port scan above to pick one.
          </p>
        ) : (
          <div class="grid gap-3 lg:grid-cols-2">
            {foundInterfaces.map((iface) => (
              <HostInterfaceCard
                key={iface.id}
                iface={iface}
                devices={foundDevices.filter(d => d.host_interface_id === iface.id)}
                onEdit={() => ux.set('showHostInterfaceForm', iface.id)}
                onRefresh={refreshAfterInterfaceChange}
              />
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
            key={String(showDeviceForm)}
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
