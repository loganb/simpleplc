import { useLoaders } from '../../lib/DataLoader2';
import type { ExistingRecord } from '../../lib/RestfulModelStore';
import { LogicInput, LogicInputBinding, LogicInstance, LogicOutput, LogicOutputBinding, Store } from '../../store';
import type {
  LogicInputBindingFields,
  LogicInputFields,
  LogicInstanceFields,
  LogicOutputBindingFields,
  LogicOutputFields,
} from '../../store';
import { computeImpact } from './hardware';
import type { Impact } from './hardware';

/** Instance connections that must be reassigned before these devices can be deleted. */
export function useImpact(devices: { id: number; name: string }[], enabled = true): Impact | null {
  const queries = useLoaders(() => enabled ? ({
    inputBindings: Store.m(LogicInputBinding).queryFor(null, {}),
    outputBindings: Store.m(LogicOutputBinding).queryFor(null, {}),
    inputs: Store.m(LogicInput).queryFor(null, {}),
    outputs: Store.m(LogicOutput).queryFor(null, {}),
    instances: Store.m(LogicInstance).queryFor(null, {}),
  }) : null, [Store], [enabled]);
  if (!queries) return null;
  const { inputBindings, outputBindings, inputs, outputs, instances } = queries;
  if (![inputBindings, outputBindings, inputs, outputs, instances].every(query => query._loaded)) return null;
  return computeImpact(devices,
    inputBindings.filter(binding => binding._found) as ExistingRecord<LogicInputBindingFields>[],
    outputBindings.filter(binding => binding._found) as ExistingRecord<LogicOutputBindingFields>[],
    inputs.filter(input => input._found) as ExistingRecord<LogicInputFields>[],
    outputs.filter(output => output._found) as ExistingRecord<LogicOutputFields>[],
    instances.filter(instance => instance._found) as ExistingRecord<LogicInstanceFields>[]);
}
