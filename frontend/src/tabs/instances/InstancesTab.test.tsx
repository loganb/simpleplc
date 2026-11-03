// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import type { ExistingRecord, ReifiedQueryResult } from '../../lib/RestfulModelStore';
import TreeStore from '../../lib/TreeStore';
import {
  LogicInputBinding,
  LogicInstance,
  LogicOutputBinding,
  Measurement,
  Store,
  Trace,
} from '../../store';
import type {
  DeviceFields,
  LogicDiagramFields,
  LogicInputBindingFields,
  LogicInputFields,
  LogicInstanceFields,
  LogicOutputBindingFields,
  LogicOutputFields,
  MeasurementFields,
} from '../../store';
import type { AppUXTree } from '../../uxTree';
import { InstancesTab } from './InstancesTab';

type WithId = { id: number };
const loaded = <T extends WithId>(...records: T[]) => Object.assign(
  records.map(record => ({ ...record, _found: true })),
  { _loaded: true },
) as unknown as ReifiedQueryResult<T>;

const diagram = { id: 1, name: 'Air Handler' } as ExistingRecord<LogicDiagramFields>;
const instance = {
  id: 2,
  logic_diagram_id: 1,
  name: 'North AHU',
  update_period: 30,
  output_enable: false,
} as ExistingRecord<LogicInstanceFields>;
const input = {
  id: 10,
  logic_diagram_id: 1,
  name: 'SupplyTemp',
  value_type: 'number',
  units: '°C',
} as ExistingRecord<LogicInputFields>;
const output = {
  id: 20,
  logic_diagram_id: 1,
  name: 'FanCall',
  value_type: 'boolean',
  units: null,
  input_expression: 'SupplyTemp > 22',
} as ExistingRecord<LogicOutputFields>;
const device = {
  id: 3,
  name: 'Relay board',
  inputs: [{ path: 'temperatures[0]', label: 'Supply probe', value_type: 'number', units: '°C' }],
  outputs: [{ channel: 1, label: 'Supply fan', value_type: 'boolean', units: null }],
} as ExistingRecord<DeviceFields>;

function renderTab({
  instances = loaded<LogicInstanceFields>(instance),
  inputBindings = loaded<LogicInputBindingFields>(),
  outputBindings = loaded<LogicOutputBindingFields>(),
  measurements = loaded<MeasurementFields>(),
}: {
  instances?: ReifiedQueryResult<LogicInstanceFields>;
  inputBindings?: ReifiedQueryResult<LogicInputBindingFields>;
  outputBindings?: ReifiedQueryResult<LogicOutputBindingFields>;
  measurements?: ReifiedQueryResult<MeasurementFields>;
} = {}) {
  const ux = new TreeStore<AppUXTree>().subtree().subtree('instances');
  return render(<InstancesTab
    ux={ux}
    instances={instances}
    diagrams={loaded(diagram)}
    inputs={loaded(input)}
    outputs={loaded(output)}
    inputBindings={inputBindings}
    outputBindings={outputBindings}
    devices={loaded(device)}
    measurements={measurements}
    onRefresh={vi.fn()}
  />);
}

beforeEach(() => { Store.models = {}; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('InstancesTab', () => {
  it('shows the selected diagram ports and connection completion', () => {
    renderTab();
    expect(screen.getAllByText('North AHU')).toHaveLength(2);
    expect(screen.getByText((_, element) => element?.tagName === 'SPAN' && element.textContent === 'Air Handler · 0 of 2 connected')).toBeTruthy();
    expect(screen.getByText('SupplyTemp')).toBeTruthy();
    expect(screen.getByText('FanCall')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Relay board · Supply probe' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Relay board · Supply fan' })).toBeTruthy();
  });

  it('live-patches the master output gate and computes the selected instance', () => {
    const patch = vi.spyOn(Store.m(LogicInstance), 'patch').mockReturnValue(undefined as never);
    const createTrace = vi.spyOn(Store.m(Trace), 'create').mockReturnValue(undefined as never);
    renderTab();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Outputs enabled' }));
    expect(patch).toHaveBeenCalledWith(2, { output_enable: true });
    fireEvent.click(screen.getByRole('button', { name: 'Compute now' }));
    expect(createTrace).toHaveBeenCalledWith({ logic_instance_id: 2 });
  });

  it('creates device input and output bindings from the enumerated catalogs', () => {
    const createInput = vi.spyOn(Store.m(LogicInputBinding), 'create').mockReturnValue(undefined as never);
    const createOutput = vi.spyOn(Store.m(LogicOutputBinding), 'create').mockReturnValue(undefined as never);
    renderTab();
    const selectors = screen.getAllByRole('combobox') as HTMLSelectElement[];
    selectors[1].value = 'device:3:temperatures[0]';
    fireEvent(selectors[1], new Event('change', { bubbles: true }));
    expect(createInput).toHaveBeenCalledWith({
      logic_instance_id: 2,
      logic_input_id: 10,
      source_kind: 'device_input',
      device_id: 3,
      source_path: 'temperatures[0]',
      fixed_value: null,
    });
    selectors[2].value = '3:1';
    fireEvent(selectors[2], new Event('change', { bubbles: true }));
    expect(createOutput).toHaveBeenCalledWith({
      logic_instance_id: 2,
      logic_output_id: 20,
      target_kind: 'device_output',
      device_id: 3,
      channel: 1,
      output_enable: true,
    });
  });

  it('shows the creation form and creates a disabled instance', async () => {
    const create = vi.spyOn(Store.m(LogicInstance), 'create').mockReturnValue(undefined as never);
    renderTab({ instances: loaded<LogicInstanceFields>() });
    fireEvent.click(screen.getByRole('button', { name: '+ New instance' }));
    const name = await waitFor(() => screen.getByLabelText('Instance name'));
    fireEvent.input(name, { target: { value: 'South AHU' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create instance' }));
    expect(create).toHaveBeenCalledWith({
      name: 'South AHU',
      logic_diagram_id: 1,
      update_period: 60,
      output_enable: false,
    });
  });
  it('selects and reassigns a measurement, and Escape cancels selection', () => {
    const patch = vi.spyOn(Store.m(Measurement), 'patch').mockReturnValue(undefined as never);
    const measurement = { id: 8, name: 'Supply history', logic_instance_id: null, source_type: null, source_id: null, source: null, preview_kind: null, preview: [] } as MeasurementFields;
    renderTab({ measurements: loaded(measurement) });
    fireEvent.click(screen.getByRole('button', { name: 'Attach measurement' }));
    fireEvent.click(screen.getByRole('button', { name: /Supply history/ }));
    fireEvent.click(screen.getByText('SupplyTemp'));
    expect(patch).toHaveBeenCalledWith(8, { logic_instance_id: 2, source_type: 'LogicInput', source_id: 10 });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByLabelText('SupplyTemp source')).toBeTruthy();
  });

  it('lists multiple attached measurements and detaches the selected one', () => {
    const patch = vi.spyOn(Store.m(Measurement), 'patch').mockReturnValue(undefined as never);
    const measurement = { id: 8, name: 'Supply history', logic_instance_id: 2, source_type: 'LogicInput', source_id: 10, source: null, preview_kind: null, preview: [] } as MeasurementFields;
    renderTab({ measurements: loaded(measurement, { ...measurement, id: 9, name: 'Second' }) });
    const trigger = screen.getByLabelText('Measurements for SupplyTemp');
    const popover = document.getElementById(trigger.getAttribute('popovertarget')!);
    expect(popover?.getAttribute('popover')).toBe('auto');
    fireEvent.click(trigger);
    expect(screen.getByText('Second')).toBeTruthy();
    // jsdom does not open native popovers when their invoker is clicked.
    fireEvent.click(popover!.querySelectorAll('button')[1]);
    expect(patch).toHaveBeenCalledWith(9, { logic_instance_id: null, source_type: null, source_id: null });
  });

  it('creates a named detached measurement and cancels the picker', () => {
    const create = vi.spyOn(Store.m(Measurement), 'create').mockReturnValue(undefined as never);
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Attach measurement' }));
    fireEvent.input(screen.getByLabelText('New measurement name'), { target: { value: '  Supply history  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create and select' }));
    expect(create).toHaveBeenCalledWith({ name: 'Supply history' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cancels selection when switching instances', async () => {
    const measurement = { id: 8, name: 'History', logic_instance_id: null, source_type: null, source_id: null, source: null, preview_kind: null, preview: [] } as MeasurementFields;
    renderTab({ measurements: loaded(measurement), instances: loaded(instance, { ...instance, id: 3, name: 'South AHU' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Attach measurement' }));
    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    expect(screen.getByRole('button', { name: 'Attach to SupplyTemp' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /South AHU/ }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Attach to SupplyTemp' })).toBeNull());
    expect(screen.getByLabelText('SupplyTemp source')).toBeTruthy();
  });

  it('keeps selection available after an attachment fails', async () => {
    vi.spyOn(Store.m(Measurement), 'patch').mockReturnValue({ seq: 42 });
    vi.spyOn(Store, 'txn_status').mockReturnValue({ seq: 42, status: 'error', id: 8 });
    const measurement = { id: 8, name: 'History', logic_instance_id: null, source_type: null, source_id: null, source: null, preview_kind: null, preview: [] } as MeasurementFields;
    renderTab({ measurements: loaded(measurement) });
    fireEvent.click(screen.getByRole('button', { name: 'Attach measurement' }));
    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Attach to FanCall' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not be saved'));
    expect(screen.getByRole('button', { name: 'Attach to FanCall' })).toBeTruthy();
  });

  it('enters selection mode after creation succeeds', async () => {
    vi.spyOn(Store.m(Measurement), 'create').mockReturnValue({ seq: 43 });
    vi.spyOn(Store, 'txn_status').mockReturnValue({ seq: 43, status: 'succeeded', id: 11 });
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Attach measurement' }));
    fireEvent.input(screen.getByLabelText('New measurement name'), { target: { value: 'New history' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create and select' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('New history'));
    expect(screen.getByRole('button', { name: 'Attach to SupplyTemp' })).toBeTruthy();
  });

  it('prevents choosing another measurement while creation is pending', () => {
    vi.spyOn(Store.m(Measurement), 'create').mockReturnValue({ seq: 44 });
    vi.spyOn(Store, 'txn_status').mockReturnValue(undefined);
    const measurement = { id: 8, name: 'Existing', logic_instance_id: null, source_type: null, source_id: null, source: null, preview_kind: null, preview: [] } as MeasurementFields;
    renderTab({ measurements: loaded(measurement) });
    fireEvent.click(screen.getByRole('button', { name: 'Attach measurement' }));
    fireEvent.input(screen.getByLabelText('New measurement name'), { target: { value: 'New' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create and select' }));
    expect((screen.getByRole('button', { name: /Existing/ }) as HTMLButtonElement).disabled).toBe(true);
  });

});
