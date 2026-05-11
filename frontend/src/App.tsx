import { useEffect, useRef, useState } from 'preact/hooks';
import { useLoaders } from './lib/DataLoader2';
import { Store, Device, HostInterface, Measurement, LogicDiagram, LogicBlock, OutputBlock, Trace } from './store';
import type {
  DeviceFields,
  HostInterfaceFields,
  LogicBlockFields,
  LogicDiagramFields,
  MeasurementFields,
  OutputBlockFields,
} from './store';
import type { FoundRecord, ReifiedQueryResult, Txn } from './lib/RestfulModelStore';
import { nextStratumForExpressions } from './logicDiagram';

export function App() {
  const [showMeasurementForm, setShowMeasurementForm] = useState<number | 'new' | null>(null);
  const [showDiagramForm, setShowDiagramForm] = useState(false);
  const [showBlockForm, setShowBlockForm] = useState<number | 'new' | null>(null);
  const [showOutputForm, setShowOutputForm] = useState<number | 'new' | null>(null);
  const [selectedDiagramId, setSelectedDiagramId] = useState<number | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const lastForcedRefreshToken = useRef(0);

  useEffect(() => {
    const subscription = Store.addListener('cacheEpochAdvanced', () => {
      setRefreshToken((token) => token + 1);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const { devices, interfaces, measurements, logicDiagrams, logicBlocks, outputBlocks } = useLoaders(() => {
    const force = refreshToken > lastForcedRefreshToken.current;
    if (force) lastForcedRefreshToken.current = refreshToken;
    const devices = Store.m(Device).queryFor(null, {}, force);
    const interfaces = Store.m(HostInterface).queryFor(null, {}, force);
    const measurements = Store.m(Measurement).queryFor(null, {}, force);
    const logicDiagrams = Store.m(LogicDiagram).queryFor(null, {}, force);
    const logicBlocks = Store.m(LogicBlock).queryFor(null, {}, force);
    const outputBlocks = Store.m(OutputBlock).queryFor(null, {}, force);
    return { devices, interfaces, measurements, logicDiagrams, logicBlocks, outputBlocks };
  }, [Store], [refreshToken]);

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

        <LogicDiagramsSection
          diagrams={logicDiagrams}
          blocks={logicBlocks}
          outputBlocks={outputBlocks}
          measurements={measurements}
          devices={devices}
          selectedDiagramId={selectedDiagramId}
          onSelectDiagram={setSelectedDiagramId}
          showDiagramForm={showDiagramForm}
          onShowDiagramForm={setShowDiagramForm}
          showMeasurementForm={showMeasurementForm}
          onShowMeasurementForm={setShowMeasurementForm}
          showBlockForm={showBlockForm}
          onShowBlockForm={setShowBlockForm}
          showOutputForm={showOutputForm}
          onShowOutputForm={setShowOutputForm}
          onRefresh={() => setRefreshToken((token) => token + 1)}
        />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Logic diagram components
// ---------------------------------------------------------------------------

function LogicDiagramsSection({
  diagrams,
  blocks,
  outputBlocks,
  measurements,
  devices,
  selectedDiagramId,
  onSelectDiagram,
  showDiagramForm,
  onShowDiagramForm,
  showMeasurementForm,
  onShowMeasurementForm,
  showBlockForm,
  onShowBlockForm,
  showOutputForm,
  onShowOutputForm,
  onRefresh,
}: {
  diagrams: ReifiedQueryResult<LogicDiagramFields>;
  blocks: ReifiedQueryResult<LogicBlockFields>;
  outputBlocks: ReifiedQueryResult<OutputBlockFields>;
  measurements: ReifiedQueryResult<MeasurementFields>;
  devices: ReifiedQueryResult<DeviceFields>;
  selectedDiagramId: number | null;
  onSelectDiagram: (id: number | null) => void;
  showDiagramForm: boolean;
  onShowDiagramForm: (show: boolean) => void;
  showMeasurementForm: number | 'new' | null;
  onShowMeasurementForm: (id: number | 'new' | null) => void;
  showBlockForm: number | 'new' | null;
  onShowBlockForm: (id: number | 'new' | null) => void;
  showOutputForm: number | 'new' | null;
  onShowOutputForm: (id: number | 'new' | null) => void;
  onRefresh: () => void;
}) {
  const [traceTxn, setTraceTxn] = useState<Txn | undefined>();
  const [diagramTxn, setDiagramTxn] = useState<Txn | undefined>();
  const [traceError, setTraceError] = useState<string | null>(null);
  const handledTraceSeq = useRef<number | null>(null);
  const { txnResult: traceTxnResult, saving: computing } = useTxnStatus(traceTxn);
  const { saving: savingDiagram } = useTxnStatus(diagramTxn);
  const foundDiagrams = diagrams._loaded
    ? diagrams.filter((d) => d._found) as FoundRecord<LogicDiagramFields>[]
    : [];
  const currentDiagram = foundDiagrams.find((d) => d.id === selectedDiagramId) ?? foundDiagrams[0] ?? null;
  const currentBlocks = blocks._loaded && currentDiagram
    ? blocks.filter((b) => b._found && (b as FoundRecord<LogicBlockFields>).logic_diagram_id === currentDiagram.id) as FoundRecord<LogicBlockFields>[]
    : [];
  const foundMeasurements = measurements._loaded
    ? measurements.filter((m) => (
      m._found && currentDiagram && (m as FoundRecord<MeasurementFields>).logic_diagram_id === currentDiagram.id
    )) as FoundRecord<MeasurementFields>[]
    : [];
  const currentOutputs = outputBlocks._loaded && currentDiagram
    ? outputBlocks.filter((o) => o._found && (o as FoundRecord<OutputBlockFields>).logic_diagram_id === currentDiagram.id) as FoundRecord<OutputBlockFields>[]
    : [];
  const blocksByStratum = new Map<number, FoundRecord<LogicBlockFields>[]>();
  currentBlocks.forEach((block) => {
    const group = blocksByStratum.get(block.stratum) ?? [];
    group.push(block);
    blocksByStratum.set(block.stratum, group);
  });
  const strata = [...blocksByStratum.keys()].sort((a, b) => a - b);

  useEffect(() => {
    if (!traceTxnResult) return;
    if (handledTraceSeq.current === traceTxnResult.seq) return;
    handledTraceSeq.current = traceTxnResult.seq;
    if (traceTxnResult.status === 'succeeded') {
      setTraceError(null);
      onRefresh();
    } else {
      setTraceError('Compute failed');
    }
  }, [traceTxnResult, onRefresh]);

  const computeNow = () => {
    if (!currentDiagram) return;
    setTraceError(null);
    setTraceTxn(Store.m(Trace).create({ logic_diagram_id: currentDiagram.id }));
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
          {currentDiagram && (
            <label class="flex items-center gap-2 rounded border border-border px-3 py-1.5 text-sm text-text-muted">
              <span class={currentDiagram.output_enable ? 'font-medium text-text' : ''}>Outputs</span>
              <input
                type="checkbox"
                class="peer sr-only"
                checked={currentDiagram.output_enable}
                disabled={savingDiagram}
                onChange={() => setDiagramTxn(Store.m(LogicDiagram).patch(currentDiagram.id, {
                  output_enable: !currentDiagram.output_enable,
                }))}
              />
              <span class="relative h-5 w-9 shrink-0 rounded-full bg-border transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-active peer-checked:after:translate-x-4 peer-disabled:opacity-50" />
            </label>
          )}
          <button
            class="rounded border border-border px-3 py-1.5 text-sm font-medium text-text-muted hover:text-text"
            onClick={() => onShowDiagramForm(true)}
          >
            New Diagram
          </button>
          <button
            class="rounded border border-border px-3 py-1.5 text-sm font-medium text-text-muted hover:text-text disabled:opacity-50"
            disabled={!currentDiagram || computing}
            onClick={computeNow}
          >
            {computing ? 'Computing...' : 'Compute Now'}
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
      {traceError && <p class="mb-3 text-sm text-error">{traceError}</p>}

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

          {showMeasurementForm !== null && currentDiagram && (
            <MeasurementForm
              diagram={currentDiagram}
              editId={showMeasurementForm === 'new' ? null : showMeasurementForm}
              devices={devices}
              onClose={() => onShowMeasurementForm(null)}
            />
          )}

          {showOutputForm !== null && currentDiagram && (
            <OutputBlockForm
              diagram={currentDiagram}
              editId={showOutputForm === 'new' ? null : showOutputForm}
              devices={devices}
              onClose={() => onShowOutputForm(null)}
            />
          )}

          <div class="overflow-x-auto pb-2">
            <div class="flex min-w-max gap-4">
              <div class="w-64 shrink-0">
                <div class="mb-2 flex items-center justify-between">
                  <ColumnHeader title="Measurements" />
                  <button
                    class="rounded bg-active px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                    onClick={() => onShowMeasurementForm('new')}
                  >
                    + New
                  </button>
                </div>
                <div class="space-y-2">
                  {foundMeasurements.length === 0 ? (
                    <div class="rounded-lg border border-dashed border-border bg-surface-alt p-4 text-sm text-text-muted">
                      No measurements in this diagram.
                    </div>
                  ) : foundMeasurements.map((measurement) => (
                    <MeasurementCard
                      key={measurement.id}
                      measurement={measurement}
                      devices={devices}
                      onEdit={(id) => onShowMeasurementForm(id)}
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
                <div class="mb-2 flex items-center justify-between">
                  <ColumnHeader title="Outputs" />
                  <button
                    class="rounded bg-active px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                    onClick={() => onShowOutputForm('new')}
                  >
                    + New
                  </button>
                </div>
                <div class="space-y-2">
                  {currentOutputs.length === 0 ? (
                    <div class="rounded-lg border border-dashed border-border bg-surface-alt p-4 text-sm text-text-muted">
                      No outputs in this diagram.
                    </div>
                  ) : currentOutputs.map((output) => (
                    <OutputBlockCard
                      key={output.id}
                      output={output}
                      devices={devices}
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

function ColumnHeader({ title }: { title: string }) {
  return <h3 class="mb-2 text-xs font-semibold uppercase text-text-muted">{title}</h3>;
}

function LogicBlockCard({ block, onEdit }: {
  block: FoundRecord<LogicBlockFields>;
  onEdit: (id: number) => void;
}) {
  const state = block.latest_state ?? {};

  return (
    <div class="rounded-lg border border-border bg-surface p-4 space-y-3">
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

      <div class="flex items-center justify-between rounded bg-surface-alt px-2 py-1.5">
        <span class="text-xs text-text-muted">Output</span>
        <span class="font-mono text-sm font-semibold">
          {block.output === null ? 'No data' : block.output ? 'true' : 'false'}
        </span>
      </div>

      <div class="space-y-1 text-xs text-text-muted">
        <p class="font-mono">{block.name}</p>
        {block.block_type === 'hysteresis' ? (
          <>
            <p><span class="font-medium">value</span>: {formatComputedValue(block.value)}</p>
            <p><span class="font-medium">low_limit</span>: {formatComputedValue(block.low_limit)}</p>
            <p><span class="font-medium">high_limit</span>: {formatComputedValue(block.high_limit)}</p>
          </>
        ) : (
          <>
            <p><span class="font-medium">set</span>: {formatComputedValue(block.set)}</p>
            <p><span class="font-medium">reset</span>: {formatComputedValue(block.reset)}</p>
          </>
        )}
        {Object.entries(block.input_expressions).map(([name, expression]) => (
          <p key={name} class="truncate"><span class="font-medium">{name}</span>: {expression}</p>
        ))}
        {Object.keys(state).length > 0 && (
          <p class="font-mono">state {JSON.stringify(state)}</p>
        )}
      </div>
    </div>
  );
}

function formatComputedValue(value: number | boolean | null) {
  if (value === null) return 'No data';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
}

function LogicDiagramForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [updatePeriod, setUpdatePeriod] = useState('60');
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
    setSaveTxn(Store.m(LogicDiagram).create({ name, update_period: parseInt(updatePeriod, 10) }));
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
      <FormButtons saving={saving} disabled={!name} onSave={handleSave} onCancel={onClose} />
    </div>
  );
}

function LogicBlockForm({ diagram, editId, blocks, onClose }: {
  diagram: FoundRecord<LogicDiagramFields>;
  editId: number | null;
  blocks: FoundRecord<LogicBlockFields>[];
  onClose: () => void;
}) {
  const existing = editId !== null ? Store.m(LogicBlock).fetch(editId) : null;
  const found = existing?._found ? existing as FoundRecord<LogicBlockFields> : null;
  const defaultExpressions = found?.input_expressions ?? { value: '', low_limit: '', high_limit: '' };

  const [name, setName] = useState(found?.name ?? '');
  const [blockType, setBlockType] = useState<LogicBlockFields['block_type']>(found?.block_type ?? 'hysteresis');
  const [mode, setMode] = useState(String(found?.config?.mode ?? 'active_high'));
  const [dominance, setDominance] = useState(String(found?.config?.dominance ?? 'reset'));
  const [expressionsText, setExpressionsText] = useState(expressionsToText(defaultExpressions));
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
    if (!found) {
      setExpressionsText(expressionsToText(defaultExpressionsForType(nextType)));
      setMode(nextType === 'hysteresis' ? 'active_high' : 'latch_high');
    }
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
    const config: Record<string, unknown> = blockType === 'hysteresis'
      ? { mode }
      : { mode, dominance };

    setError(null);
    const fields = {
      logic_diagram_id: diagram.id,
      name,
      block_type: blockType,
      stratum,
      input_expressions,
      config,
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
          </select>
        </label>
        <label class="block">
          <span class="text-xs text-text-muted">Mode</span>
          <select
            class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            value={mode}
            onChange={(e) => setMode((e.target as HTMLSelectElement).value)}
          >
            {blockType === 'hysteresis' ? (
              <>
                <option value="active_high">Active High</option>
                <option value="active_low">Active Low</option>
              </>
            ) : (
              <>
                <option value="latch_high">Latch High</option>
                <option value="latch_low">Latch Low</option>
              </>
            )}
          </select>
        </label>
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

function FormButtons({ saving, disabled, onSave, onCancel }: {
  saving: boolean;
  disabled: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <button
        class="rounded bg-active px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        onClick={onSave}
        disabled={saving || disabled}
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
      <button
        class="rounded border border-border px-3 py-1.5 text-sm font-medium text-text-muted hover:text-text"
        onClick={onCancel}
      >
        Cancel
      </button>
    </>
  );
}

function defaultExpressionsForType(blockType: LogicBlockFields['block_type']) {
  return blockType === 'hysteresis'
    ? { value: '', low_limit: '', high_limit: '' }
    : { set: '', reset: '' };
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

function useTxnStatus(txn: Txn | undefined) {
  return useLoaders(() => {
    const txnResult = txn ? Store.txn_status(txn) : undefined;
    return {
      txnResult,
      saving: !!txn && !txnResult,
    };
  }, [Store], [txn]);
}

// ---------------------------------------------------------------------------
// Measurement components
// ---------------------------------------------------------------------------

function MeasurementCard({ measurement, devices, onEdit }: {
  measurement: FoundRecord<MeasurementFields>;
  devices: ReifiedQueryResult<DeviceFields>;
  onEdit: (id: number) => void;
}) {
  const m = measurement;
  const [editingValue, setEditingValue] = useState(false);
  const [simulationDraft, setSimulationDraft] = useState(String(m.simulation_value ?? ''));
  const [saveTxn, setSaveTxn] = useState<Txn | undefined>();
  const [error, setError] = useState<string | null>(null);
  const valueSaveStarted = useRef(false);
  const { txnResult, saving } = useTxnStatus(saveTxn);

  const device = devices.find((d) => d._found && (d as FoundRecord<DeviceFields>).id === m.device_id);
  const deviceName = device?._found ? (device as FoundRecord<DeviceFields>).name : null;
  const displayValue = m.mode === 'simulation' ? m.simulation_value : m.latest_value;

  useEffect(() => {
    if (!editingValue) setSimulationDraft(String(m.simulation_value ?? ''));
  }, [editingValue, m.simulation_value]);

  useEffect(() => {
    if (!txnResult) return;
    setError(txnResult.status === 'succeeded' ? null : 'Save failed');
  }, [txnResult]);

  const patchMeasurement = (changes: Partial<MeasurementFields>) => {
    setError(null);
    setSaveTxn(Store.m(Measurement).patch(m.id, changes));
  };

  const toggleMode = () => {
    const nextMode: MeasurementFields['mode'] = m.mode === 'simulation' ? 'acquisition' : 'simulation';
    patchMeasurement({ mode: nextMode });
  };

  const startEditingValue = () => {
    if (m.mode !== 'simulation') return;
    valueSaveStarted.current = false;
    setSimulationDraft(String(m.simulation_value ?? ''));
    setEditingValue(true);
  };

  const saveSimulationValue = () => {
    if (valueSaveStarted.current) return;
    if (!editingValue) return;
    valueSaveStarted.current = true;
    setEditingValue(false);
    patchMeasurement({
      simulation_value: simulationDraft.trim() === '' ? null : parseFloat(simulationDraft),
    });
  };

  return (
    <div class="rounded-lg border border-border bg-surface p-3 space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold">{m.name}</h3>
        <button
          class="text-xs text-text-muted hover:text-text"
          onClick={() => onEdit(m.id as number)}
        >
          Edit
        </button>
      </div>

      {editingValue ? (
        <input
          autoFocus
          type="number"
          step="any"
          class="w-full rounded border border-border bg-surface px-2 py-1 text-xl font-mono font-bold"
          value={simulationDraft}
          onInput={(e) => setSimulationDraft((e.target as HTMLInputElement).value)}
          onBlur={saveSimulationValue}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              saveSimulationValue();
            } else if (e.key === 'Escape') {
              valueSaveStarted.current = true;
              setSimulationDraft(String(m.simulation_value ?? ''));
              setEditingValue(false);
            }
          }}
        />
      ) : (
        <button
          class={`block w-full text-left text-xl font-mono font-bold ${m.mode === 'simulation' ? 'cursor-text hover:text-active' : 'cursor-default'}`}
          onClick={startEditingValue}
          disabled={m.mode !== 'simulation'}
        >
          {displayValue !== null
            ? <>{displayValue.toFixed(1)}{m.units && <span class="text-xs text-text-muted ml-1">{m.units}</span>}</>
            : <span class="text-text-muted text-sm">{m.mode === 'simulation' ? 'Set value' : 'No data'}</span>
          }
        </button>
      )}

      <div class="text-xs text-text-muted space-y-0.5">
        <label class="flex items-center justify-between gap-2 rounded bg-surface-alt px-2 py-1">
          <span class={m.mode === 'acquisition' ? 'font-medium text-text' : ''}>Acquisition</span>
          <input
            type="checkbox"
            class="peer sr-only"
            checked={m.mode === 'simulation'}
            disabled={saving}
            onChange={toggleMode}
          />
          <span class="relative h-5 w-9 shrink-0 rounded-full bg-border transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-active peer-checked:after:translate-x-4 peer-disabled:opacity-50" />
          <span class={m.mode === 'simulation' ? 'font-medium text-text' : ''}>Simulation</span>
        </label>
        {m.mode === 'acquisition' && deviceName && <p>Source: {deviceName}</p>}
        {m.mode === 'acquisition' && m.source_path && <p>Path: {m.source_path}</p>}
        {saving && <p>Saving...</p>}
        {error && <p class="text-error">{error}</p>}
        <p class="font-mono">{m.name}</p>
      </div>
    </div>
  );
}

function MeasurementForm({ diagram, editId, devices, onClose }: {
  diagram: FoundRecord<LogicDiagramFields>;
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
  const [units, setUnits] = useState(found?.units ?? '');
  const [saveTxn, setSaveTxn] = useState<Txn | undefined>();
  const [error, setError] = useState<string | null>(null);
  const { txnResult, saving } = useTxnStatus(saveTxn);

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
    if (editId !== null) {
      setSaveTxn(Store.m(Measurement).patch(editId, fields));
    } else {
      setSaveTxn(Store.m(Measurement).create(fields));
    }
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
          disabled={saving || !name}
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
// Output components
// ---------------------------------------------------------------------------

function OutputBlockCard({ output, devices, onEdit }: {
  output: FoundRecord<OutputBlockFields>;
  devices: ReifiedQueryResult<DeviceFields>;
  onEdit: (id: number) => void;
}) {
  const [saveTxn, setSaveTxn] = useState<Txn | undefined>();
  const [error, setError] = useState<string | null>(null);
  const { txnResult, saving } = useTxnStatus(saveTxn);
  const device = devices.find((d) => d._found && (d as FoundRecord<DeviceFields>).id === output.device_id);
  const deviceName = device?._found ? (device as FoundRecord<DeviceFields>).name : 'Unknown device';
  const state = output.latest_state ?? {};
  const skippedReason = typeof state.write_skipped_reason === 'string' ? state.write_skipped_reason : null;

  useEffect(() => {
    if (!txnResult) return;
    setError(txnResult.status === 'succeeded' ? null : 'Save failed');
  }, [txnResult]);

  return (
    <div class="rounded-lg border border-border bg-surface p-3 space-y-2">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-sm font-semibold">{output.name}</h3>
          <p class="text-xs text-text-muted">{deviceName} ch {output.channel}</p>
        </div>
        <button
          class="text-xs text-text-muted hover:text-text"
          onClick={() => onEdit(output.id)}
        >
          Edit
        </button>
      </div>

      <div class="grid grid-cols-2 gap-2 text-xs">
        <div class="rounded bg-surface-alt px-2 py-1.5">
          <p class="text-text-muted">Desired</p>
          <p class="font-mono font-semibold">{formatNullableBool(output.desired_output)}</p>
        </div>
        <div class="rounded bg-surface-alt px-2 py-1.5">
          <p class="text-text-muted">Effective</p>
          <p class="font-mono font-semibold">{formatNullableBool(output.effective_output)}</p>
        </div>
      </div>

      <label class="flex items-center justify-between gap-2 rounded bg-surface-alt px-2 py-1 text-xs text-text-muted">
        <span class={output.output_enable ? 'font-medium text-text' : ''}>Output Enable</span>
        <input
          type="checkbox"
          class="peer sr-only"
          checked={output.output_enable}
          disabled={saving}
          onChange={() => {
            setError(null);
            setSaveTxn(Store.m(OutputBlock).patch(output.id, { output_enable: !output.output_enable }));
          }}
        />
        <span class="relative h-5 w-9 shrink-0 rounded-full bg-border transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-active peer-checked:after:translate-x-4 peer-disabled:opacity-50" />
      </label>

      <div class="text-xs text-text-muted space-y-0.5">
        <p class="font-mono truncate">{output.input_expression}</p>
        {skippedReason && <p>Skipped: {skippedReason}</p>}
        {output.write_pending && <p>Pending poller write</p>}
        {saving && <p>Saving...</p>}
        {error && <p class="text-error">{error}</p>}
      </div>
    </div>
  );
}

function OutputBlockForm({ diagram, editId, devices, onClose }: {
  diagram: FoundRecord<LogicDiagramFields>;
  editId: number | null;
  devices: ReifiedQueryResult<DeviceFields>;
  onClose: () => void;
}) {
  const existing = editId !== null ? Store.m(OutputBlock).fetch(editId) : null;
  const found = existing?._found ? existing as FoundRecord<OutputBlockFields> : null;

  const [name, setName] = useState(found?.name ?? '');
  const [deviceId, setDeviceId] = useState(String(found?.device_id ?? ''));
  const [channel, setChannel] = useState(String(found?.channel ?? '1'));
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
    const fields = {
      logic_diagram_id: diagram.id,
      name,
      device_id: deviceId ? parseInt(deviceId, 10) : null,
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

  const foundDevices = devices.filter((d) => d._found) as FoundRecord<DeviceFields>[];

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
            onChange={(e) => setDeviceId((e.target as HTMLSelectElement).value)}
          >
            <option value="">Select device...</option>
            {foundDevices.map((d) => (
              <option key={d.id} value={String(d.id)}>{d.name}</option>
            ))}
          </select>
        </label>

        <label class="block">
          <span class="text-xs text-text-muted">Channel</span>
          <input
            type="number"
            min="1"
            class="mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            value={channel}
            onInput={(e) => setChannel((e.target as HTMLInputElement).value)}
          />
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
        <FormButtons saving={saving} disabled={!name || !deviceId || !inputExpression} onSave={handleSave} onCancel={onClose} />
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

function formatNullableBool(value: boolean | null) {
  if (value === null) return 'No data';
  return value ? 'true' : 'false';
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
