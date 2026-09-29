import { useEffect, useState } from 'preact/hooks';
import { FormButtons } from '../../components/FormButtons';
import { useTxnStatus } from '../../components/useTxnStatus';
import { OutputBlock, Store } from '../../store';
import type { DeviceFields, LogicDiagramFields, OutputBlockFields } from '../../store';
import type { ExistingRecord, ReifiedQueryResult, Txn } from '../../lib/RestfulModelStore';

export function OutputBlockForm({ diagram, editId, devices, onClose }: {
  diagram: ExistingRecord<LogicDiagramFields>;
  editId: number | null;
  devices: ReifiedQueryResult<DeviceFields>;
  onClose: () => void;
}) {
  const existing = editId !== null ? Store.m(OutputBlock).fetch(editId) : null;
  const found = existing?._found ? existing as ExistingRecord<OutputBlockFields> : null;

  const [name, setName] = useState(found?.name ?? '');
  const [deviceId, setDeviceId] = useState(String(found?.device_id ?? ''));
  const [channel, setChannel] = useState(String(found?.channel ?? ''));
  const [inputExpression, setInputExpression] = useState(found?.input_expression ?? '');
  const [saveTxn, setSaveTxn] = useState<Txn | undefined>();
  const [error, setError] = useState<string | null>(null);
  const { txnResult, saving } = useTxnStatus(saveTxn);

  useEffect(() => {
    if (!txnResult) return;
    if (txnResult.status === 'succeeded') onClose();
    else setError('Save failed');
  }, [txnResult, onClose]);

  const handleSave = () => {
    if (!deviceId || !channel) return;
    const fields = {
      logic_diagram_id: diagram.id,
      name,
      device_id: parseInt(deviceId, 10),
      channel: parseInt(channel, 10),
      input_expression: inputExpression,
    };

    setError(null);
    setSaveTxn(editId !== null
      ? Store.m(OutputBlock).patch(editId, fields)
      : Store.m(OutputBlock).create(fields));
  };

  const handleDelete = () => {
    if (editId === null) return;
    Store.m(OutputBlock).destroy(editId);
    onClose();
  };

  const foundDevices = devices.filter((d) => d._found) as ExistingRecord<DeviceFields>[];
  const selectedDevice = foundDevices.find(device => device.id === Number(deviceId));
  const outputOptions = selectedDevice?.outputs ?? [];
  const validOutput = outputOptions.some(output => String(output.channel) === channel);

  return (
    <div class="rounded-lg border border-border bg-surface-alt p-4 mb-4 space-y-3">
      <h3 class="text-sm font-semibold">{editId !== null ? 'Edit' : 'New'} Output</h3>
      {error && <p class="text-sm text-error">{error}</p>}

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
            onChange={(e) => {
              setDeviceId((e.target as HTMLSelectElement).value);
              setChannel('');
            }}
          >
            <option value="">Select device...</option>
            {foundDevices.map((d) => (
              <option key={d.id} value={String(d.id)}>{d.name}</option>
            ))}
          </select>
        </label>

        <label class="block">
          <span class="text-xs text-text-muted">Output</span>
          <select
            class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            value={channel}
            disabled={!selectedDevice}
            onChange={(e) => setChannel((e.target as HTMLSelectElement).value)}
          >
            <option value="">Select output...</option>
            {outputOptions.map(output => <option key={output.channel} value={String(output.channel)}>
              {output.label} (channel {output.channel})
            </option>)}
          </select>
        </label>
      </div>

      <label class="block">
        <span class="text-xs text-text-muted">Input Expression</span>
        <input
          class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm font-mono"
          placeholder="e.g. Heat_Call && Pump_Ready"
          value={inputExpression}
          onInput={(e) => setInputExpression((e.target as HTMLInputElement).value)}
        />
      </label>

      <div class="flex gap-2">
        <FormButtons saving={saving} disabled={!name || !deviceId || !validOutput || !inputExpression} onSave={handleSave} onCancel={onClose} />
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
