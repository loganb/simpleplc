import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'fbemitter';
import RecordStream from './RecordStream';
import type { CableConsumer } from './RecordStream';
import type RestfulModelStore from './RestfulModelStore';

afterEach(() => vi.useRealTimers());

function setup() {
  vi.useFakeTimers();
  globalThis.window = { addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as Window & typeof globalThis;
  const store = Object.assign(new EventEmitter(), {
    recordInterests: vi.fn(() => [{ resource: 'device', id: 1 }]),
    reconcileRecords: vi.fn(), applyRecordUpdates: vi.fn(),
  });
  let callbacks!: Parameters<CableConsumer['subscriptions']['create']>[1];
  const subscription = { perform: vi.fn((_action: string, _data: { generation: number; records: object[] }) => true), unsubscribe: vi.fn() };
  const consumer = {
    subscriptions: { create: vi.fn((_params, handlers) => { callbacks = handlers; return subscription; }) },
    disconnect: vi.fn(),
  } as CableConsumer;
  const stream = new RecordStream(store as unknown as RestfulModelStore, consumer);
  return { stream, store, subscription, callbacks };
}

describe('record stream', () => {
  it('reconciles only after interest acknowledgement and handles additions during handoff', () => {
    const { stream, store, subscription, callbacks } = setup();
    callbacks.connected();
    vi.advanceTimersByTime(1);
    expect(store.reconcileRecords).not.toHaveBeenCalled();
    const generation = subscription.perform.mock.calls[0][1].generation;
    store.recordInterests.mockReturnValue([{ resource: 'device', id: 1 }, { resource: 'device', id: 2 }]);
    store.emit('recordInterestsChanged');
    callbacks.received({ type: 'interests_ack', generation });
    expect(store.reconcileRecords).toHaveBeenLastCalledWith([{ resource: 'device', id: 1 }]);
    vi.advanceTimersByTime(1);
    const next = subscription.perform.mock.calls[1][1].generation;
    callbacks.received({ type: 'interests_ack', generation: next });
    expect(store.reconcileRecords).toHaveBeenLastCalledWith([{ resource: 'device', id: 2 }]);
    expect(stream.status).toBe('live');
    stream.stop();
  });

  it('reconciles all known records after PG recovery without a socket reconnect', () => {
    const { stream, store, subscription, callbacks } = setup();
    callbacks.connected();
    vi.advanceTimersByTime(1);
    callbacks.received({ type: 'interests_ack', generation: subscription.perform.mock.calls[0][1].generation });
    store.reconcileRecords.mockClear();
    callbacks.received({ type: 'stream_unavailable' });
    expect(stream.status).toBe('offline');
    callbacks.received({ type: 'resync_required' });
    vi.advanceTimersByTime(1);
    callbacks.received({ type: 'interests_ack', generation: subscription.perform.mock.calls[1][1].generation });
    expect(store.reconcileRecords).toHaveBeenCalledWith([{ resource: 'device', id: 1 }]);
    stream.stop();
  });

  it('ignores old acknowledgements after a socket reconnect and cleans up', () => {
    const { stream, store, subscription, callbacks } = setup();
    callbacks.connected();
    vi.advanceTimersByTime(1);
    const old = subscription.perform.mock.calls[0][1].generation;
    callbacks.disconnected();
    callbacks.connected();
    vi.advanceTimersByTime(1);
    callbacks.received({ type: 'interests_ack', generation: old });
    expect(store.reconcileRecords).not.toHaveBeenCalled();
    stream.stop();
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });
});
