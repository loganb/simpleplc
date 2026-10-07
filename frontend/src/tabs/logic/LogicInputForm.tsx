import { useEffect, useState } from 'preact/hooks';
import { FormButtons } from '../../components/FormButtons';
import { useTxnStatus } from '../../components/useTxnStatus';
import type { ExistingRecord, Txn } from '../../lib/RestfulModelStore';
import { LogicInput, Store } from '../../store';
import type { LogicDiagramFields, LogicInputFields, LogicValueType } from '../../store';

export function LogicInputForm({ diagram, editId, onClose }: {
  diagram: ExistingRecord<LogicDiagramFields>;
  editId: number | null;
  onClose: () => void;
}) {
  const existing = editId !== null ? Store.m(LogicInput).fetch(editId) : null;
  const found = existing?._found ? existing as ExistingRecord<LogicInputFields> : null;
  const [name, setName] = useState(found?.name ?? '');
  const [valueType, setValueType] = useState<LogicValueType>(found?.value_type ?? 'number');
  const [units, setUnits] = useState(found?.units ?? '');
  const [txn, setTxn] = useState<Txn | undefined>();
  const { txnResult, saving } = useTxnStatus(txn);

  useEffect(() => {
    if (txnResult?.status === 'succeeded') onClose();
  }, [txnResult, onClose]);

  const save = () => {
    const fields = { logic_diagram_id: diagram.id, name, value_type: valueType, units: units || null };
    setTxn(editId === null ? Store.m(LogicInput).create(fields) : Store.m(LogicInput).patch(editId, fields));
  };

  return <div class="mb-4 space-y-3 rounded-lg border border-border bg-surface-alt p-4">
    <h3 class="text-sm font-semibold">{editId === null ? 'New' : 'Edit'} Input</h3>
    {txnResult?.status === 'error' && <p class="text-sm text-error">Save failed</p>}
    <div class="grid gap-3 md:grid-cols-3">
      <label class="block"><span class="text-xs text-text-muted">Name</span>
        <input class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm font-mono"
          value={name} onInput={event => setName((event.target as HTMLInputElement).value)} />
      </label>
      <label class="block"><span class="text-xs text-text-muted">Type</span>
        <select class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
          value={valueType} onChange={event => setValueType((event.target as HTMLSelectElement).value as LogicValueType)}>
          <option value="number">Number</option><option value="boolean">Boolean</option>
        </select>
      </label>
      <label class="block"><span class="text-xs text-text-muted">Units</span>
        <input class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
          placeholder="e.g. °C, PSI" value={units}
          onInput={event => setUnits((event.target as HTMLInputElement).value)} />
      </label>
    </div>
    <div class="flex gap-2">
      <FormButtons saving={saving} disabled={!name} onSave={save} onCancel={onClose} />
      {editId !== null && <button class="ml-auto rounded border border-error px-3 py-1.5 text-sm text-error"
        onClick={() => { Store.m(LogicInput).destroy(editId); onClose(); }}>Delete</button>}
    </div>
  </div>;
}
