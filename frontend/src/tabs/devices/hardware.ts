import type { TxnResult } from '../../lib/RestfulModelStore';
import type {
  DriverSupport,
  HostInterfaceFields,
  LogicInputBindingFields,
  LogicInputFields,
  LogicInstanceFields,
  LogicOutputBindingFields,
  LogicOutputFields,
  SerialProfile,
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

export const scanActive = (state: string) => state === 'requested' || state === 'scanning' || state === 'cancelling';
export const sortedSupport = (list: DriverSupport[]) => [...list].sort((a, b) => ({ yes: 0, maybe: 1, no: 2 }[a.support] - { yes: 0, maybe: 1, no: 2 }[b.support]));
/** A device found at other serial settings won't be polled until the bus uses them. */
export const matchesBus = (profile: SerialProfile, iface: Pick<HostInterfaceFields, 'baud_rate' | 'data_bits' | 'stop_bits' | 'parity'>) =>
  profile.baud_rate === iface.baud_rate && profile.data_bits === iface.data_bits && profile.stop_bits === iface.stop_bits && profile.parity === iface.parity;
export const inputClass = 'mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm';
export const buttonClass = 'rounded border border-border px-3 py-1.5 text-sm disabled:opacity-50';
