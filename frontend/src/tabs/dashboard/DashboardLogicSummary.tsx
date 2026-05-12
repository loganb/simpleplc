import { formatNullableBool } from '../../components/format';
import type { ExistingRecord, ReifiedQueryResult } from '../../lib/RestfulModelStore';
import type {
  LogicDiagramFields,
  MeasurementFields,
  OutputBlockFields,
} from '../../store';

export function DashboardLogicSummary({ diagram, measurements, outputBlocks }: {
  diagram: ExistingRecord<LogicDiagramFields>;
  measurements: ReifiedQueryResult<MeasurementFields>;
  outputBlocks: ReifiedQueryResult<OutputBlockFields>;
}) {
  const diagramMeasurements = measurements._loaded
    ? measurements.filter((m) => (
      m._found && (m as ExistingRecord<MeasurementFields>).logic_diagram_id === diagram.id
    )) as ExistingRecord<MeasurementFields>[]
    : [];
  const diagramOutputs = outputBlocks._loaded
    ? outputBlocks.filter((o) => (
      o._found && (o as ExistingRecord<OutputBlockFields>).logic_diagram_id === diagram.id
    )) as ExistingRecord<OutputBlockFields>[]
    : [];

  return (
    <div class="rounded-lg border border-border bg-surface p-4 space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-sm font-semibold">{diagram.name}</h3>
          <p class="text-xs text-text-muted">Every {diagram.update_period}s</p>
        </div>
        <span class={`rounded-full px-2 py-0.5 text-xs font-medium ${
          diagram.output_enable ? 'bg-ok-bg text-ok' : 'bg-surface-alt text-text-muted'
        }`}>
          Outputs {diagram.output_enable ? 'enabled' : 'disabled'}
        </span>
      </div>

      <div>
        <p class="mb-2 text-xs font-semibold uppercase text-text-muted">Inputs</p>
        {diagramMeasurements.length === 0 ? (
          <p class="rounded bg-surface-alt px-2 py-1.5 text-xs text-text-muted">No inputs configured.</p>
        ) : (
          <div class="grid gap-2 sm:grid-cols-2">
            {diagramMeasurements.map((measurement) => (
              <ValueTile
                key={measurement.id}
                label={measurement.name}
                value={formatMeasurementValue(measurement)}
                sublabel={measurement.mode}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <p class="mb-2 text-xs font-semibold uppercase text-text-muted">Outputs</p>
        {diagramOutputs.length === 0 ? (
          <p class="rounded bg-surface-alt px-2 py-1.5 text-xs text-text-muted">No outputs configured.</p>
        ) : (
          <div class="grid gap-2 sm:grid-cols-2">
            {diagramOutputs.map((output) => (
              <ValueTile
                key={output.id}
                label={output.name}
                value={formatNullableBool(output.effective_output)}
                sublabel={`desired ${formatNullableBool(output.desired_output)}`}
              />
            ))}
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

function formatMeasurementValue(measurement: ExistingRecord<MeasurementFields>) {
  const value = measurement.mode === 'simulation' ? measurement.simulation_value : measurement.latest_value;
  if (value === null) return 'No data';
  const formatted = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  return measurement.units ? `${formatted} ${measurement.units}` : formatted;
}
