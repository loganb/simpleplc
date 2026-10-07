import { useEffect, useState } from 'preact/hooks';
import { FormButtons } from '../../components/FormButtons';
import { useTxnStatus } from '../../components/useTxnStatus';
import type { ExistingRecord, Txn } from '../../lib/RestfulModelStore';
import { LogicOutput, Store } from '../../store';
import type { LogicDiagramFields, LogicOutputFields, LogicValueType } from '../../store';

export function LogicOutputForm({ diagram, editId, onClose }: {
  diagram: ExistingRecord<LogicDiagramFields>;
  editId: number | null;
  onClose: () => void;
}) {
  const existing = editId !== null ? Store.m(LogicOutput).fetch(editId) : null;
  const found = existing?._found ? existing as ExistingRecord<LogicOutputFields> : null;
  const [name, setName] = useState(found?.name ?? '');
  const [valueType, setValueType] = useState<LogicValueType>(found?.value_type ?? 'boolean');
  const [units, setUnits] = useState(found?.units ?? '');
  const [inputExpression, setInputExpression] = useState(found?.input_expression ?? '');
  const [txn, setTxn] = useState<Txn | undefined>();
  const { txnResult, saving } = useTxnStatus(txn);

  useEffect(() => {
    if (txnResult?.status === 'succeeded') onClose();
  }, [txnResult, onClose]);

  const save = () => {
    const fields = {
      logic_diagram_id: diagram.id, name, value_type: valueType,
      units: units || null, input_expression: inputExpression,
    };
    setTxn(editId === null ? Store.m(LogicOutput).create(fields) : Store.m(LogicOutput).patch(editId, fields));
  };

  return <div class="mb-4 space-y-3 rounded-lg border border-border bg-surface-alt p-4">
    <h3 class="text-sm font-semibold">{editId === null ? 'New' : 'Edit'} Output</h3>
    {txnResult?.status === 'error' && <p class="text-sm text-error">Save failed</p>}
    <div class="grid gap-3 md:grid-cols-3">
      <label class="block"><span class="text-xs text-text-muted">Name</span>
        <input class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm font-mono"
          value={name} onInput={event => setName((event.target as HTMLInputElement).value)} />
      </label>
      <label class="block"><span class="text-xs text-text-muted">Type</span>
        <select class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
          value={valueType} onChange={event => setValueType((event.target as HTMLSelectElement).value as LogicValueType)}>
          <option value="boolean">Boolean</option><option value="number">Number</option>
        </select>
      </label>
      <label class="block"><span class="text-xs text-text-muted">Units</span>
        <input class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
          value={units} onInput={event => setUnits((event.target as HTMLInputElement).value)} />
      </label>
    </div>
    <label class="block"><span class="text-xs text-text-muted">Input expression</span>
      <input class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm font-mono"
        placeholder="e.g. Heat_Call && Pump_Ready" value={inputExpression}
        onInput={event => setInputExpression((event.target as HTMLInputElement).value)} />
    </label>
    <div class="flex gap-2">
      <FormButtons saving={saving} disabled={!name || !inputExpression} onSave={save} onCancel={onClose} />
      {editId !== null && <button class="ml-auto rounded border border-error px-3 py-1.5 text-sm text-error"
        onClick={() => { Store.m(LogicOutput).destroy(editId); onClose(); }}>Delete</button>}
    </div>
  </div>;
}
