import type { ReifiedQueryResult } from '../../lib/RestfulModelStore';
import type { MeasurementFields } from '../../store';

export function MeasurementsTab({ measurements }: { measurements: ReifiedQueryResult<MeasurementFields> }) {
  const records = measurements.filter(record => record._found);
  return <section class="space-y-5">
    <div><h2 class="text-lg font-semibold">Measurements</h2><p class="text-sm text-text-muted">Recent values from instance inputs and outputs.</p></div>
    {!measurements._loaded ? <p role="status">Loading measurements…</p> : !measurements._found ? <p role="alert" class="text-error">Could not load measurements. Retrying when available.</p> : records.length === 0 ?
      <p class="rounded border border-dashed border-border p-5 text-text-muted">No measurements yet. Attach one from an instance.</p> :
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{records.map(record => record._found && <article key={String(record.id)} class="rounded-lg border border-border p-4">
        <h3 class="font-semibold">{record.name}</h3>
        <p class="text-sm text-text-muted">{record.source ? `${record.source.logic_instance_name} · ${record.source.name}` : 'Detached'}</p>
        {record.preview.length === 0 ? <p class="mt-3 text-sm text-text-muted">No recorded points yet.</p> : <ul class="mt-3 space-y-2 text-sm">
          {record.preview.map(point => 'snapshot' in point ? <li key={point.id} class="border-t border-border pt-2">
            <span class="font-semibold">{String(point.snapshot.value)}</span> <span class="text-text-muted">· {point.snapshot.logic_instance_name} · {point.snapshot.source_name} · {new Date(point.recorded_at).toLocaleString()}</span>
          </li> : <li key={point.id} class="border-t border-border pt-2">
            <span>Summary · {point.sample_count} samples · {new Date(point.bucket_start).toLocaleString()}</span>
            {point.summaries.map((group, index) => <div key={index} class="text-text-muted">{group.late ? 'Additional samples · ' : ''}{group.logic_instance_name} · {group.source_name} · {group.value_type}: {Object.entries(group.statistics).map(([key, value]) => `${key}: ${String(value)}`).join(', ')}</div>)}
          </li>)}
        </ul>}
      </article>)}</div>}
  </section>;
}
