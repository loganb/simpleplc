// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
vi.mock('../../components/useTxnStatus', () => ({
  useTxnStatus: () => ({ txnResult: undefined, saving: false }),
}));
import { LogicBlockForm } from './LogicTab';
import { LogicBlock, Store } from '../../store';
import type { LogicDiagramFields } from '../../store';
import type { ExistingRecord } from '../../lib/RestfulModelStore';

// LogicTab's imports render a preact/compat vnode, after which
// @testing-library/preact rewrites fireEvent.change into an input event that
// <select onChange> never hears. Dispatch a real change event instead.
function choose(select: HTMLElement, value: string) {
  (select as HTMLSelectElement).value = value;
  fireEvent(select, new Event('change', { bubbles: true }));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const diagram = { _found: true, id: 9, name: 'Boiler' } as unknown as ExistingRecord<LogicDiagramFields>;

describe('LogicBlockForm', () => {
  it('creates a timer counter with an input expression and active mode', () => {
    const create = vi.spyOn(Store.m(LogicBlock), 'create').mockReturnValue(undefined as never);
    render(<LogicBlockForm diagram={diagram} editId={null} blocks={[]} onClose={vi.fn()} />);

    choose(screen.getByLabelText('Type'), 'timer_counter');
    const inputs = screen.getByLabelText('Input Expressions') as HTMLTextAreaElement;
    expect(inputs.value).toBe('input = ');
    choose(screen.getByLabelText('Mode'), 'active_low');
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Fan_Timer' } });
    fireEvent.input(inputs, { target: { value: 'input = FanCall' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      block_type: 'timer_counter',
      input_expressions: { input: 'FanCall' },
      config: { mode: 'active_low' },
    }));
  });

  it('resets the mode when switching to a type that does not support it', () => {
    render(<LogicBlockForm diagram={diagram} editId={null} blocks={[]} onClose={vi.fn()} />);

    choose(screen.getByLabelText('Type'), 'latch');
    expect((screen.getByLabelText('Mode') as HTMLSelectElement).value).toBe('latch_high');
    choose(screen.getByLabelText('Type'), 'timer_counter');
    expect((screen.getByLabelText('Mode') as HTMLSelectElement).value).toBe('active_high');
  });

  it('creates an expression block with a value input and no mode', () => {
    const create = vi.spyOn(Store.m(LogicBlock), 'create').mockReturnValue(undefined as never);
    render(<LogicBlockForm diagram={diagram} editId={null} blocks={[]} onClose={vi.fn()} />);

    choose(screen.getByLabelText('Type'), 'expression');
    expect(screen.queryByLabelText('Mode')).toBeNull();
    const inputs = screen.getByLabelText('Input Expressions') as HTMLTextAreaElement;
    expect(inputs.value).toBe('value = ');
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Ready' } });
    fireEvent.input(inputs, { target: { value: 'value = HeatCall && IsHeat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      block_type: 'expression',
      input_expressions: { value: 'HeatCall && IsHeat' },
      config: {},
    }));
  });

  it('sends freeform notes with the block', () => {
    const create = vi.spyOn(Store.m(LogicBlock), 'create').mockReturnValue(undefined as never);
    render(<LogicBlockForm diagram={diagram} editId={null} blocks={[]} onClose={vi.fn()} />);

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'BOT_Ready' } });
    fireEvent.input(screen.getByLabelText('Input Expressions'), {
      target: { value: 'value = 145\nlow_limit = 130\nhigh_limit = 140' },
    });
    fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Boiler outlet ready.\nDeadband avoids cycling.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      notes: 'Boiler outlet ready.\nDeadband avoids cycling.',
    }));
  });
});
