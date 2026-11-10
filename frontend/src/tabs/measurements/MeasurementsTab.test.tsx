// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import TreeStore from '../../lib/TreeStore';
import type { MeasurementsUXTree } from '../../uxTree';
vi.mock('./MeasurementHistoryGraph', () => ({ MeasurementHistoryGraph: () => <div>Graph</div> }));
const ux = new TreeStore<MeasurementsUXTree>().subtree();
import { cleanup, render, screen } from '@testing-library/preact';
import type { ReifiedQueryResult } from '../../lib/RestfulModelStore';
import type { MeasurementFields } from '../../store';
import { MeasurementsTab } from './MeasurementsTab';

const query = (records: Partial<MeasurementFields>[], loaded = true) => Object.assign(records.map(r => ({ ...r, _found: true })), { _loaded: loaded, _found: loaded }) as unknown as ReifiedQueryResult<MeasurementFields>;
afterEach(cleanup);
describe('MeasurementsTab', () => {
  it('shows detached history without losing false, zero or null', () => {
    const samples = [false, 0, null].map((value, i) => ({ id: i + 10, name: `Test ${i}`, source: null, preview_kind: 'samples' as const, preview: [{ id: i, measurement_id: i + 10, recorded_at: '2026-01-01T00:00:00Z', snapshot: { value, source_name: 'Port', logic_instance_name: 'AHU', value_type: 'number' as const, logic_instance_id: 1, logic_diagram_id: 1, logic_diagram_name: 'Diagram', source_type: 'LogicInput' as const, source_id: 1 } }] }));
    render(<MeasurementsTab ux={ux} refreshToken={0} measurements={query(samples)} />);
    expect(screen.getAllByText('Detached')[0]).toBeTruthy();
    expect(screen.getByText('false')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.getByText('Unavailable')).toBeTruthy();
  });
  it('labels summary fallback and empty state', () => {
    render(<MeasurementsTab ux={ux} refreshToken={0} measurements={query([{ id: 1, name: 'Old', source: null, preview_kind: 'rollups', preview: [{ id: 2, measurement_id: 1, bucket_start: '2026-01-01T00:00:00Z', sample_count: 2, summaries: [] }] }, { id: 2, name: 'New', source: null, preview_kind: null, preview: [] }])} />);
    expect(screen.getByText(/Summary · 2 samples/)).toBeTruthy();
    expect(screen.getByText('No recorded points yet.')).toBeTruthy();
  });
  it('distinguishes loading, error, and no measurements', () => {
    const { rerender } = render(<MeasurementsTab ux={ux} refreshToken={0} measurements={query([], false)} />);
    expect(screen.getByText('Loading measurements…')).toBeTruthy();
    rerender(<MeasurementsTab ux={ux} refreshToken={0} measurements={Object.assign(query([]), { _found: false })} />);
    expect(screen.getByRole('alert').textContent).toContain('Could not load measurements');
    rerender(<MeasurementsTab ux={ux} refreshToken={0} measurements={query([])} />);
    expect(screen.getByText(/No measurements yet/)).toBeTruthy();
  });

});
