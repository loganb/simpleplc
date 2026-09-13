import { beforeEach, describe, expect, it, vi } from 'vitest';
import RestfulModelStore from './RestfulModelStore';
import type { ModelDefinition } from './RestfulModelStore';

type ThingFields = {
  id: number;
  name: string;
};

const Thing: ModelDefinition<ThingFields> = {
  name: 'thing',
  inflections: { plural: 'things', title: 'Thing' },
  singleton: false,
};

function installBrowserTimers() {
  globalThis.window = {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  } as unknown as Window & typeof globalThis;

  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    return setTimeout(() => callback(Date.now()), 0) as unknown as number;
  }) as typeof requestAnimationFrame;
}

function makeStore(responseName = 'cached') {
  const axios = {
    get: vi.fn().mockResolvedValue({
      data: {
        query: [1],
        things: [{ id: 1, name: responseName }],
      },
    }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  };

  const store = new RestfulModelStore(axios as never);
  store.io_rate_limiter.currentRps = 1_000_000;

  return {
    axios,
    store,
  };
}

async function settleIo() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 5));
  await Promise.resolve();
}

describe('RestfulModelStore cache epochs', () => {
  beforeEach(() => {
    installBrowserTimers();
  });

  it('promotes previous-generation record hits into the current generation', async () => {
    const { store } = makeStore();
    const model = store.m(Thing);

    model.queryFor(null, {});
    await settleIo();

    store.advanceEpoch();
    model.fetch(1);

    const instances = (model as never as { instances: { current: Map<number, unknown>, previous: Map<number, unknown> } }).instances;
    expect(instances.current.has(1)).toBe(true);
    expect(instances.previous.has(1)).toBe(false);
  });

  it('drops records that do not move into the latest generation', async () => {
    const { axios, store } = makeStore();
    const model = store.m(Thing);

    model.queryFor(null, {});
    await settleIo();
    store.advanceEpoch();
    store.advanceEpoch();

    const record = model.fetch(1);
    await settleIo();

    expect(record._loading).toBe(true);
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  it('forces loaded queries to reload from the backend', async () => {
    const { axios, store } = makeStore();
    const model = store.m(Thing);

    model.queryFor(null, {});
    await settleIo();
    const forced = model.queryFor(null, {}, true);
    await settleIo();

    expect(forced._loading).toBe(true);
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  it('advances cache epochs immediately even when IO is queued', () => {
    const axios = {};
    const store = new RestfulModelStore(axios as never);
    const model = store.m(Thing);
    const epochAdvanced = vi.fn();
    store.addListener('cacheEpochAdvanced', epochAdvanced);

    store.io_queue.enqueue({
      io_type: 'query',
      run_time: Date.now() + 10_000,
      model,
      query: {
        name: null,
        args: null,
        query_version_at_start: 0,
        error_count: 0,
      },
    });
    store.advanceEpoch();

    expect(epochAdvanced).toHaveBeenCalledTimes(1);
  });

  it('can request cache epoch advancement on a configured timer', async () => {
    const { axios } = makeStore();
    const store = new RestfulModelStore(axios as never, { cacheEpochIntervalMs: 10 });
    const epochAdvanced = vi.fn();
    store.addListener('cacheEpochAdvanced', epochAdvanced);

    try {
      await new Promise((resolve) => setTimeout(resolve, 15));
      expect(epochAdvanced).toHaveBeenCalledTimes(1);
    } finally {
      store.stopCacheEpochTimer();
    }
  });

  it('records an error transaction when destroy fails', async () => {
    const { axios, store } = makeStore();
    axios.delete.mockRejectedValue({
      response: {
        data: {
          errors: { base: ['nope'] },
        },
      },
    });
    const model = store.m(Thing);

    const txn = model.destroy(1);
    expect(typeof txn.seq).toBe('number');
    await Promise.resolve();
    await Promise.resolve();

    expect(store.txn_status(txn)).toMatchObject({
      id: 1,
      status: 'error',
      errors: { base: ['nope'] },
    });
  });
});

describe('record versions', () => {
  it('repaints changed representations even when the row version is unchanged', () => {
    installBrowserTimers();
    const { store } = makeStore();
    const model = store.m(Thing);
    store.update_store({ data: { things: [{ id: 1, name: 'before', lock_version: 1 }] } });
    const before = model.fetch(1)._seq;
    store.update_store({ data: { things: [{ id: 1, name: 'after', lock_version: 1 }] } });
    expect(model.fetch(1)._seq).toBeGreaterThan(before);
  });
});
