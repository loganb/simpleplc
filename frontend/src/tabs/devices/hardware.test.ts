import { describe, it, expect } from 'vitest';
import { computeImpact, matchesBus, scanActive, sortedSupport, txnErrorMessage } from './hardware';
import type { DriverSupport } from '../../store';
const support: DriverSupport[] = [
  { driver: 'relay', support: 'maybe', reason: 'Ambiguous', evidence: [] },
  { driver: 'ntc', support: 'no', reason: 'Wrong registers', evidence: [] },
  { driver: 'temp', support: 'yes', reason: 'Matched', evidence: [] },
];
describe('hardware helpers', () => {
  it('orders driver verdicts yes, maybe, no without mutating them', () => {
    expect(sortedSupport(support).map(v => v.support)).toEqual(['yes', 'maybe', 'no']);
    expect(support[0].support).toBe('maybe');
  });
  it('surfaces field, HTTP and network errors from a failed transaction', () => {
    expect(txnErrorMessage({ errors: { name: ['is required'], base: ['Reload'] }, httpStatus: 422 })).toBe('name: is required; Reload');
    expect(txnErrorMessage({ httpStatus: 500 })).toBe('Request failed (500). Please retry.');
    expect(txnErrorMessage({})).toBe('Could not reach the server. Please retry.');
  });
  it('finds the measurements and outputs that depend on the given devices', () => {
    const impact = computeImpact([{ id: 3, name: 'Relay' }],
      [{ id: 1, name: 'Supply', device_id: 3, logic_diagram_id: 7 }, { id: 2, name: 'Other', device_id: 4, logic_diagram_id: 7 }, { id: 5, name: 'Sim', device_id: null, logic_diagram_id: 7 }],
      [{ id: 9, name: 'Fan', device_id: 3, logic_diagram_id: 8, output_enable: true }]);
    expect(impact).toEqual({ devices: [{ id: 3, name: 'Relay' }], measurements: [{ id: 1, name: 'Supply', logic_diagram_id: 7 }],
      output_blocks: [{ id: 9, name: 'Fan', logic_diagram_id: 8, output_enable: true }] });
  });
  it('treats cancelling as active and compares scan profiles with the bus', () => {
    expect(scanActive('cancelling')).toBe(true);
    expect(scanActive('cancelled')).toBe(false);
    const bus = { baud_rate: 9600, data_bits: 8, stop_bits: 1, parity: 'none' };
    expect(matchesBus({ ...bus }, bus)).toBe(true);
    expect(matchesBus({ ...bus, baud_rate: 19200 }, bus)).toBe(false);
  });
});
