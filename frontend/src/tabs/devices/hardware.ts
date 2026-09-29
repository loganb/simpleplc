import type { TxnResult } from '../../lib/RestfulModelStore';
import type { DriverSupport, HostInterfaceFields, MeasurementFields, OutputBlockFields, SerialProfile } from '../../store';

/** A failed store transaction as operator-facing text: field errors when the server sent them. */
export function txnErrorMessage(result: Pick<TxnResult, 'errors' | 'httpStatus'>): string {
  const errors = result.errors as Record<string, string[] | string> | undefined;
  if (errors && typeof errors === 'object' && Object.keys(errors).length) {
    return Object.entries(errors).map(([key, value]) => `${key === 'base' ? '' : key + ': '}${Array.isArray(value) ? value.join(', ') : value}`).join('; ');
  }
  return result.httpStatus ? `Request failed (${result.httpStatus}). Please retry.` : 'Could not reach the server. Please retry.';
}

interface Reference { id: number; name: string; logic_diagram_id: number; output_enable?: boolean }
export interface Impact { devices: { id: number; name: string }[]; measurements: Reference[]; output_blocks: Reference[] }
/** What depends on these devices: the same dependencies the server refuses to delete through. */
export function computeImpact(devices: { id: number; name: string }[], measurements: Pick<MeasurementFields, 'id' | 'name' | 'device_id' | 'logic_diagram_id'>[],
  outputBlocks: Pick<OutputBlockFields, 'id' | 'name' | 'device_id' | 'logic_diagram_id' | 'output_enable'>[]): Impact {
  const ids = new Set(devices.map(d => d.id));
  return {
    devices: devices.map(({ id, name }) => ({ id, name })),
    measurements: measurements.filter(m => m.device_id !== null && ids.has(m.device_id)).map(({ id, name, logic_diagram_id }) => ({ id, name, logic_diagram_id })),
    output_blocks: outputBlocks.filter(o => ids.has(o.device_id)).map(({ id, name, logic_diagram_id, output_enable }) => ({ id, name, logic_diagram_id, output_enable })),
  };
}

export const scanActive = (state: string) => state === 'requested' || state === 'scanning' || state === 'cancelling';
export const sortedSupport = (list: DriverSupport[]) => [...list].sort((a, b) => ({ yes: 0, maybe: 1, no: 2 }[a.support] - { yes: 0, maybe: 1, no: 2 }[b.support]));
/** A device found at other serial settings won't be polled until the bus uses them. */
export const matchesBus = (profile: SerialProfile, iface: Pick<HostInterfaceFields, 'baud_rate' | 'data_bits' | 'stop_bits' | 'parity'>) =>
  profile.baud_rate === iface.baud_rate && profile.data_bits === iface.data_bits && profile.stop_bits === iface.stop_bits && profile.parity === iface.parity;
export const inputClass = 'mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm';
export const buttonClass = 'rounded border border-border px-3 py-1.5 text-sm disabled:opacity-50';
