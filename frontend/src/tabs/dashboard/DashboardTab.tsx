import type { ReifiedQueryResult } from '../../lib/RestfulModelStore';
import type { ExistingRecord } from '../../lib/RestfulModelStore';
import type {
  DeviceFields,
  HostInterfaceFields,
  LogicDiagramFields,
  LogicInputBindingFields,
  LogicInputFields,
  LogicInstanceFields,
  LogicOutputBindingFields,
  LogicOutputFields,
} from '../../store';
import type { DashboardUXState } from '../../uxTree';
import { DashboardInstanceSummary } from './DashboardLogicSummary';
import { DeviceStateCard } from './DeviceStateCard';

export function DashboardTab({
  devices,
  interfaces,
  logicDiagrams,
  logicInstances,
  logicInputs,
  logicOutputs,
  inputBindings,
  outputBindings,
  ux: _ux,
}: {
  devices: ReifiedQueryResult<DeviceFields>;
  interfaces: ReifiedQueryResult<HostInterfaceFields>;
  logicDiagrams: ReifiedQueryResult<LogicDiagramFields>;
  logicInstances: ReifiedQueryResult<LogicInstanceFields>;
  logicInputs: ReifiedQueryResult<LogicInputFields>;
  logicOutputs: ReifiedQueryResult<LogicOutputFields>;
  inputBindings: ReifiedQueryResult<LogicInputBindingFields>;
  outputBindings: ReifiedQueryResult<LogicOutputBindingFields>;
  ux: DashboardUXState;
}) {
  const found = <T extends { id: number }>(query: ReifiedQueryResult<T>) => query._loaded
    ? query.filter((record) => record._found) as ExistingRecord<T>[]
    : [];
  const foundDiagrams = found(logicDiagrams);
  const foundInstances = found(logicInstances);
  const foundInputs = found(logicInputs);
  const foundOutputs = found(logicOutputs);
  const foundInputBindings = found(inputBindings);
  const foundOutputBindings = found(outputBindings);

  return (
    <div class="space-y-8">
      <section>
        <h2 class="mb-4 text-lg font-semibold">Devices</h2>
        {!devices._loaded ? (
          <p class="text-text-muted">Loading devices...</p>
        ) : (
          <div class="grid gap-4 md:grid-cols-3">
            {devices.map((device) => (
              <DeviceStateCard key={device.id as number} device={device} interfaces={interfaces} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 class="mb-4 text-lg font-semibold">Instances</h2>
        {!logicInstances._loaded ? (
          <p class="text-text-muted">Loading logic instances...</p>
        ) : foundInstances.length === 0 ? (
          <p class="text-text-muted">No logic instances configured yet.</p>
        ) : (
          <div class="grid gap-4 xl:grid-cols-2">
            {foundInstances.map((instance) => (
              <DashboardInstanceSummary
                key={instance.id}
                instance={instance}
                diagram={foundDiagrams.find((diagram) => diagram.id === instance.logic_diagram_id) ?? null}
                inputs={foundInputs.filter((input) => input.logic_diagram_id === instance.logic_diagram_id)}
                outputs={foundOutputs.filter((output) => output.logic_diagram_id === instance.logic_diagram_id)}
                inputBindings={foundInputBindings.filter((binding) => binding.logic_instance_id === instance.id)}
                outputBindings={foundOutputBindings.filter((binding) => binding.logic_instance_id === instance.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
