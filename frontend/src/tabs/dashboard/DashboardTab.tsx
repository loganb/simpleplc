import type { ReifiedQueryResult } from '../../lib/RestfulModelStore';
import type { ExistingRecord } from '../../lib/RestfulModelStore';
import type {
  DeviceFields,
  HostInterfaceFields,
  LogicDiagramFields,
  MeasurementFields,
  OutputBlockFields,
} from '../../store';
import type { DashboardUXState } from '../../uxTree';
import { DashboardLogicSummary } from './DashboardLogicSummary';
import { DeviceStateCard } from './DeviceStateCard';

export function DashboardTab({
  devices,
  interfaces,
  logicDiagrams,
  measurements,
  outputBlocks,
  ux: _ux,
}: {
  devices: ReifiedQueryResult<DeviceFields>;
  interfaces: ReifiedQueryResult<HostInterfaceFields>;
  logicDiagrams: ReifiedQueryResult<LogicDiagramFields>;
  measurements: ReifiedQueryResult<MeasurementFields>;
  outputBlocks: ReifiedQueryResult<OutputBlockFields>;
  ux: DashboardUXState;
}) {
  const foundDiagrams = logicDiagrams._loaded
    ? logicDiagrams.filter((d) => d._found) as ExistingRecord<LogicDiagramFields>[]
    : [];

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
        <h2 class="mb-4 text-lg font-semibold">Logic</h2>
        {!logicDiagrams._loaded ? (
          <p class="text-text-muted">Loading logic diagrams...</p>
        ) : foundDiagrams.length === 0 ? (
          <p class="text-text-muted">No logic diagrams configured yet.</p>
        ) : (
          <div class="grid gap-4 xl:grid-cols-2">
            {foundDiagrams.map((diagram) => (
              <DashboardLogicSummary
                key={diagram.id as number}
                diagram={diagram}
                measurements={measurements}
                outputBlocks={outputBlocks}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
