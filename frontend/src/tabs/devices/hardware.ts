import type { DeviceFields, DriverSupport, ScanDevice } from '../../store';

export function errorMessage(error: unknown): string {
  const e = error as { response?: { data?: { errors?: Record<string, string[]>; message?: string } }; message?: string };
  const data = e.response?.data;
  if (data?.errors) return Object.entries(data.errors).map(([key, value]) => `${key === 'base' ? '' : key + ': '}${Array.isArray(value) ? value.join(', ') : value}`).join('; ');
  return data?.message || e.message || 'Request failed. Please retry.';
}
export const scanActive = (state: string) => state === 'requested' || state === 'scanning';
export const sortedSupport = (list: DriverSupport[]) => [...list].sort((a, b) => ({ yes: 0, maybe: 1, no: 2 }[a.support] - { yes: 0, maybe: 1, no: 2 }[b.support]));
export interface DeviceDraft { id?: number; name: string; driver: string; modbus_address: number; scan_request_id?: string; profile_index?: number }
export const deviceDraft = (device: DeviceFields): DeviceDraft => ({ id: device.id, name: device.name, driver: device.driver, modbus_address: device.modbus_address });
export function adoptResult(rows: DeviceDraft[], result: ScanDevice, driver: string, token: string, existingId?: number): DeviceDraft[] {
  if (!result.driver_support.some(v => v.driver === driver && v.support !== 'no')) throw new Error('Select a Yes or Maybe driver');
  const existing = rows.find(d => d.id === existingId && existingId !== undefined);
  const choice: DeviceDraft = { id: existingId, name: existing?.name || `Device at ${result.address}`, driver,
    modbus_address: result.address, scan_request_id: token, profile_index: result.profile_index };
  return existing ? rows.map(d => d === existing ? choice : d) : [...rows, choice];
}
export const inputClass = 'mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm';
export const buttonClass = 'rounded border border-border px-3 py-1.5 text-sm disabled:opacity-50';
