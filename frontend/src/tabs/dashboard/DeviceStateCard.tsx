import type { ExistingRecord, ReifiedQueryResult } from '../../lib/RestfulModelStore';
import type { DeviceFields, HostInterfaceFields } from '../../store';

export function DeviceStateCard({ device, interfaces }: {
  device: ReifiedQueryResult<DeviceFields>[number];
  interfaces: ReifiedQueryResult<HostInterfaceFields>;
}) {
  if (!device._found) return null;
  const d = device as ExistingRecord<DeviceFields>;
  const state = d.current_state;
  const iface = interfaces.find((i) => i._found && (i as ExistingRecord<HostInterfaceFields>).id === d.host_interface_id);
  const ifaceFound = iface?._found ? iface as ExistingRecord<HostInterfaceFields> : null;

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
