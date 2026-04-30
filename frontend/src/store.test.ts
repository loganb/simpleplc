import { describe, expect, it, vi } from 'vitest';
import RestfulModelStore from './lib/RestfulModelStore';

async function settleIo() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

describe('PLC store model definitions', () => {
  it('creates traces through the RestfulModelStore wire format and stores expounded data', async () => {
    globalThis.window = {
      setInterval,
      clearInterval,
    } as unknown as Window & typeof globalThis;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      return setTimeout(() => callback(Date.now()), 0) as unknown as number;
    }) as typeof requestAnimationFrame;
    const { Datum, Trace } = await import('./store');
    const axios = {
      post: vi.fn().mockResolvedValue({
        data: {
          id: 7,
          traces: [{
            id: 7,
            logic_diagram_id: 3,
            recorded_at: '2026-04-30T10:00:00Z',
            created_at: '2026-04-30T10:00:00Z',
            updated_at: '2026-04-30T10:00:00Z',
          }],
          data: [{
            id: 11,
            trace_id: 7,
            source_type: 'Measurement',
            source_id: 5,
            value: 42,
            state: {},
            input_values: {},
            recorded_at: '2026-04-30T10:00:00Z',
          }],
        },
      }),
    };
    const store = new RestfulModelStore(axios as never);
    store.m(Trace);
    const dataModel = store.m(Datum);

    store.m(Trace).create({ logic_diagram_id: 3 });
    await settleIo();

    expect(axios.post).toHaveBeenCalledWith('/traces.json', { trace: { logic_diagram_id: 3 } }, {});
    expect(dataModel.fetch(11)._found).toBe(true);
  });
});
