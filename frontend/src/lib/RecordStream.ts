import type RestfulModelStore from './RestfulModelStore';
import type { RecordInterest, RecordUpdate } from './RestfulModelStore';

export type StreamStatus = 'connecting' | 'live' | 'offline';
export interface CableSubscription { perform(action: string, data: object): boolean; unsubscribe(): void }
export interface CableConsumer {
  subscriptions: { create(params: { channel: string }, callbacks: {
    connected(): void; disconnected(): void; rejected(): void; received(message: unknown): void;
  }): CableSubscription };
  disconnect(): void;
}
const RESOURCES = new Set(['device', 'host_interface', 'logic_diagram', 'measurement', 'logic_block', 'output_block', 'trace']);
const key = (record: RecordInterest) => JSON.stringify([record.resource, record.id]);

export default class RecordStream {
  status: StreamStatus = 'connecting';
  private subscription: CableSubscription;
  private ready = false;
  private generation = 0;
  private acknowledged = new Set<string>();
  private pending?: { generation: number; records: RecordInterest[] };
  private timer?: ReturnType<typeof setTimeout>;
  private ackTimer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private interestListener;
  private focus = () => {
    this.store.reconcileRecords();
    this.schedule();
  };

  constructor(private store: RestfulModelStore, private consumer: CableConsumer) {
    this.subscription = consumer.subscriptions.create({ channel: 'ModelStoreChannel' }, {
      connected: () => {
        this.ready = true;
        this.resetInterests();
        this.schedule();
      },
      disconnected: () => this.disconnected(),
      rejected: () => this.disconnected(),
      received: message => this.receive(message),
    });
    this.interestListener = store.addListener('recordInterestsChanged', () => this.schedule());
    window.addEventListener('focus', this.focus);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.ackTimer);
    this.interestListener.remove();
    window.removeEventListener('focus', this.focus);
    this.subscription.unsubscribe();
    this.consumer.disconnect();
  }

  private setStatus(status: StreamStatus) {
    this.status = status;
    this.store.emit('streamStatus', status);
  }

  private resetInterests() {
    this.pending = undefined;
    this.acknowledged.clear();
    clearTimeout(this.ackTimer);
  }

  private disconnected() {
    this.ready = false;
    this.resetInterests();
    this.setStatus('offline');
  }

  private schedule() {
    if(this.stopped || this.timer !== undefined) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.sendInterests();
    }, 0);
  }

  private sendInterests() {
    if(!this.ready || this.pending) return;
    const records = this.store.recordInterests().filter(record => RESOURCES.has(record.resource));
    const keys = new Set(records.map(key));
    if(this.status === 'live' && keys.size === this.acknowledged.size &&
      [...keys].every(value => this.acknowledged.has(value))) return;
    if(records.length > 10_000) {
      this.setStatus('offline'); // Periodic HTTP refresh remains available.
      return;
    }
    const generation = ++this.generation;
    this.pending = { generation, records };
    if(!this.subscription.perform('interests', { generation, records })) {
      this.pending = undefined;
      this.setStatus('offline');
      return;
    }
    this.ackTimer = setTimeout(() => {
      this.pending = undefined;
      this.setStatus('offline');
      this.schedule();
    }, 5000);
  }

  private receive(value: unknown) {
    if(this.stopped || !value || typeof value !== 'object') return;
    const message = value as { type?: string; generation?: number; records?: RecordUpdate[] };
    if(message.type === 'stream_unavailable') {
      this.disconnected();
    } else if(message.type === 'resync_required') {
      this.ready = true;
      this.resetInterests();
      this.setStatus('connecting');
      this.schedule();
    } else if(message.type === 'interests_ack' && this.ready && this.pending && message.generation === this.pending.generation) {
      const records = this.pending.records;
      const added = records.filter(record => !this.acknowledged.has(key(record)));
      this.acknowledged = new Set(records.map(key));
      this.pending = undefined;
      clearTimeout(this.ackTimer);
      this.store.reconcileRecords(added);
      this.setStatus('live');
      this.schedule(); // Interests may have changed while this frame was in flight.
    } else if(message.type === 'record_updates' && this.ready && Array.isArray(message.records)) {
      this.store.applyRecordUpdates(message.records);
    } else if(message.type === 'protocol_error') {
      this.disconnected();
    }
  }
}
