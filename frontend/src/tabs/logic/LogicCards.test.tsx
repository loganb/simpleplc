// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/preact';
vi.mock('../../components/useTxnStatus', () => ({
  useTxnStatus: () => ({ txnResult: undefined, saving: false }),
}));
import { ColumnHeader, LogicBlockCard, LogicInputCard, LogicOutputCard } from './LogicTab';
import type { LogicBlockFields, LogicInputFields, LogicOutputFields } from '../../store';
import type { ExistingRecord } from '../../lib/RestfulModelStore';

afterEach(cleanup);

function block(fields: Partial<LogicBlockFields>) {
  return {
    _found: true,
    id: 1,
    logic_diagram_id: 9,
    stratum: 1,
    config: {},
    notes: '',
    ...fields,
  } as unknown as ExistingRecord<LogicBlockFields>;
}

describe('LogicInputCard', () => {
  it('shows only the diagram port definition', () => {
    const input = {
      _found: true,
      id: 3,
      logic_diagram_id: 9,
      name: 'ReturnAir',
      value_type: 'number',
      units: '°C',
    } as unknown as ExistingRecord<LogicInputFields>;

    const { container } = render(<LogicInputCard input={input} onEdit={vi.fn()} />);

    expect(container.textContent).toContain('number · °C');
    expect(container.textContent).not.toMatch(/Source:|Path:|Device/);
    expect(screen.getAllByText('ReturnAir')).toHaveLength(1);
  });
});

describe('LogicBlockCard', () => {
  it('shows an expression without runtime state', () => {
    const expression = block({
      name: 'FanCall',
      block_type: 'expression',
      input_expressions: { value: 'ReturnAir > 22' },
    } as Partial<LogicBlockFields>);

    const { container } = render(<LogicBlockCard block={expression} onEdit={vi.fn()} />);

    expect(container.textContent).toContain('ReturnAir > 22');
    expect(screen.getAllByText('FanCall')).toHaveLength(1);
    expect(screen.getByTitle('value = ReturnAir > 22')).toBeTruthy();
  });

  it('lists the configured inputs and drops runtime state', () => {
    const hysteresis = block({
      name: 'Heat',
      block_type: 'hysteresis',
      input_expressions: { value: 'ReturnAir', low_limit: '19', high_limit: '21' },
    } as Partial<LogicBlockFields>);

    const { container } = render(<LogicBlockCard block={hysteresis} onEdit={vi.fn()} />);

    expect(container.textContent).toContain('ReturnAir · 19 · 21');
    expect(container.textContent).not.toMatch(/state/);
    expect(screen.getByTitle(/value = ReturnAir/).title)
      .toBe('value = ReturnAir\nlow_limit = 19\nhigh_limit = 21');
  });
});

describe('LogicOutputCard', () => {
  it('shows the output definition and expression, not a hardware assignment', () => {
    const output = {
      _found: true,
      id: 4,
      logic_diagram_id: 9,
      name: 'Fan',
      value_type: 'boolean',
      units: null,
      input_expression: 'FanCall',
    } as unknown as ExistingRecord<LogicOutputFields>;
    const { container } = render(<LogicOutputCard output={output} onEdit={vi.fn()} />);
    expect(container.textContent).toContain('FanCall');
    expect(container.textContent).toContain('boolean');
    expect(container.textContent).not.toMatch(/Relay|channel|Desired|Effective/);
  });
});

describe('ColumnHeader', () => {
  it('renders the same row whether or not it has an action', () => {
    const { container } = render(
      <div>
        <ColumnHeader title="Stratum 1" />
        <ColumnHeader title="Outputs" action={<button>+ New</button>} />
      </div>,
    );
    const [plain, withAction] = Array.from(container.firstElementChild!.children);
    expect(plain.className).toBe(withAction.className);
    expect(plain.querySelector('h3')!.className).not.toMatch(/\bmb-/);
  });
});
