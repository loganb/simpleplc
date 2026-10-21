import type { TxnResult } from '../../lib/RestfulModelStore';
import type {
  DeviceScanFields,
  DriverSupport,
  LogicInputBindingFields,
  LogicInputFields,
  LogicInstanceFields,
  LogicOutputBindingFields,
  LogicOutputFields,
  ProbeEvidence,
} from '../../store';

/** A failed store transaction as operator-facing text: field errors when the server sent them. */
export function txnErrorMessage(result: Pick<TxnResult, 'errors' | 'httpStatus'>): string {
  const errors = result.errors as Record<string, string[] | string> | undefined;
  if (errors && typeof errors === 'object' && Object.keys(errors).length) {
    return Object.entries(errors).map(([key, value]) => `${key === 'base' ? '' : key + ': '}${Array.isArray(value) ? value.join(', ') : value}`).join('; ');
  }
  return result.httpStatus ? `Request failed (${result.httpStatus}). Please retry.` : 'Could not reach the server. Please retry.';
}

interface Reference { id: number; name: string; logic_instance_id: number; output_enable?: boolean }
export interface Impact {
  devices: { id: number; name: string }[];
  logic_input_bindings: Reference[];
  logic_output_bindings: Reference[];
}
/** What depends on these devices: the same dependencies the server refuses to delete through. */
export function computeImpact(
  devices: { id: number; name: string }[],
  inputBindings: Pick<LogicInputBindingFields, 'id' | 'device_id' | 'logic_instance_id' | 'logic_input_id'>[],
  outputBindings: Pick<LogicOutputBindingFields, 'id' | 'device_id' | 'logic_instance_id' | 'logic_output_id' | 'output_enable'>[],
  inputs: Pick<LogicInputFields, 'id' | 'name'>[],
  outputs: Pick<LogicOutputFields, 'id' | 'name'>[],
  instances: Pick<LogicInstanceFields, 'id' | 'name'>[],
): Impact {
  const ids = new Set(devices.map(d => d.id));
  const instanceName = (id: number) => instances.find(instance => instance.id === id)?.name ?? `Instance ${id}`;
  return {
    devices: devices.map(({ id, name }) => ({ id, name })),
    logic_input_bindings: inputBindings.filter(binding => binding.device_id !== null && ids.has(binding.device_id)).map(binding => ({
      id: binding.id,
      name: `${instanceName(binding.logic_instance_id)} · ${inputs.find(input => input.id === binding.logic_input_id)?.name ?? `Input ${binding.logic_input_id}`}`,
      logic_instance_id: binding.logic_instance_id,
    })),
    logic_output_bindings: outputBindings.filter(binding => ids.has(binding.device_id)).map(binding => ({
      id: binding.id,
      name: `${instanceName(binding.logic_instance_id)} · ${outputs.find(output => output.id === binding.logic_output_id)?.name ?? `Output ${binding.logic_output_id}`}`,
      logic_instance_id: binding.logic_instance_id,
      output_enable: binding.output_enable,
    })),
  };
}

/** A pending or running scan holds the bus; anything else has ended. */
export const scanActive = (state: DeviceScanFields['state']) => state === 'pending' || state === 'running';
const SUPPORT_RANK = { yes: 0, maybe: 1, no: 2 };
export const sortedSupport = (list: DriverSupport[]) => [...list].sort((a, b) => SUPPORT_RANK[a.support] - SUPPORT_RANK[b.support]);
/** The most likely driver: `yes` before `maybe`; null when every driver ruled itself out. */
export const bestSupport = (list: DriverSupport[]): DriverSupport | null => {
  const [best] = sortedSupport(list);
  return best && best.support !== 'no' ? best : null;
};
/** One register read as a sentence, e.g. "Holding register 247: ok, value 2632". */
export function describeEvidence(item: ProbeEvidence): string {
  const kind = item.kind === 'input_registers' ? 'Input' : 'Holding';
  const where = Array.isArray(item.address) ? `registers ${item.address[0]}–${item.address[1]}` : `register ${item.address}`;
  const readings = item.values === undefined ? [] : Array.isArray(item.values) ? item.values : [item.values];
  const values = readings.length ? `, ${readings.length === 1 ? 'value' : 'values'} ${readings.join(', ')}` : '';
  return `${kind} ${where}: ${item.status}${values}${item.error ? ` (${item.error})` : ''}`;
}
/** The distinct reads behind a result's verdicts; each driver's evidence repeats the shared ones. */
export function distinctEvidence(list: DriverSupport[]): ProbeEvidence[] {
  const seen = new Map<string, ProbeEvidence>();
  for (const verdict of list) for (const item of verdict.evidence ?? []) seen.set(JSON.stringify(item), item);
  return [...seen.values()];
}
export const inputClass = 'mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm';
export const buttonClass = 'rounded border border-border px-3 py-1.5 text-sm disabled:opacity-50';
