// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/preact';
vi.mock('../../components/useTxnStatus', () => ({
  useTxnStatus: () => ({ txnResult: undefined, saving: false }),
}));
import { ColumnHeader, LogicBlockCard, MeasurementCard, OutputBlockCard } from './LogicTab';
import type { DeviceFields, LogicBlockFields, MeasurementFields, OutputBlockFields } from '../../store';
import type { ExistingRecord, ReifiedQueryResult } from '../../lib/RestfulModelStore';

afterEach(cleanup);

function block(fields: Partial<LogicBlockFields>) {
  return {
    _found: true,
    id: 1,
    logic_diagram_id: 9,
    stratum: 1,
    config: {},
    notes: '',
    latest_state: null,
    ...fields,
  } as unknown as ExistingRecord<LogicBlockFields>;
}

describe('MeasurementCard', () => {
  it('shows no source, path, or repeated name', () => {
    const measurement = {
      _found: true,
      id: 3,
      name: 'ReturnAir',
      mode: 'acquisition',
      device_id: 1,
      source_path: 'temperatures[1]',
      units: '°C',
      simulation_value: null,
      latest_value: 21.5,
    } as unknown as ExistingRecord<MeasurementFields>;

    const { container } = render(<MeasurementCard measurement={measurement} onEdit={vi.fn()} />);

    expect(container.textContent).not.toMatch(/Source:|Path:|temperatures\[1\]/);
    expect(screen.getAllByText('ReturnAir')).toHaveLength(1);
  });
});

describe('LogicBlockCard', () => {
  it('shows an expression only as a hover on the output', () => {
    const expression = block({
      name: 'FanCall',
      block_type: 'expression',
      input_expressions: { value: 'ReturnAir > 22' },
      output: true,
      value: true,
    } as Partial<LogicBlockFields>);

    const { container } = render(<LogicBlockCard block={expression} onEdit={vi.fn()} />);

    expect(container.textContent).not.toMatch(/value|ReturnAir/);
    expect(screen.getAllByText('FanCall')).toHaveLength(1);
    expect(screen.getByText('Output').parentElement!.title).toBe('ReturnAir > 22');
  });

  it('lists every input expression in the output hover and drops the debug footer', () => {
    const hysteresis = block({
      name: 'Heat',
      block_type: 'hysteresis',
      input_expressions: { value: 'ReturnAir', low_limit: '19', high_limit: '21' },
      output: false,
      value: 20,
      low_limit: 19,
      high_limit: 21,
      latest_state: { on: false },
    } as Partial<LogicBlockFields>);

    const { container } = render(<LogicBlockCard block={hysteresis} onEdit={vi.fn()} />);

    expect(container.textContent).not.toMatch(/low_limit|state|ReturnAir/);
    expect(screen.getByText('Output').parentElement!.title)
      .toBe('value = ReturnAir\nlow_limit = 19\nhigh_limit = 21');
  });
});

describe('OutputBlockCard', () => {
  const devices = Object.assign([{
    _found: true, id: 1, name: 'Relay board', inputs: [], outputs: [{ channel: 1, label: 'Relay 1' }],
  }], { _loaded: true }) as unknown as ReifiedQueryResult<DeviceFields>;

  function renderOutput(fields: Partial<OutputBlockFields>) {
    const output = {
      _found: true,
      id: 4,
      logic_diagram_id: 9,
      name: 'Fan',
      device_id: 1,
      channel: 1,
      input_expression: 'FanCall',
      output_enable: true,
      desired_output: true,
      effective_output: null,
      write_pending: false,
      latest_state: { write_skipped_reason: 'diagram_output_disabled' },
      ...fields,
    } as unknown as ExistingRecord<OutputBlockFields>;
    const view = render(<OutputBlockCard output={output} devices={devices} onEdit={vi.fn()} />);
    return { ...view, box: screen.getByText('Output').parentElement! };
  }

  it('shows one Output box with the expression as its hover and no status lines', () => {
    const { container, box } = renderOutput({});

    expect(container.textContent).not.toMatch(/Desired|Effective|FanCall|Pending|Skipped/);
    expect(box.title).toBe('FanCall');
    expect(box.textContent).toContain('true');
  });

  it('is green when driving true, ignoring the diagram-level toggle', () => {
    const { box } = renderOutput({ output_enable: true, desired_output: true, effective_output: null });
    expect(box.className).toMatch(/\bbg-ok-bg\b/);
    expect(box.className).not.toMatch(/opacity/);
  });

  it('is plain when driving false', () => {
    const { box } = renderOutput({ output_enable: true, desired_output: false });
    expect(box.className).not.toMatch(/\bbg-ok-bg\b|opacity/);
    expect(box.textContent).toContain('false');
  });

  it('is greyed out when its Output Enable is off, still showing the computed value', () => {
    const { box } = renderOutput({ output_enable: false, desired_output: true });
    expect(box.className).toMatch(/opacity-50/);
    expect(box.className).not.toMatch(/\bbg-ok-bg\b/);
    expect(box.textContent).toContain('true');
  });

  it('is greyed out when the computed value is unknown', () => {
    const { box } = renderOutput({ output_enable: true, desired_output: null });
    expect(box.className).toMatch(/opacity-50/);
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
