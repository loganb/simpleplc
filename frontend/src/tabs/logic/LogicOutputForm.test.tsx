// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
vi.mock('../../components/useTxnStatus', () => ({
  useTxnStatus: () => ({ txnResult: undefined, saving: false }),
}));
import { LogicOutputForm } from './LogicOutputForm';
import { LogicOutput, Store } from '../../store';
import type { LogicDiagramFields } from '../../store';
import type { ExistingRecord } from '../../lib/RestfulModelStore';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const diagram = { _found: true, id: 9, name: 'Boiler' } as unknown as ExistingRecord<LogicDiagramFields>;
describe('LogicOutputForm', () => {
  it('creates a typed diagram output without a hardware target', () => {
    const create = vi.spyOn(Store.m(LogicOutput), 'create').mockReturnValue(undefined as never);
    render(<LogicOutputForm diagram={diagram} editId={null} onClose={vi.fn()} />);
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'RunPump' } });
    fireEvent.input(screen.getByLabelText('Input expression'), { target: { value: 'HeatCall' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      logic_diagram_id: 9,
      name: 'RunPump',
      value_type: 'boolean',
      input_expression: 'HeatCall',
    }));
  });
});
