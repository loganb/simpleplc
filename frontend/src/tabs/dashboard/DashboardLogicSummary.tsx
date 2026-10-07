import type { ExistingRecord } from '../../lib/RestfulModelStore';
import type {
  LogicDiagramFields,
  LogicInputBindingFields,
  LogicInputFields,
  LogicInstanceFields,
  LogicOutputBindingFields,
  LogicOutputFields,
} from '../../store';

type RecordOf<T extends { id: number }> = ExistingRecord<T>;

export function DashboardInstanceSummary({ instance, diagram, inputs, outputs, inputBindings, outputBindings }: {
  instance: RecordOf<LogicInstanceFields>;
  diagram: RecordOf<LogicDiagramFields> | null;
  inputs: RecordOf<LogicInputFields>[];
  outputs: RecordOf<LogicOutputFields>[];
  inputBindings: RecordOf<LogicInputBindingFields>[];
  outputBindings: RecordOf<LogicOutputBindingFields>[];
}) {
  return (
    <div class="rounded-lg border border-border bg-surface p-4 space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-sm font-semibold">{instance.name}</h3>
          <p class="text-xs text-text-muted">{diagram?.name ?? 'Unknown diagram'} · every {instance.update_period}s</p>
        </div>
        <span class={`rounded-full px-2 py-0.5 text-xs font-medium ${
          instance.output_enable ? 'bg-ok-bg text-ok' : 'bg-surface-alt text-text-muted'
        }`}>
          Outputs {instance.output_enable ? 'enabled' : 'disabled'}
        </span>
      </div>

      <div>
        <p class="mb-2 text-xs font-semibold uppercase text-text-muted">Inputs</p>
        {inputs.length === 0 ? (
          <p class="rounded bg-surface-alt px-2 py-1.5 text-xs text-text-muted">No inputs defined.</p>
        ) : (
          <div class="grid gap-2 sm:grid-cols-2">
            {inputs.map((input) => {
              const binding = inputBindings.find((candidate) => candidate.logic_input_id === input.id);
              return <ValueTile key={input.id} label={input.name}
                value={formatValue(binding?.latest_value ?? null, input.units)}
                sublabel={binding ? binding.source_kind === 'fixed_value' ? 'Fixed value' : 'Device input' : 'Not connected'} />;
            })}
          </div>
        )}
      </div>

      <div>
        <p class="mb-2 text-xs font-semibold uppercase text-text-muted">Outputs</p>
        {outputs.length === 0 ? (
          <p class="rounded bg-surface-alt px-2 py-1.5 text-xs text-text-muted">No outputs defined.</p>
        ) : (
          <div class="grid gap-2 sm:grid-cols-2">
            {outputs.map((output) => {
              const binding = outputBindings.find((candidate) => candidate.logic_output_id === output.id);
              return <ValueTile key={output.id} label={output.name}
                value={formatValue(binding?.effective_output ?? null, output.units)}
                sublabel={binding ? `Desired ${formatValue(binding.desired_output, output.units)}${binding.output_enable ? '' : ' · disabled'}` : 'Not connected'} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ValueTile({ label, value, sublabel }: {
  label: string;
  value: string;
  sublabel: string;
}) {
  return (
    <div class="rounded bg-surface-alt px-3 py-2">
      <div class="flex items-start justify-between gap-3">
        <p class="min-w-0 truncate text-xs text-text-muted">{label}</p>
        <p class="shrink-0 font-mono text-sm font-semibold">{value}</p>
      </div>
      <p class="mt-1 truncate text-xs text-text-muted">{sublabel}</p>
    </div>
  );
}

function formatValue(value: number | boolean | null, units: string | null) {
  if (value === null) return 'No data';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  const formatted = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  return units ? `${formatted} ${units}` : formatted;
}
