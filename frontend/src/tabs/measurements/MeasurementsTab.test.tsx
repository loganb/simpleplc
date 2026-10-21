// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import type { ExistingRecord, ReifiedQueryResult } from '../../lib/RestfulModelStore';
import TreeStore from '../../lib/TreeStore';
import { Measurement, Store } from '../../store';
import type { LogicDiagramFields, LogicInputFields, LogicInstanceFields, LogicOutputFields, MeasurementFields } from '../../store';
import type { AppUXTree } from '../../uxTree';
import { MeasurementsTab } from './MeasurementsTab';

type WithId = { id: number };
const loaded = <T extends WithId>(...records: T[]) => Object.assign(
  records.map(record => ({ ...record, _found: true })), { _loaded: true },
) as unknown as ReifiedQueryResult<T>;

beforeEach(() => { Store.models = {}; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('creates a Measurement attached to a computed output without a device binding', () => {
  const create = vi.spyOn(Store.m(Measurement), 'create').mockReturnValue(undefined as never);
  const ux = new TreeStore<AppUXTree>().subtree().subtree('measurements');
  render(<MeasurementsTab ux={ux} measurements={loaded<MeasurementFields>()}
    instances={loaded({ id: 2, name: 'Zone', logic_diagram_id: 1 } as ExistingRecord<LogicInstanceFields>)}
    diagrams={loaded({ id: 1, name: 'Control' } as ExistingRecord<LogicDiagramFields>)}
    inputs={loaded({ id: 10, name: 'Room', logic_diagram_id: 1 } as ExistingRecord<LogicInputFields>)}
    outputs={loaded({ id: 20, name: 'Demand', logic_diagram_id: 1 } as ExistingRecord<LogicOutputFields>)} onRefresh={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '+ New measurement' }));
  fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Demand trend' } });
  const instance = screen.getByLabelText('Instance') as HTMLSelectElement;
  instance.value = '2';
  fireEvent(instance, new Event('change', { bubbles: true }));
  const port = screen.getByLabelText('Port') as HTMLSelectElement;
  port.value = 'output:20';
  fireEvent(port, new Event('change', { bubbles: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(create).toHaveBeenCalledWith({
    name: 'Demand trend', units: null, logic_instance_id: 2,
    logic_input_id: null, logic_output_id: 20,
  });
});
