import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { FormButtons } from '../../components/FormButtons';
import { useTxnStatus } from '../../components/useTxnStatus';
import { useLoaders } from '../../lib/DataLoader2';
import { Store, LogicDiagram, LogicBlock } from '../../store';
import type {
  LogicBlockFields,
  LogicDiagramFields,
  LogicInputFields,
  LogicOutputFields,
} from '../../store';
import type { ExistingRecord, ReifiedQueryResult, Txn } from '../../lib/RestfulModelStore';
import { nextStratumForExpressions } from '../../logicDiagram';
import type { LogicUXState } from '../../uxTree';
import { LogicInputForm } from './LogicInputForm';
import { LogicOutputForm } from './LogicOutputForm';

export function LogicTab({
  diagrams,
  blocks,
  outputs,
  inputs,
  ux,
  onRefresh,
}: {
  diagrams: ReifiedQueryResult<LogicDiagramFields>;
  blocks: ReifiedQueryResult<LogicBlockFields>;
  outputs: ReifiedQueryResult<LogicOutputFields>;
  inputs: ReifiedQueryResult<LogicInputFields>;
  ux: LogicUXState;
  onRefresh: () => void;
}) {
  const {
    selectedDiagramId,
    showDiagramForm,
    showInputForm,
    showBlockForm,
    showOutputForm,
  } = useLoaders(() => ({
    selectedDiagramId: ux.get('selectedDiagramId') ?? null,
    showDiagramForm: ux.get('showDiagramForm') ?? false,
    showInputForm: ux.get('showInputForm') ?? null,
    showBlockForm: ux.get('showBlockForm') ?? null,
    showOutputForm: ux.get('showOutputForm') ?? null,
  }), [ux], [ux]);

  return (
    <div class="space-y-8">
        <LogicDiagramsSection
          diagrams={diagrams}
          blocks={blocks}
          outputs={outputs}
          inputs={inputs}
          selectedDiagramId={selectedDiagramId}
          onSelectDiagram={(id) => ux.set('selectedDiagramId', id)}
          showDiagramForm={showDiagramForm}
          onShowDiagramForm={(show) => ux.set('showDiagramForm', show)}
          showInputForm={showInputForm}
          onShowInputForm={(id) => ux.set('showInputForm', id)}
          showBlockForm={showBlockForm}
          onShowBlockForm={(id) => ux.set('showBlockForm', id)}
          showOutputForm={showOutputForm}
          onShowOutputForm={(id) => ux.set('showOutputForm', id)}
          onRefresh={onRefresh}
        />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Logic diagram components
// ---------------------------------------------------------------------------

function LogicDiagramsSection({
  diagrams,
  blocks,
  outputs,
  inputs,
  selectedDiagramId,
  onSelectDiagram,
  showDiagramForm,
  onShowDiagramForm,
  showInputForm,
  onShowInputForm,
  showBlockForm,
  onShowBlockForm,
  showOutputForm,
  onShowOutputForm,
  onRefresh,
}: {
  diagrams: ReifiedQueryResult<LogicDiagramFields>;
  blocks: ReifiedQueryResult<LogicBlockFields>;
  outputs: ReifiedQueryResult<LogicOutputFields>;
  inputs: ReifiedQueryResult<LogicInputFields>;
  selectedDiagramId: number | null;
  onSelectDiagram: (id: number | null) => void;
  showDiagramForm: boolean;
  onShowDiagramForm: (show: boolean) => void;
  showInputForm: number | 'new' | null;
  onShowInputForm: (id: number | 'new' | null) => void;
  showBlockForm: number | 'new' | null;
  onShowBlockForm: (id: number | 'new' | null) => void;
  showOutputForm: number | 'new' | null;
  onShowOutputForm: (id: number | 'new' | null) => void;
  onRefresh: () => void;
}) {
  const [deleteDiagramTxn, setDeleteDiagramTxn] = useState<Txn | undefined>();
  const handledDeleteDiagramSeq = useRef<number | null>(null);
  const { txnResult: deleteDiagramTxnResult, saving: deletingDiagram } = useTxnStatus(deleteDiagramTxn);
  const deleteDiagramError = deleteDiagramTxnResult?.status === 'error' ? 'Delete failed' : null;
  const foundDiagrams = diagrams._loaded
    ? diagrams.filter((d) => d._found) as ExistingRecord<LogicDiagramFields>[]
    : [];
  const currentDiagram = foundDiagrams.find((d) => d.id === selectedDiagramId) ?? foundDiagrams[0] ?? null;
  const currentBlocks = blocks._loaded && currentDiagram
    ? blocks.filter((b) => b._found && (b as ExistingRecord<LogicBlockFields>).logic_diagram_id === currentDiagram.id) as ExistingRecord<LogicBlockFields>[]
    : [];
  const foundInputs = inputs._loaded
    ? inputs.filter((input) => (
      input._found && currentDiagram && (input as ExistingRecord<LogicInputFields>).logic_diagram_id === currentDiagram.id
    )) as ExistingRecord<LogicInputFields>[]
    : [];
  const currentOutputs = outputs._loaded && currentDiagram
    ? outputs.filter((output) => output._found && (output as ExistingRecord<LogicOutputFields>).logic_diagram_id === currentDiagram.id) as ExistingRecord<LogicOutputFields>[]
    : [];
  const blocksByStratum = new Map<number, ExistingRecord<LogicBlockFields>[]>();
  currentBlocks.forEach((block) => {
    const group = blocksByStratum.get(block.stratum) ?? [];
    group.push(block);
    blocksByStratum.set(block.stratum, group);
  });
  const strata = [...blocksByStratum.keys()].sort((a, b) => a - b);

  useEffect(() => {
    if (!deleteDiagramTxnResult) return;
    if (handledDeleteDiagramSeq.current === deleteDiagramTxnResult.seq) return;
    handledDeleteDiagramSeq.current = deleteDiagramTxnResult.seq;
    if (deleteDiagramTxnResult.status === 'succeeded') {
      onShowDiagramForm(false);
      onShowInputForm(null);
      onShowBlockForm(null);
      onShowOutputForm(null);
      onSelectDiagram(null);
      onRefresh();
    }
  }, [
    deleteDiagramTxnResult,
    onRefresh,
    onSelectDiagram,
    onShowBlockForm,
    onShowDiagramForm,
    onShowInputForm,
    onShowOutputForm,
  ]);

  const deleteCurrentDiagram = () => {
    if (!currentDiagram || deletingDiagram) return;
    const confirmed = window.confirm(
      `Delete "${currentDiagram.name}" and all of its inputs, blocks, outputs, instances, and traces?`,
    );
    if (!confirmed) return;

    setDeleteDiagramTxn(Store.m(LogicDiagram).destroy(currentDiagram.id));
  };

  return (
    <section>
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <h2 class="text-lg font-semibold">Logic Diagrams</h2>
          {foundDiagrams.length > 0 && (
            <select
              class="rounded border border-border bg-surface px-2 py-1.5 text-sm"
              value={String(currentDiagram?.id ?? '')}
              onChange={(e) => {
                const value = (e.target as HTMLSelectElement).value;
                onSelectDiagram(value ? parseInt(value, 10) : null);
                onShowBlockForm(null);
                onShowOutputForm(null);
              }}
            >
              {foundDiagrams.map((diagram) => (
                <option key={diagram.id} value={String(diagram.id)}>{diagram.name}</option>
              ))}
            </select>
          )}
        </div>
        <div class="flex gap-2">
          <button
            class="rounded border border-border px-3 py-1.5 text-sm font-medium text-text-muted hover:text-text"
            onClick={() => onShowDiagramForm(true)}
          >
            New Diagram
          </button>
          <button
            class="rounded border border-error px-3 py-1.5 text-sm font-medium text-error hover:bg-error-bg disabled:opacity-50"
            disabled={!currentDiagram || deletingDiagram}
            onClick={deleteCurrentDiagram}
          >
            {deletingDiagram ? 'Deleting...' : 'Delete Diagram'}
          </button>
          <button
            class="rounded bg-active px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            disabled={!currentDiagram}
            onClick={() => onShowBlockForm('new')}
          >
            + New Block
          </button>
          <button
            class="rounded bg-active px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            disabled={!currentDiagram}
            onClick={() => onShowOutputForm('new')}
          >
            + New Output
          </button>
        </div>
      </div>

      {showDiagramForm && <LogicDiagramForm onClose={() => onShowDiagramForm(false)} />}
      {deleteDiagramError && <p class="mb-3 text-sm text-error">{deleteDiagramError}</p>}

      {!diagrams._loaded ? (
        <p class="text-text-muted">Loading logic diagrams...</p>
      ) : foundDiagrams.length === 0 ? (
        <p class="text-text-muted">No logic diagrams configured yet.</p>
      ) : currentDiagram ? (
        <div class="space-y-4">
          {showBlockForm !== null && (
            <LogicBlockForm
              diagram={currentDiagram}
              editId={showBlockForm === 'new' ? null : showBlockForm}
              blocks={currentBlocks}
              onClose={() => onShowBlockForm(null)}
            />
          )}

          {showInputForm !== null && currentDiagram && (
            <LogicInputForm
              diagram={currentDiagram}
              editId={showInputForm === 'new' ? null : showInputForm}
              onClose={() => onShowInputForm(null)}
            />
          )}

          {showOutputForm !== null && currentDiagram && (
            <LogicOutputForm
              diagram={currentDiagram}
              editId={showOutputForm === 'new' ? null : showOutputForm}
              onClose={() => onShowOutputForm(null)}
            />
          )}

          <div class="overflow-x-auto pb-2">
            <div class="flex min-w-max gap-4">
              <div class="w-64 shrink-0">
                <ColumnHeader
                  title="Inputs"
                  action={<NewButton onClick={() => onShowInputForm('new')} />}
                />
                <div class="space-y-2">
                  {foundInputs.length === 0 ? (
                    <div class="rounded-lg border border-dashed border-border bg-surface-alt p-4 text-sm text-text-muted">
                      No inputs in this diagram.
                    </div>
                  ) : foundInputs.map((input) => (
                    <LogicInputCard
                      key={input.id}
                      input={input}
                      onEdit={(id) => onShowInputForm(id)}
                    />
                  ))}
                </div>
              </div>

              {strata.map((stratum) => (
                <div key={stratum} class="w-72 shrink-0">
                  <ColumnHeader title={`Stratum ${stratum}`} />
                  <div class="space-y-2">
                    {blocksByStratum.get(stratum)!.map((block) => (
                      <LogicBlockCard
                        key={block.id}
                        block={block}
                        onEdit={(id) => onShowBlockForm(id)}
                      />
                    ))}
                  </div>
                </div>
              ))}

              <div class="w-64 shrink-0">
                <ColumnHeader
                  title="Outputs"
                  action={<NewButton onClick={() => onShowOutputForm('new')} />}
                />
                <div class="space-y-2">
                  {currentOutputs.length === 0 ? (
                    <div class="rounded-lg border border-dashed border-border bg-surface-alt p-4 text-sm text-text-muted">
                      No outputs in this diagram.
                    </div>
                  ) : currentOutputs.map((output) => (
                    <LogicOutputCard
                      key={output.id}
                      output={output}
                      onEdit={(id) => onShowOutputForm(id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// Every column's header is the same fixed-height row, with or without an
// action, so the first cards of all columns line up.
export function ColumnHeader({ title, action }: { title: string; action?: ComponentChildren }) {
  return (
    <div class="mb-2 flex h-7 items-center justify-between">
      <h3 class="text-xs font-semibold uppercase text-text-muted">{title}</h3>
      {action}
    </div>
  );
}

function NewButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      class="rounded bg-active px-2 py-1 text-xs font-medium text-white hover:opacity-90"
      onClick={onClick}
    >
      + New
    </button>
  );
}

export function LogicBlockCard({ block, onEdit }: {
  block: ExistingRecord<LogicBlockFields>;
  onEdit: (id: number) => void;
}) {
  return (
    <div class="rounded-lg border border-border bg-surface p-3 space-y-2">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-sm font-semibold">{block.name}</h3>
          <p class="text-xs text-text-muted">{block.block_type}</p>
        </div>
        <button
          class="text-xs text-text-muted hover:text-text"
          onClick={() => onEdit(block.id)}
        >
          Edit
        </button>
      </div>

      {block.notes?.trim() && (
        <p class="whitespace-pre-wrap break-words text-xs text-text">{block.notes}</p>
      )}

      <p class="truncate rounded bg-surface-alt px-2 py-1.5 font-mono text-xs text-text-muted"
        title={expressionsToText(block.input_expressions)}>
        {block.block_type === 'expression'
          ? block.input_expressions.value
          : Object.values(block.input_expressions).join(' · ')}
      </p>
    </div>
  );
}

function LogicDiagramForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [saveTxn, setSaveTxn] = useState<Txn | undefined>();
  const [error, setError] = useState<string | null>(null);
  const { txnResult, saving } = useTxnStatus(saveTxn);

  useEffect(() => {
    if (!txnResult) return;
    if (txnResult.status === 'succeeded') onClose();
    else setError('Save failed');
  }, [txnResult, onClose]);

  const handleSave = () => {
    setError(null);
    setSaveTxn(Store.m(LogicDiagram).create({ name }));
  };

  return (
    <div class="rounded-lg border border-border bg-surface-alt p-4 mb-4 space-y-3">
      <h3 class="text-sm font-semibold">New Logic Diagram</h3>
      {error && <p class="text-sm text-error">{error}</p>}
      <label class="block">
        <span class="text-xs text-text-muted">Name</span>
        <input
          class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
      </label>
      <FormButtons saving={saving} disabled={!name} onSave={handleSave} onCancel={onClose} />
    </div>
  );
}

const MODES_BY_TYPE: Record<LogicBlockFields['block_type'], { value: string; label: string }[]> = {
  hysteresis: [{ value: 'active_high', label: 'Active High' }, { value: 'active_low', label: 'Active Low' }],
  latch: [{ value: 'latch_high', label: 'Latch High' }, { value: 'latch_low', label: 'Latch Low' }],
  timer_counter: [{ value: 'active_high', label: 'Active High' }, { value: 'active_low', label: 'Active Low' }],
  expression: [],
};

export function LogicBlockForm({ diagram, editId, blocks, onClose }: {
  diagram: ExistingRecord<LogicDiagramFields>;
  editId: number | null;
  blocks: ExistingRecord<LogicBlockFields>[];
  onClose: () => void;
}) {
  const existing = editId !== null ? Store.m(LogicBlock).fetch(editId) : null;
  const found = existing?._found ? existing as ExistingRecord<LogicBlockFields> : null;
  const defaultExpressions = found?.input_expressions ?? { value: '', low_limit: '', high_limit: '' };

  const [name, setName] = useState(found?.name ?? '');
  const [blockType, setBlockType] = useState<LogicBlockFields['block_type']>(found?.block_type ?? 'hysteresis');
  const [mode, setMode] = useState(String(found?.config?.mode ?? 'active_high'));
  const [dominance, setDominance] = useState(String(found?.config?.dominance ?? 'reset'));
  const [expressionsText, setExpressionsText] = useState(expressionsToText(defaultExpressions));
  const [notes, setNotes] = useState(found?.notes ?? '');
  const [saveTxn, setSaveTxn] = useState<Txn | undefined>();
  const [error, setError] = useState<string | null>(null);
  const { txnResult, saving } = useTxnStatus(saveTxn);

  useEffect(() => {
    if (!txnResult) return;
    if (txnResult.status === 'succeeded') onClose();
    else setError('Save failed');
  }, [txnResult, onClose]);

  const handleTypeChange = (nextType: LogicBlockFields['block_type']) => {
    setBlockType(nextType);
    const modes = MODES_BY_TYPE[nextType];
    if (!found) setExpressionsText(expressionsToText(defaultExpressionsForType(nextType)));
    if (modes.length > 0 && (!found || !modes.some((option) => option.value === mode))) setMode(modes[0].value);
  };

  const handleSave = () => {
    let input_expressions: Record<string, string>;
    try {
      input_expressions = textToExpressions(expressionsText);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid expressions');
      return;
    }

    const existingBlocks = blocks
      .filter((block) => editId === null || block.id !== editId)
      .map((block) => ({ id: block.id, name: block.name, input_expressions: block.input_expressions }));
    const stratum = nextStratumForExpressions(existingBlocks, input_expressions);
    const config: Record<string, unknown> = blockType === 'latch' ? { mode, dominance }
      : blockType === 'expression' ? {}
      : { mode };

    setError(null);
    const fields = {
      logic_diagram_id: diagram.id,
      name,
      block_type: blockType,
      stratum,
      input_expressions,
      config,
      notes,
    };
    setSaveTxn(editId !== null
      ? Store.m(LogicBlock).patch(editId, fields)
      : Store.m(LogicBlock).create(fields));
  };

  const handleDelete = () => {
    if (editId === null) return;
    Store.m(LogicBlock).destroy(editId);
    onClose();
  };

  return (
    <div class="rounded-lg border border-border bg-surface-alt p-4 mb-4 space-y-3">
      <h3 class="text-sm font-semibold">{editId !== null ? 'Edit' : 'New'} Logic Block</h3>
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
          <span class="text-xs text-text-muted">Type</span>
          <select
            class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            value={blockType}
            onChange={(e) => handleTypeChange((e.target as HTMLSelectElement).value as LogicBlockFields['block_type'])}
          >
            <option value="hysteresis">Hysteresis</option>
            <option value="latch">Latch</option>
            <option value="timer_counter">Timer Counter</option>
            <option value="expression">Expression</option>
          </select>
        </label>
        {MODES_BY_TYPE[blockType].length > 0 && (
          <label class="block">
            <span class="text-xs text-text-muted">Mode</span>
            <select
              class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
              value={mode}
              onChange={(e) => setMode((e.target as HTMLSelectElement).value)}
            >
              {MODES_BY_TYPE[blockType].map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        )}
        {blockType === 'latch' && (
          <label class="block">
            <span class="text-xs text-text-muted">Dominance</span>
            <select
              class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
              value={dominance}
              onChange={(e) => setDominance((e.target as HTMLSelectElement).value)}
            >
              <option value="reset">Reset</option>
              <option value="set">Set</option>
            </select>
          </label>
        )}
      </div>
      <label class="block">
        <span class="text-xs text-text-muted">Input Expressions</span>
        <textarea
          class="mt-1 block min-h-28 w-full rounded border border-border bg-surface px-2 py-1.5 font-mono text-sm"
          value={expressionsText}
          onInput={(e) => setExpressionsText((e.target as HTMLTextAreaElement).value)}
        />
      </label>
      <label class="block">
        <span class="text-xs text-text-muted">Notes</span>
        <textarea
          class="mt-1 block min-h-20 w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
          value={notes}
          onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)}
        />
      </label>
      <div class="flex gap-2">
        <FormButtons saving={saving} disabled={!name} onSave={handleSave} onCancel={onClose} />
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

function defaultExpressionsForType(blockType: LogicBlockFields['block_type']): Record<string, string> {
  switch (blockType) {
    case 'hysteresis': return { value: '', low_limit: '', high_limit: '' };
    case 'latch': return { set: '', reset: '' };
    case 'timer_counter': return { input: '' };
    case 'expression': return { value: '' };
  }
}

function expressionsToText(expressions: Record<string, string>) {
  return Object.entries(expressions).map(([key, value]) => `${key} = ${value}`).join('\n');
}

function textToExpressions(text: string) {
  const expressions: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^([a-zA-Z_]\w*)\s*=\s*(.+)$/);
    if (!match) throw new Error(`Invalid expression line: ${trimmed}`);
    expressions[match[1]] = match[2];
  }
  return expressions;
}

export function LogicInputCard({ input, onEdit }: {
  input: ExistingRecord<LogicInputFields>;
  onEdit: (id: number) => void;
}) {
  return <PortCard name={input.name} valueType={input.value_type} units={input.units}
    onEdit={() => onEdit(input.id)} />;
}

export function LogicOutputCard({ output, onEdit }: {
  output: ExistingRecord<LogicOutputFields>;
  onEdit: (id: number) => void;
}) {
  return <PortCard name={output.name} valueType={output.value_type} units={output.units}
    detail={output.input_expression} onEdit={() => onEdit(output.id)} />;
}

function PortCard({ name, valueType, units, detail, onEdit }: {
  name: string;
  valueType: string;
  units: string | null;
  detail?: string;
  onEdit: () => void;
}) {
  return <div class="space-y-2 rounded-lg border border-border bg-surface p-3">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="truncate font-mono text-sm font-semibold">{name}</h3>
        <p class="text-xs capitalize text-text-muted">{valueType}{units ? ` · ${units}` : ''}</p>
      </div>
      <button class="text-xs text-text-muted hover:text-text" onClick={onEdit}>Edit</button>
    </div>
    {detail && <p class="truncate rounded bg-surface-alt px-2 py-1.5 font-mono text-xs text-text-muted"
      title={detail}>{detail}</p>}
  </div>;
}
