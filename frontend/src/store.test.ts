import { describe, expect, it, vi } from 'vitest';
import RestfulModelStore from './lib/RestfulModelStore';

async function settleIo() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

describe('PLC store model definitions', () => {
  it('creates traces through the RestfulModelStore wire format and stores results', async () => {
    globalThis.window = {
      setInterval,
      clearInterval,
    } as unknown as Window & typeof globalThis;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      return setTimeout(() => callback(Date.now()), 0) as unknown as number;
    }) as typeof requestAnimationFrame;
    const { Trace, developmentApiBase } = await import('./store');
    expect(developmentApiBase('http://executivealpha.hamlet-vibes.ts.net:5174/')).toBe(
      'http://executivealpha.hamlet-vibes.ts.net:3000',
    );
    const axios = {
      post: vi.fn().mockResolvedValue({
        data: {
          id: 7,
          traces: [{
            id: 7,
            logic_instance_id: 3,
            results: {
              schema_version: 2,
              logic_inputs: {
                5: {
                  id: 5,
                  name: 'Temp',
                  value: 42,
                  state: {},
                  input_values: {},
                  recorded_at: '2026-04-30T10:00:00Z',
                },
              },
              logic_blocks: {},
              logic_outputs: {},
            },
            recorded_at: '2026-04-30T10:00:00Z',
            created_at: '2026-04-30T10:00:00Z',
            updated_at: '2026-04-30T10:00:00Z',
          }],
        },
      }),
    };
    const store = new RestfulModelStore(axios as never);
    store.m(Trace);

    store.m(Trace).create({ logic_instance_id: 3 });
    await settleIo();

    expect(axios.post).toHaveBeenCalledWith('/traces.json', { trace: { logic_instance_id: 3 } }, {});
    const trace = store.m(Trace).fetch(7);
    expect(trace._found).toBe(true);
    if (!trace._found) throw new Error('trace should be found');
    expect(trace.results.logic_inputs[5].value).toBe(42);
  });

  it('queries read-only trace rollups by instance and time range', async () => {
    globalThis.window = {
      setInterval,
      clearInterval,
      setTimeout,
      clearTimeout,
    } as unknown as Window & typeof globalThis;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      return setTimeout(() => callback(Date.now()), 0) as unknown as number;
    }) as typeof requestAnimationFrame;
    const { TraceRollup } = await import('./store');
    const axios = {
      get: vi.fn().mockResolvedValue({
        data: {
          query: [4],
          trace_rollups: [{
            id: 4,
            logic_instance_id: 3,
            bucket_start: '2026-10-13T12:00:00Z',
            sample_count: 60,
            results: {
              schema_version: 1,
              logic_inputs: { 5: { null_count: 0, count: 60, min: 1, max: 2, mean: 1.5, last: 2 } },
              logic_blocks: {},
              logic_outputs: {},
            },
          }],
        },
      }),
    };
    const store = new RestfulModelStore(axios as never);
    store.m(TraceRollup);

    store.m(TraceRollup).queryFor(null, { logic_instance_id: 3, since: '2026-10-13T12:00:00Z' });
    await settleIo();

    const url = decodeURIComponent(axios.get.mock.calls[0][0] as string);
    expect(url).toContain('/trace_rollups.json');
    expect(url).toContain('"logic_instance_id":3');
    expect(url).toContain('"since":"2026-10-13T12:00:00Z"');
  });
});
