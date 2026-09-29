// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
vi.mock('../../components/useTxnStatus', () => ({
  useTxnStatus: () => ({ txnResult: undefined, saving: false }),
}));
import { OutputBlockForm } from './OutputBlockForm';
import { OutputBlock, Store } from '../../store';
import type { DeviceFields, LogicDiagramFields } from '../../store';
import type { ExistingRecord, ReifiedQueryResult } from '../../lib/RestfulModelStore';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const diagram = { _found: true, id: 9, name: 'Boiler' } as unknown as ExistingRecord<LogicDiagramFields>;
const devices = Object.assign([
  { _found: true, id: 2, name: 'Relay board', inputs: [], outputs: [
    { channel: 1, label: 'Supply fan', value_type: 'boolean', units: null },
    { channel: 2, label: 'Alarm relay', value_type: 'boolean', units: null },
  ] },
  { _found: true, id: 3, name: 'Other relay', inputs: [], outputs: [
    { channel: 4, label: 'Pump', value_type: 'boolean', units: null },
  ] },
], { _loaded: true }) as unknown as ReifiedQueryResult<DeviceFields>;

describe('OutputBlockForm', () => {
  it('selects an enumerated output by effective label and stores its numeric channel', () => {
    const create = vi.spyOn(Store.m(OutputBlock), 'create').mockReturnValue(undefined as never);
    render(<OutputBlockForm diagram={diagram} editId={null} devices={devices} onClose={vi.fn()} />);

    const output = screen.getByLabelText('Output') as HTMLSelectElement;
    expect(output.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Device'), { target: { value: '2' } });
    expect(screen.getByRole('option', { name: 'Alarm relay (channel 2)' })).toBeTruthy();
    fireEvent.change(output, { target: { value: '2' } });

    fireEvent.change(screen.getByLabelText('Device'), { target: { value: '3' } });
    expect(output.value).toBe('');
    expect(screen.queryByRole('option', { name: 'Alarm relay (channel 2)' })).toBeNull();
    fireEvent.change(output, { target: { value: '4' } });
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'RunPump' } });
    fireEvent.input(screen.getByLabelText('Input Expression'), { target: { value: 'HeatCall' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ device_id: 3, channel: 4 }));
  });
});
