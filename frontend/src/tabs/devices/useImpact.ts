import { useLoaders } from '../../lib/DataLoader2';
import type { ExistingRecord } from '../../lib/RestfulModelStore';
import { Measurement, OutputBlock, Store } from '../../store';
import type { MeasurementFields, OutputBlockFields } from '../../store';
import { computeImpact } from './hardware';
import type { Impact } from './hardware';

/** Dependencies on these devices, from the same Measurement/OutputBlock queries App loads. Null until loaded. */
export function useImpact(devices: { id: number; name: string }[]): Impact | null {
  const { measurements, outputBlocks } = useLoaders(() => ({
    measurements: Store.m(Measurement).queryFor(null, {}),
    outputBlocks: Store.m(OutputBlock).queryFor(null, {}),
  }), [Store], []);
  if (!measurements._loaded || !outputBlocks._loaded) return null;
  return computeImpact(devices,
    measurements.filter(m => m._found) as ExistingRecord<MeasurementFields>[],
    outputBlocks.filter(o => o._found) as ExistingRecord<OutputBlockFields>[]);
}
