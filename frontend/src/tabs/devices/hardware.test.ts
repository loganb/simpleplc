import { describe, it, expect } from 'vitest';
import { adoptResult, errorMessage, sortedSupport } from './hardware';
import type { ScanDevice } from '../../store';
const result: ScanDevice = { address: 1, profile_index: 0, profile: { baud_rate: 9600, data_bits: 8, stop_bits: 1, parity: 'none' }, observed_at: '', driver_support: [
  { driver: 'relay', support: 'maybe', reason: 'Ambiguous', evidence: [] },
  { driver: 'ntc', support: 'no', reason: 'Wrong registers', evidence: [] },
] };
describe('hardware review', () => {
  it('preserves the selected existing record and other rows', () => {
    const rows = [{ id: 3, name: 'Relay', driver: 'relay', modbus_address: 3 }, { id: 2, name: 'Other', driver: 'ntc', modbus_address: 2 }];
    const updated = adoptResult(rows, result, 'relay', 'scan-1', 3);
    expect(updated[0]).toMatchObject({ id: 3, name: 'Relay', modbus_address: 1, scan_request_id: 'scan-1' });
    expect(updated[1]).toEqual(rows[1]);
    expect(rows[0].modbus_address).toBe(3);
    expect(result.driver_support[0].support).toBe('maybe');
  });
  it('requires a supported or uncertain choice, not the first result automatically', () => {
    expect(() => adoptResult([], result, '', 'a')).toThrow();
    expect(() => adoptResult([], result, 'ntc', 'a')).toThrow();
    expect(adoptResult([], result, 'relay', 'a')).toHaveLength(1);
    expect(sortedSupport(result.driver_support).map(v => v.support)).toEqual(['maybe', 'no']);
  });
  it('surfaces field and network errors', () => {
    expect(errorMessage({ response: { data: { errors: { name: ['is required'], base: ['Reload'] } } } })).toBe('name: is required; Reload');
    expect(errorMessage(new Error('Network unavailable'))).toBe('Network unavailable');
  });
});
