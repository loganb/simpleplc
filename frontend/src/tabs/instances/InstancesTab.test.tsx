// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import type { ExistingRecord, ReifiedQueryResult } from '../../lib/RestfulModelStore';
import TreeStore from '../../lib/TreeStore';
import {
  LogicInputBinding,
  LogicInstance,
  LogicOutputBinding,
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
}: {
  instances?: ReifiedQueryResult<LogicInstanceFields>;
  inputBindings?: ReifiedQueryResult<LogicInputBindingFields>;
  outputBindings?: ReifiedQueryResult<LogicOutputBindingFields>;
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
});
