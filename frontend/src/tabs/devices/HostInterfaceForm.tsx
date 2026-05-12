import { useEffect, useState } from 'preact/hooks';
import { FormButtons } from '../../components/FormButtons';
import { useTxnStatus } from '../../components/useTxnStatus';
import type { ExistingRecord } from '../../lib/RestfulModelStore';
import { HostInterface, Store } from '../../store';
import type { HostInterfaceFields } from '../../store';
import type { Txn } from '../../lib/RestfulModelStore';

export function HostInterfaceForm({ editId, onClose, onRefresh }: {
  editId: number | null;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const existing = editId !== null ? Store.m(HostInterface).fetch(editId) : null;
  const found = existing?._found ? existing as ExistingRecord<HostInterfaceFields> : null;

  const [port, setPort] = useState(found?.port ?? '');
  const [baudRate, setBaudRate] = useState(String(found?.baud_rate ?? 9600));
  const [dataBits, setDataBits] = useState(String(found?.data_bits ?? 8));
  const [stopBits, setStopBits] = useState(String(found?.stop_bits ?? 1));
  const [parity, setParity] = useState(found?.parity ?? 'none');
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
    const fields = {
      port,
      baud_rate: parseInt(baudRate, 10),
      data_bits: parseInt(dataBits, 10),
      stop_bits: parseInt(stopBits, 10),
      parity,
    };
    setError(null);
    setSaveTxn(editId !== null
      ? Store.m(HostInterface).patch(editId, fields)
      : Store.m(HostInterface).create(fields));
  };

  const handleDelete = () => {
    if (editId === null) return;
    Store.m(HostInterface).destroy(editId);
    onRefresh();
    onClose();
  };

  return (
    <div class="rounded-lg border border-border bg-surface-alt p-4 space-y-3">
      <h3 class="text-sm font-semibold">{editId !== null ? 'Edit' : 'New'} Host Interface</h3>
      {error && <p class="text-sm text-error">{error}</p>}
      <div class="grid gap-3 md:grid-cols-5">
        <label class="block md:col-span-2">
          <span class="text-xs text-text-muted">Port</span>
          <input
            class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            value={port}
            placeholder="/dev/ttyUSB0"
            onInput={(e) => setPort((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="block">
          <span class="text-xs text-text-muted">Baud</span>
          <input
            type="number"
            min="1"
            class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            value={baudRate}
            onInput={(e) => setBaudRate((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="block">
          <span class="text-xs text-text-muted">Data Bits</span>
          <select
            class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            value={dataBits}
            onChange={(e) => setDataBits((e.target as HTMLSelectElement).value)}
          >
            {[5, 6, 7, 8].map((value) => <option key={value} value={String(value)}>{value}</option>)}
          </select>
        </label>
        <label class="block">
          <span class="text-xs text-text-muted">Stop Bits</span>
          <select
            class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            value={stopBits}
            onChange={(e) => setStopBits((e.target as HTMLSelectElement).value)}
          >
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </label>
        <label class="block">
          <span class="text-xs text-text-muted">Parity</span>
          <select
            class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            value={parity}
            onChange={(e) => setParity((e.target as HTMLSelectElement).value)}
          >
            <option value="none">None</option>
            <option value="even">Even</option>
            <option value="odd">Odd</option>
          </select>
        </label>
      </div>
      <div class="flex gap-2">
        <FormButtons saving={saving} disabled={!port} onSave={handleSave} onCancel={onClose} />
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
