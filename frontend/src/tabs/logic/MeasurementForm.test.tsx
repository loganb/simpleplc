// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
vi.mock('../../components/useTxnStatus', () => ({
  useTxnStatus: () => ({ txnResult: undefined, saving: false }),
}));
import { MeasurementForm } from './MeasurementForm';
import { Measurement, Store } from '../../store';
import type { DeviceFields, LogicDiagramFields } from '../../store';
import type { ExistingRecord, ReifiedQueryResult } from '../../lib/RestfulModelStore';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const diagram = {
  _found: true,
  id: 9,
  name: 'Boiler',
} as unknown as ExistingRecord<LogicDiagramFields>;

function device(id: number, name: string, inputs: DeviceFields['inputs']) {
  return { _found: true, id, name, inputs, outputs: [] } as unknown as ExistingRecord<DeviceFields>;
}

function loadedDevices(...records: ExistingRecord<DeviceFields>[]) {
  return Object.assign(records, { _loaded: true }) as unknown as ReifiedQueryResult<DeviceFields>;
}

describe('MeasurementForm', () => {
  it('enumerates only the selected device inputs and clears the source when the device changes', async () => {
    const devices = loadedDevices(
      device(1, 'Temperature board', [
        { path: 'temperatures[0]', label: 'Temperature 1', value_type: 'number', units: '°C' },
        { path: 'temperatures[1]', label: 'Return air', value_type: 'number', units: '°C' },
      ]),
      device(2, 'Relay board', [
        { path: 'inputs[0]', label: 'Input 1', value_type: 'boolean', units: null },
      ]),
    );
    const create = vi.spyOn(Store.m(Measurement), 'create').mockReturnValue(undefined as never);

    render(<MeasurementForm diagram={diagram} editId={null} devices={devices} onClose={vi.fn()} />);

    const source = screen.getByLabelText('Source') as HTMLSelectElement;
    expect(source.disabled).toBe(true);
    expect(screen.queryByPlaceholderText('e.g. temperatures[4]')).toBeNull();

    fireEvent.change(screen.getByLabelText('Device'), { target: { value: '1' } });
    await waitFor(() => expect((screen.getByLabelText('Source') as HTMLSelectElement).disabled).toBe(false));
    expect(screen.getByRole('option', { name: 'Return air (°C)' })).toBeTruthy();
    fireEvent.change(source, { target: { value: 'temperatures[1]' } });
    expect((screen.getByLabelText('Units') as HTMLInputElement).value).toBe('°C');

    fireEvent.change(screen.getByLabelText('Device'), { target: { value: '2' } });
    expect(source.value).toBe('');
    expect(screen.queryByRole('option', { name: 'Return air (°C)' })).toBeNull();
    expect(screen.getByRole('option', { name: 'Input 1' })).toBeTruthy();

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'HeatCall' } });
    fireEvent.change(source, { target: { value: 'inputs[0]' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      logic_diagram_id: 9,
      name: 'HeatCall',
      device_id: 2,
      source_path: 'inputs[0]',
    }));
  });
});
