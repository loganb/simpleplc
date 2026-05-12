import { useEffect, useState } from 'preact/hooks';
import { FormButtons } from '../../components/FormButtons';
import { useTxnStatus } from '../../components/useTxnStatus';
import type { ExistingRecord, ReifiedQueryResult, Txn } from '../../lib/RestfulModelStore';
import { Device, Store } from '../../store';
import type { DeviceFields, HostInterfaceFields } from '../../store';

const DRIVER_OPTIONS = [
  'Drivers::N4DSC08',
  'Drivers::NT48C32',
  'Drivers::N4D8B08',
];

export function DeviceForm({ editId, interfaces, onClose, onRefresh }: {
  editId: number | null;
  interfaces: ReifiedQueryResult<HostInterfaceFields>;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const existing = editId !== null ? Store.m(Device).fetch(editId) : null;
  const found = existing?._found ? existing as ExistingRecord<DeviceFields> : null;
  const foundInterfaces = interfaces._loaded
    ? interfaces.filter((i) => i._found) as ExistingRecord<HostInterfaceFields>[]
    : [];

  const [name, setName] = useState(found?.name ?? '');
  const [hostInterfaceId, setHostInterfaceId] = useState(String(found?.host_interface_id ?? foundInterfaces[0]?.id ?? ''));
  const [modbusAddress, setModbusAddress] = useState(String(found?.modbus_address ?? 1));
  const [driver, setDriver] = useState(found?.driver ?? DRIVER_OPTIONS[0]);
  const [saveTxn, setSaveTxn] = useState<Txn | undefined>();
  const [error, setError] = useState<string | null>(null);
  const { txnResult, saving } = useTxnStatus(saveTxn);

  useEffect(() => {
    if (!txnResult) return;
    if (txnResult.status === 'succeeded') {
      onRefresh();
      onClose();
    } else {
      setError('Save failed');
    }
  }, [txnResult, onClose, onRefresh]);

  const handleSave = () => {
    if (!hostInterfaceId) return;
    const fields = {
      name,
      host_interface_id: parseInt(hostInterfaceId, 10),
      modbus_address: parseInt(modbusAddress, 10),
      driver,
    };
    setError(null);
    setSaveTxn(editId !== null
      ? Store.m(Device).patch(editId, fields)
      : Store.m(Device).create(fields));
  };

  const handleDelete = () => {
    if (editId === null) return;
    Store.m(Device).destroy(editId);
    onRefresh();
    onClose();
  };

  return (
    <div class="rounded-lg border border-border bg-surface-alt p-4 space-y-3">
      <h3 class="text-sm font-semibold">{editId !== null ? 'Edit' : 'New'} Device</h3>
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
          <span class="text-xs text-text-muted">Host Interface</span>
          <select
            class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            value={hostInterfaceId}
            onChange={(e) => setHostInterfaceId((e.target as HTMLSelectElement).value)}
          >
            <option value="">Select interface...</option>
            {foundInterfaces.map((iface) => (
              <option key={iface.id} value={String(iface.id)}>{iface.port}</option>
            ))}
          </select>
        </label>
        <label class="block">
          <span class="text-xs text-text-muted">Modbus Address</span>
          <input
            type="number"
            min="1"
            max="247"
            class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            value={modbusAddress}
            onInput={(e) => setModbusAddress((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="block">
          <span class="text-xs text-text-muted">Driver</span>
          <select
            class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm font-mono"
            value={driver}
            onChange={(e) => setDriver((e.target as HTMLSelectElement).value)}
          >
            {DRIVER_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>
      <div class="flex gap-2">
        <FormButtons
          saving={saving}
          disabled={!name || !hostInterfaceId || !driver}
          onSave={handleSave}
          onCancel={onClose}
        />
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
