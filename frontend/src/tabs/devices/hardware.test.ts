import { describe, it, expect } from 'vitest';
import { bestSupport, computeImpact, describeEvidence, distinctEvidence, scanActive, sortedSupport, txnErrorMessage } from './hardware';
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
  it('finds instance connections that depend on the given devices', () => {
    const impact = computeImpact([{ id: 3, name: 'Relay' }],
      [{ id: 1, device_id: 3, logic_instance_id: 7, logic_input_id: 11 }, { id: 2, device_id: 4, logic_instance_id: 7, logic_input_id: 12 }],
      [{ id: 9, device_id: 3, logic_instance_id: 8, logic_output_id: 21, output_enable: true }],
      [{ id: 11, name: 'Supply' }, { id: 12, name: 'Other' }],
      [{ id: 21, name: 'Fan' }],
      [{ id: 7, name: 'Boiler' }, { id: 8, name: 'Ventilation' }]);
    expect(impact).toEqual({
      devices: [{ id: 3, name: 'Relay' }],
      logic_input_bindings: [{ id: 1, name: 'Boiler · Supply', logic_instance_id: 7 }],
      logic_output_bindings: [{ id: 9, name: 'Ventilation · Fan', logic_instance_id: 8, output_enable: true }],
    });
  });
  it('treats only pending and running scans as active', () => {
    expect(scanActive('pending')).toBe(true);
    expect(scanActive('running')).toBe(true);
    for (const state of ['done', 'failed', 'cancelled'] as const) expect(scanActive(state)).toBe(false);
  });
  it('picks yes before maybe as the best driver, and none when all are ruled out', () => {
    expect(bestSupport(support)?.driver).toBe('temp');
    expect(bestSupport(support.slice(0, 2))?.driver).toBe('relay');
    expect(bestSupport(support.slice(1, 2))).toBeNull();
    expect(bestSupport([])).toBeNull();
  });
  it('describes register reads in words and lists shared evidence once', () => {
    expect(describeEvidence({ kind: 'holding_registers', address: 247, status: 'ok', values: [2632] })).toBe('Holding register 247: ok, value 2632');
    expect(describeEvidence({ kind: 'holding_registers', address: 247, status: 'ok', values: 2632 })).toBe('Holding register 247: ok, value 2632');
    expect(describeEvidence({ kind: 'input_registers', address: [0, 3], status: 'ok', values: [1, 2, 3, 4] })).toBe('Input registers 0–3: ok, values 1, 2, 3, 4');
    expect(describeEvidence({ kind: 'holding_registers', address: 0, status: 'timeout', error: 'no reply' })).toBe('Holding register 0: timeout (no reply)');
    const read = { kind: 'holding_registers', address: 0, status: 'ok', values: [0] };
    expect(distinctEvidence([{ ...support[0], evidence: [read] }, { ...support[1], evidence: [read, { ...read, address: 247 }] }])).toHaveLength(2);
  });
});
