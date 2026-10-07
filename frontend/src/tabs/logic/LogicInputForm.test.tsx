// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
vi.mock('../../components/useTxnStatus', () => ({
  useTxnStatus: () => ({ txnResult: undefined, saving: false }),
}));
import { LogicInputForm } from './LogicInputForm';
import { LogicInput, Store } from '../../store';
import type { LogicDiagramFields } from '../../store';
import type { ExistingRecord } from '../../lib/RestfulModelStore';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const diagram = {
  _found: true,
  id: 9,
  name: 'Boiler',
} as unknown as ExistingRecord<LogicDiagramFields>;

describe('LogicInputForm', () => {
  it('creates a typed diagram input without a hardware source', () => {
    const create = vi.spyOn(Store.m(LogicInput), 'create').mockReturnValue(undefined as never);
    render(<LogicInputForm diagram={diagram} editId={null} onClose={vi.fn()} />);
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'HeatCall' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'boolean' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      logic_diagram_id: 9,
      name: 'HeatCall',
      value_type: 'boolean',
      units: null,
    }));
  });
});
