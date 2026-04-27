import { useState } from 'preact/hooks';
import { useLoaders } from './lib/DataLoader2';
import { Store, Device, HostInterface, Measurement, MeasurementDatum } from './store';
import type { DeviceFields, HostInterfaceFields, MeasurementFields, MeasurementDatumFields } from './store';
import type { FoundRecord, ReifiedQueryResult, Txn } from './lib/RestfulModelStore';

export function App() {
  const [showForm, setShowForm] = useState<number | 'new' | null>(null);

  const { devices, interfaces, measurements } = useLoaders(() => {
    const devices = Store.m(Device).queryFor(null, {});
    const interfaces = Store.m(HostInterface).queryFor(null, {});
    const measurements = Store.m(Measurement).queryFor(null, {});
    return { devices, interfaces, measurements };
  }, [Store]);

  return (
    <div class="min-h-screen bg-surface">
      <header class="border-b border-border px-6 py-4">
        <h1 class="text-2xl font-bold tracking-tight">PLC Controller</h1>
        <p class="text-sm text-text-muted">HVAC Monitoring Dashboard</p>
      </header>

      <main class="p-6 space-y-8">
        {/* Devices */}
        <section>
          <h2 class="text-lg font-semibold mb-4">Devices</h2>
          {!devices._loaded ? (
            <p class="text-text-muted">Loading devices...</p>
          ) : (
            <div class="grid gap-4 md:grid-cols-3">
              {devices.map((device) => (
                <DeviceCard key={device.id as number} device={device} interfaces={interfaces} />
              ))}
            </div>
          )}
        </section>

        {/* Measurements */}
        <section>
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold">Measurements</h2>
            <button
              class="rounded bg-active px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              onClick={() => setShowForm('new')}
            >
              + New Measurement
            </button>
          </div>

          {showForm !== null && (
            <MeasurementForm
              editId={showForm === 'new' ? null : showForm}
              devices={devices}
              onClose={() => setShowForm(null)}
            />
          )}

          {!measurements._loaded ? (
            <p class="text-text-muted">Loading measurements...</p>
          ) : measurements.length === 0 ? (
            <p class="text-text-muted">No measurements configured yet.</p>
          ) : (
            <div class="grid gap-4 md:grid-cols-3">
              {measurements.map((m) => (
                <MeasurementCard
                  key={m.id as number}
                  measurement={m}
                  devices={devices}
                  onEdit={(id) => setShowForm(id)}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Measurement components
// ---------------------------------------------------------------------------

function MeasurementCard({ measurement, devices, onEdit }: {
  measurement: ReifiedQueryResult<MeasurementFields>[number];
  devices: ReifiedQueryResult<DeviceFields>;
  onEdit: (id: number) => void;
}) {
  if (!measurement._found) return null;
  const m = measurement as FoundRecord<MeasurementFields>;

  const { latest } = useLoaders(() => {
    const data = Store.m(MeasurementDatum).queryFor(null, { measurement_id: m.id, limit: 1 });
    const latest = data._found && data.length > 0 ? data[0] : null;
    return { latest };
  }, [Store]);

  const device = devices.find((d) => d._found && (d as FoundRecord<DeviceFields>).id === m.device_id);
  const deviceName = device?._found ? (device as FoundRecord<DeviceFields>).name : null;

  const latestDatum = latest?._found ? latest as FoundRecord<MeasurementDatumFields> : null;

  return (
    <div class="rounded-lg border border-border bg-surface p-4 space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold">{m.name}</h3>
        <button
          class="text-xs text-text-muted hover:text-text"
          onClick={() => onEdit(m.id as number)}
        >
          Edit
        </button>
      </div>

      <div class="text-2xl font-mono font-bold">
        {latestDatum
          ? latestDatum.value !== null
            ? <>{latestDatum.value.toFixed(1)}{m.units && <span class="text-sm text-text-muted ml-1">{m.units}</span>}</>
            : <span class="text-text-muted">—</span>
          : <span class="text-text-muted text-sm">No data</span>
        }
      </div>

      <div class="text-xs text-text-muted space-y-0.5">
        {deviceName && <p>Source: {deviceName}</p>}
        {m.source_path && <p>Path: {m.source_path}</p>}
        <p>Every {m.update_period}s</p>
        {latestDatum?.recorded_at && (
          <p>{new Date(latestDatum.recorded_at).toLocaleTimeString()}</p>
        )}
      </div>
    </div>
  );
}

function MeasurementForm({ editId, devices, onClose }: {
  editId: number | null;
  devices: ReifiedQueryResult<DeviceFields>;
  onClose: () => void;
}) {
  const existing = editId !== null
    ? Store.m(Measurement).fetch(editId)
    : null;
  const found = existing?._found ? existing as FoundRecord<MeasurementFields> : null;

  const [name, setName] = useState(found?.name ?? '');
  const [deviceId, setDeviceId] = useState(String(found?.device_id ?? ''));
  const [sourcePath, setSourcePath] = useState(found?.source_path ?? '');
  const [updatePeriod, setUpdatePeriod] = useState(String(found?.update_period ?? 60));
  const [units, setUnits] = useState(found?.units ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    const fields = {
      name,
      source_type: 'device' as const,
      device_id: parseInt(deviceId, 10),
      source_path: sourcePath || null,
      update_period: parseInt(updatePeriod, 10),
      units: units || null,
    };
    setSaving(true);
    let txn: Txn;
    if (editId !== null) {
      txn = Store.m(Measurement).patch(editId, fields);
    } else {
      txn = Store.m(Measurement).create(fields);
    }
    // Poll for completion
    const check = () => {
      const result = Store.txn_status(txn);
      if (result) {
        setSaving(false);
        if (result.status === 'succeeded') onClose();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  };

  const handleDelete = () => {
    if (editId === null) return;
    Store.m(Measurement).destroy(editId);
    onClose();
  };

  const foundDevices = devices.filter((d) => d._found) as FoundRecord<DeviceFields>[];

  return (
    <div class="rounded-lg border border-border bg-surface-alt p-4 mb-4 space-y-3">
      <h3 class="text-sm font-semibold">{editId !== null ? 'Edit' : 'New'} Measurement</h3>

      <div class="grid gap-3 md:grid-cols-2">
        <label class="block">
          <span class="text-xs text-text-muted">Name</span>
          <input
            class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
        </label>

        <label class="block">
          <span class="text-xs text-text-muted">Device</span>
          <select
            class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            value={deviceId}
            onChange={(e) => setDeviceId((e.target as HTMLSelectElement).value)}
          >
            <option value="">Select device...</option>
            {foundDevices.map((d) => (
              <option key={d.id} value={String(d.id)}>{d.name}</option>
            ))}
          </select>
        </label>

        <label class="block">
          <span class="text-xs text-text-muted">Source Path</span>
          <input
            class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm font-mono"
            placeholder="e.g. temperatures[4]"
            value={sourcePath}
            onInput={(e) => setSourcePath((e.target as HTMLInputElement).value)}
          />
        </label>

        <label class="block">
          <span class="text-xs text-text-muted">Update Period (seconds)</span>
          <input
            type="number"
            min="1"
            class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            value={updatePeriod}
            onInput={(e) => setUpdatePeriod((e.target as HTMLInputElement).value)}
          />
        </label>

        <label class="block">
          <span class="text-xs text-text-muted">Units</span>
          <input
            class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            placeholder="e.g. °C, PSI"
            value={units}
            onInput={(e) => setUnits((e.target as HTMLInputElement).value)}
          />
        </label>
      </div>

      <div class="flex gap-2">
        <button
          class="rounded bg-active px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          onClick={handleSave}
          disabled={saving || !name || !deviceId}
        >
          {saving ? 'Saving...' : editId !== null ? 'Update' : 'Create'}
        </button>
        <button
          class="rounded border border-border px-3 py-1.5 text-sm font-medium text-text-muted hover:text-text"
          onClick={onClose}
        >
          Cancel
        </button>
        {editId !== null && (
          <button
            class="ml-auto rounded border border-error px-3 py-1.5 text-sm font-medium text-error hover:bg-error-bg"
            onClick={handleDelete}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Device components (unchanged)
// ---------------------------------------------------------------------------

function DeviceCard({ device, interfaces }: {
  device: ReifiedQueryResult<DeviceFields>[number];
  interfaces: ReifiedQueryResult<HostInterfaceFields>;
}) {
  if (!device._found) return null;
  const d = device as FoundRecord<DeviceFields>;
  const state = d.current_state;
  const iface = interfaces.find((i) => i._found && (i as FoundRecord<HostInterfaceFields>).id === d.host_interface_id);
  const ifaceFound = iface?._found ? iface as FoundRecord<HostInterfaceFields> : null;

  return (
    <div class="rounded-lg border border-border bg-surface p-4 space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold">{d.name}</h2>
        <StatusBadge status={state?.status ?? null} />
      </div>

      <div class="flex items-center gap-2 text-xs text-text-muted">
        <span>Addr {d.modbus_address}</span>
        {ifaceFound && <span>on {ifaceFound.port}</span>}
      </div>

      {state?.data && <DeviceData data={state.data} />}

      {state?.polled_at && (
        <p class="text-xs text-text-muted">
          Polled: {new Date(state.polled_at).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (status === 'ok') {
    return <span class="inline-block rounded-full bg-ok-bg px-2 py-0.5 text-xs font-medium text-ok">OK</span>;
  }
  if (status === 'error') {
    return <span class="inline-block rounded-full bg-error-bg px-2 py-0.5 text-xs font-medium text-error">Error</span>;
  }
  return <span class="inline-block rounded-full bg-surface-alt px-2 py-0.5 text-xs font-medium text-text-muted">Unknown</span>;
}

function DeviceData({ data }: { data: Record<string, unknown> }) {
  if ('temperatures' in data) {
    const temps = data.temperatures as (number | null)[];
    const active = temps
      .map((t, i) => ({ ch: i + 1, temp: t }))
      .filter((t) => t.temp !== null);

    return (
      <div class="grid grid-cols-2 gap-1">
        {active.map(({ ch, temp }) => (
          <div key={ch} class="flex justify-between rounded bg-surface-alt px-2 py-1 text-sm">
            <span class="text-text-muted">Ch {ch}</span>
            <span class="font-mono font-medium">{temp!.toFixed(1)}&deg;C</span>
          </div>
        ))}
        {active.length === 0 && (
          <p class="col-span-2 text-xs text-text-muted">No active channels</p>
        )}
      </div>
    );
  }

  if ('outputs' in data && 'inputs' in data) {
    const outputs = data.outputs as boolean[];
    const inputs = data.inputs as boolean[];
    return (
      <div class="space-y-2">
        <IORow label="Outputs" values={outputs} />
        <IORow label="Inputs" values={inputs} />
      </div>
    );
  }

  return <pre class="text-xs overflow-auto">{JSON.stringify(data, null, 2)}</pre>;
}

function IORow({ label, values }: { label: string; values: boolean[] }) {
  return (
    <div>
      <p class="text-xs text-text-muted mb-1">{label}</p>
      <div class="flex gap-1">
        {values.map((v, i) => (
          <div
            key={i}
            class={`h-6 w-6 rounded text-center text-xs leading-6 font-mono ${
              v ? 'bg-ok text-white' : 'bg-surface-alt text-text-muted'
            }`}
          >
            {i + 1}
          </div>
        ))}
      </div>
    </div>
  );
}
