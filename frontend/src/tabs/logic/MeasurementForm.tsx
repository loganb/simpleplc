import { useEffect, useState } from 'preact/hooks';
import { useTxnStatus } from '../../components/useTxnStatus';
import { Store, Measurement } from '../../store';
import type { DeviceFields, LogicDiagramFields, MeasurementFields } from '../../store';
import type { ExistingRecord, ReifiedQueryResult, Txn } from '../../lib/RestfulModelStore';

export function MeasurementForm({ diagram, editId, devices, onClose }: {
  diagram: ExistingRecord<LogicDiagramFields>;
  editId: number | null;
  devices: ReifiedQueryResult<DeviceFields>;
  onClose: () => void;
}) {
  const existing = editId !== null ? Store.m(Measurement).fetch(editId) : null;
  const found = existing?._found ? existing as ExistingRecord<MeasurementFields> : null;
  const foundDevices = devices.filter((device) => device._found) as ExistingRecord<DeviceFields>[];

  const [name, setName] = useState(found?.name ?? '');
  const [deviceId, setDeviceId] = useState(String(found?.device_id ?? ''));
  const [sourcePath, setSourcePath] = useState(found?.source_path ?? '');
  const [units, setUnits] = useState(found?.units ?? '');
  const [saveTxn, setSaveTxn] = useState<Txn | undefined>();
  const [error, setError] = useState<string | null>(null);
  const { txnResult, saving } = useTxnStatus(saveTxn);
  const selectedDevice = foundDevices.find((device) => device.id === Number(deviceId));
  const sourceOptions = selectedDevice?.inputs ?? [];
  const acquisition = (found?.mode ?? 'acquisition') === 'acquisition';

  useEffect(() => {
    if (!txnResult) return;
    if (txnResult.status === 'succeeded') onClose();
    else setError('Save failed');
  }, [txnResult, onClose]);

  const handleSave = () => {
    const fields = {
      logic_diagram_id: diagram.id,
      name,
      device_id: deviceId ? parseInt(deviceId, 10) : null,
      source_path: sourcePath || null,
      units: units || null,
    };
    setError(null);
    setSaveTxn(editId !== null
      ? Store.m(Measurement).patch(editId, fields)
      : Store.m(Measurement).create(fields));
  };

  const handleDeviceChange = (nextDeviceId: string) => {
    setDeviceId(nextDeviceId);
    setSourcePath('');
  };

  const handleSourceChange = (nextSourcePath: string) => {
    setSourcePath(nextSourcePath);
    const source = sourceOptions.find((option) => option.path === nextSourcePath);
    if (!units.trim() && source?.units) setUnits(source.units);
  };

  const handleDelete = () => {
    if (editId === null) return;
    Store.m(Measurement).destroy(editId);
    onClose();
  };

  return (
    <div class="rounded-lg border border-border bg-surface-alt p-4 mb-4 space-y-3">
      <h3 class="text-sm font-semibold">{editId !== null ? 'Edit' : 'New'} Measurement</h3>
      {error && <p class="text-sm text-error">{error}</p>}

      <div class="grid gap-3 md:grid-cols-2">
        <label class="block">
          <span class="text-xs text-text-muted">Name</span>
          <input
            class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            value={name}
            onInput={(event) => setName((event.target as HTMLInputElement).value)}
          />
        </label>

        <label class="block">
          <span class="text-xs text-text-muted">Device</span>
          <select
            class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            value={deviceId}
            onChange={(event) => handleDeviceChange((event.target as HTMLSelectElement).value)}
          >
            <option value="">Select device...</option>
            {foundDevices.map((device) => (
              <option key={device.id} value={String(device.id)}>{device.name}</option>
            ))}
          </select>
        </label>

        <label class="block">
          <span class="text-xs text-text-muted">Source</span>
          <select
            class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm font-mono"
            value={sourcePath}
            disabled={!selectedDevice}
            onChange={(event) => handleSourceChange((event.target as HTMLSelectElement).value)}
          >
            <option value="">Select input...</option>
            {sourceOptions.map((source) => (
              <option key={source.path} value={source.path}>
                {source.label}{source.units ? ` (${source.units})` : ''}
              </option>
            ))}
          </select>
        </label>

        <label class="block">
          <span class="text-xs text-text-muted">Units</span>
          <input
            class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            placeholder="e.g. °C, PSI"
            value={units}
            onInput={(event) => setUnits((event.target as HTMLInputElement).value)}
          />
        </label>
      </div>

      <div class="flex gap-2">
        <button
          class="rounded bg-active px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          onClick={handleSave}
          disabled={saving || !name || (acquisition && (!deviceId || !sourcePath))}
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
