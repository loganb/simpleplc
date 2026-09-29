import {EventEmitter} from 'fbemitter';
import RateLimiter from './RateLimiter';

import * as Collections from 'typescript-collections'
import { AxiosInstance } from 'axios';

export type ServerRecordId = number | string;
export type NewRecordId = { seq: number};
export type RecordId<T extends ServerRecordId = ServerRecordId> = NewRecordId | T;

export interface Txn {
  readonly record?: object,
  readonly seq?: number
}

export interface TxnResult {
  readonly status: 'succeeded' | 'error',
  readonly seq: number,
  readonly id: RecordId | null,
  readonly errors?: unknown,
  readonly httpStatus?: number  // Absent on success and when no response arrived (network error)
}

//
export interface RecordInterest { resource: string; id: ServerRecordId }
export interface RecordUpdate extends RecordInterest { lock_version: number }

interface RecordFlags {
  readonly _stale?: boolean,
  readonly _invalidated_at?: number,
  readonly _required_version?: number,
  readonly _response_order?: number,
  readonly _loading: boolean,
  readonly _loaded: boolean,
  readonly _found: boolean,
  readonly _seq: number,
  readonly _new?: boolean, 
  readonly _error?: number, 
  readonly lock_version?: number,
  readonly id: RecordId
}
export type Identifiable = {id: ServerRecordId};

/*
 * ExtantRecord<T> is guaranteed to have an 'id', but isn't necessarily found yet
 *
 */
export type ExtantRecord<T extends Identifiable> = RecordFlags & {id: RecordId<T['id']>}; //Guaranteed to have an id, but it may be a local placeholder

/*
 * A record that isn't found, so it has no data
 */
type NotFoundRecord<T extends Identifiable> = T extends unknown ? (ExtantRecord<T> & {_found: false}) : never;
/*
 * A record that is found, so it is guaranteed to have its fields
 *
 */
export type FoundRecord<T extends Identifiable> = T extends unknown ? ((ExtantRecord<T> & {_found: true}) & Omit<T,'id'>) : never;
export type ModelRecord<T extends Identifiable> = NotFoundRecord<T> | FoundRecord<T>;
export type LoadingRecord<T extends Identifiable> = RecordFlags & {_loading: true, _found: false, id: T['id']};
export type ExistingRecord<T extends Identifiable> = FoundRecord<T> & { _new: false | undefined, id: T['id'] };

/*
 * On New Records, the id column is an opaque object, and all fields are optional. 
 */
export type NewRecord<T extends Identifiable> = Omit<RecordFlags, 'id'> & Partial<Omit<T,'id'>> & {id: NewRecordId, _new: true}; //These are returned from new()
// Type for what is patchable by the patch method
export type PatchRecord<T> = Partial<Omit<T,'id'>>;

//Array of actual records
export interface ReifiedQueryResult<T extends Identifiable, MD = unknown, RecordType = ModelRecord<T>> extends Array<RecordType> {
  readonly _loading: boolean,
  readonly _loaded: boolean,
  readonly _found: boolean,
  readonly metadata?: MD
}
export interface LoadingQueryResult<T extends Identifiable> extends Array<ModelRecord<T>> {
  readonly _loading: true,
  readonly _found: false,
  readonly _loaded: false
}

//Array of the ids that come back
interface QueryResult extends Array<RecordId> {
  readonly _loading: boolean,
  readonly _loaded: boolean,
  readonly _found: boolean,
  readonly _query_version: number,
  readonly _seq?: number,
  readonly _error?: number,
  readonly metadata?: unknown,
}

class TwoGenerationCache<K,V> {
  current = new Map<K,V>();
  previous = new Map<K,V>();

  get(key: K) : V | undefined {
    const currentValue = this.current.get(key);
    if(currentValue) return currentValue;

    const previousValue = this.previous.get(key);
    if(previousValue) {
      this.current.set(key, previousValue);
      this.previous.delete(key);
    }
    return previousValue;
  }

  peek(key: K): V | undefined {
    return this.current.get(key) ?? this.previous.get(key);
  }

  entries() {
    return new Map([...this.previous, ...this.current]).entries();
  }

  // Background traffic must not promote an unused previous-generation record.
  replace(key: K, value: V) {
    if(this.current.has(key)) this.current.set(key, value);
    else if(this.previous.has(key)) this.previous.set(key, value);
  }

  has(key: K) {
    return this.get(key) !== undefined;
  }

  set(key: K, value: V) {
    this.current.set(key, value);
    return this;
  }

  delete(key: K) {
    const deletedCurrent = this.current.delete(key);
    const deletedPrevious = this.previous.delete(key);
    return deletedCurrent || deletedPrevious;
  }

  clear() {
    this.current.clear();
    this.previous.clear();
  }

  advance() {
    this.previous = this.current;
    this.current = new Map();
  }
}

export type IoOp = {
  run_time: number,
  model: SingletonModel<Identifiable> | Model<Identifiable>
} & ({
  io_type: 'fetch',
  record: ExtantRecord<Identifiable>,
} | {
  io_type: 'query',
  query: {
    name: string | null,
    args: string | null,
    query_version_at_start: number,
    error_count: number
  }
});

/*
 * Defines a model on the server-side. <T> is the runtime fields on
 * the models. 
 * 
 */
export interface _ModelDefinition<T extends Identifiable> {
  /** Phantom field — carries the record type T through the type system. Never set at runtime. */
  readonly __recordType?: T,
  name: string,
  inflections: {
    title: string,
    plural: string
  },
  singleton: boolean,
  server_side_new?: boolean // Send new records to the server, result pulls back more data
}
export type SingletonModelDefinition<T extends Identifiable> = _ModelDefinition<T> & {singleton: true};
export type ModelDefinition<T extends Identifiable> = _ModelDefinition<T> & {singleton: false};

class BaseModel<T extends Identifiable> {
  readonly name: string;
  readonly inflections: {
    title: string,
    plural: string
  };
  readonly server_side_new: boolean;

  queries: Map<string | null, TwoGenerationCache<string | null,QueryResult>>;
  instances: TwoGenerationCache<RecordId,RecordFlags>;
  query_version: number;

  store: RestfulModelStore;

  constructor(store: RestfulModelStore, definition: _ModelDefinition<T>) {
    this.store = store;
    this.name = definition.name;
    this.inflections = definition.inflections;
    this.instances = new TwoGenerationCache();
    this.queries   = new Map();
    this.query_version = 0; //Increments when model queries may have stale membership
    this.server_side_new = !!definition.server_side_new;
  }
}

class Model<T extends Identifiable> extends BaseModel<T> {
  public readonly singleton = false;

  public fetch(id: T['id'], force?: boolean) : ModelRecord<T>;
  public fetch(id: NewRecordId, force?: boolean) : ModelRecord<T> | NewRecord<T>;
  public fetch(id: RecordId<T['id']>, force = false) : ModelRecord<T> | NewRecord<T> {
    return typeof id === 'object'
      ? this.store.fetch(this, id, force)
      : this.store.fetch(this, id as T['id'], force);
  }

  public fetchMany(ids: T['id'][], force = false) : ReifiedQueryResult<T> {
    return this.store.fetchMulti(this,ids,force);
  }

  public queryFor(name: string | null, arg: Record<string, unknown> | null, force = false) : ReifiedQueryResult<T> {
    return this.store.queryFor(this, name, arg, force);
  };
  public destroy(id: RecordId<T['id']>) : Txn {
    return this.store.destroy(this, id);
  }

  public create(record: Partial<T>) : Txn {
    return this.store.create(this, record);
  }

  public patch(id: RecordId<T['id']>, changes: Partial<T>) : Txn {
    return this.store.patch(this, id, changes);
  }

  public new(fields: Partial<Omit<T,"id">>) : NewRecord<T> {
    return this.store.new(this, fields);
  }
}

//TODO: The name is used as a standin for the id since we don't have one for singletons. Not sure what the best way is to handle this. 
class SingletonModel<T extends Identifiable> extends BaseModel<T> {
  public readonly singleton = true;

  fetch(force = false) : ModelRecord<T> {
    return this.store.fetch(this, this.name as T['id'], force) as ModelRecord<T>;
  }

  destroy() : Txn {
    return this.store.destroy(this, this.name);
  }

  create(record: Partial<T>) : Txn {
    return this.store.create(this, record);
  }

  patch(changes: Partial<T>) : Txn {
    return this.store.patch(this, this.name, changes);
  }
}

// type Json = string | number | boolean | null | Json[] | { [key: string]: Json };``
export interface RestfulModelStoreOptions {
  cacheEpochIntervalMs?: number;
}

/*
 * axios - An instance of axios configured with a base_url
 * inflections - {
 *   plural: 'drawer_adjustments',
 *   title: "DrawerAdjustment"
 * }
 *
 *
 */
export default class RestfulModelStore extends EventEmitter {
  axios: AxiosInstance;
  models: {[modelName: string]: Model<Identifiable>|SingletonModel<Identifiable>};
  txns: WeakMap<Txn,TxnResult>;
  news: WeakMap<NewRecordId, NewRecord<Identifiable> | ServerRecordId>;
  seq: number;
  is_dirty: boolean = false;

  io_queue   = new Collections.PriorityQueue<IoOp>((a,b) => (a.run_time - b.run_time));
  io_timeout?: number;
  io_rate_limiter = new RateLimiter({initialRps: 10});
  cache_epoch_interval?: number;

  constructor(axios: AxiosInstance, options: RestfulModelStoreOptions = {}) {
    super();
    this.axios  = axios;
    this.models = {};
    this.txns   = new WeakMap<Txn, TxnResult>();
    //Mapping of placeholder ids -> (new record | id of created record), particularly useful after save
    this.news   = new WeakMap();
    this.seq    = 0; //Increments with every piece of new data

    if(options.cacheEpochIntervalMs) {
      this.cache_epoch_interval = window.setInterval(() => {
        this.advanceEpoch();
      }, options.cacheEpochIntervalMs);
    }
  }


  private requestClock = 0;
  private pendingRecords = new Set<string>();

  private recordKey(resource: string, id: RecordId) {
    return JSON.stringify([resource, id]);
  }

  recordInterests(): RecordInterest[] {
    const interests: RecordInterest[] = [];
    for(const model of Object.values(this.models)) {
      for(const [id] of model.instances.entries()) {
        if(typeof id !== 'object') interests.push({ resource: model.name, id });
      }
    }
    return interests;
  }

  applyRecordUpdates(updates: RecordUpdate[]) {
    for(const update of updates) {
      const model = this.models[update.resource];
      const record = model?.instances.peek(update.id);
      if(!record || !Number.isSafeInteger(update.lock_version) || update.lock_version < 0) continue;
      if(update.lock_version <= Math.max(record.lock_version ?? -1, record._required_version ?? -1)) continue;
      model.instances.replace(update.id, {
        ...record, _stale: true, _required_version: update.lock_version,
        _invalidated_at: ++this.requestClock, _seq: this.seq++,
      });
    }
    this.soil();
  }

  reconcileRecords(interests: RecordInterest[] = this.recordInterests()) {
    for(const { resource, id } of interests) {
      const model = this.models[resource];
      const record = model?.instances.peek(id);
      if(record) model.instances.replace(id, {
        ...record, _stale: true, _invalidated_at: ++this.requestClock, _seq: this.seq++,
      });
    }
    this.soil();
  }

  /*
   * Used to track the current state of the data store
   */
  getSequence() {
    return this.seq;
  }

  advanceEpoch() {
    for(const model of Object.values(this.models)) {
      model.instances.advance();
      for(const queryCache of model.queries.values()) {
        queryCache.advance();
      }
    }
    this.seq++;
    this.emit('cacheEpochAdvanced');
    this.emit('recordInterestsChanged');
    this.soil();
  }

  stopCacheEpochTimer() {
    if(this.cache_epoch_interval) {
      window.clearInterval(this.cache_epoch_interval);
      this.cache_epoch_interval = undefined;
    }
  }

  /*
   * Returns a Model object for the given ModelDefinition. Use:
   *
   * ```
   * import {MyModel} from 'my_model_definitions';
   * 
   * let my_record = data_store.m(MyModel).fetch(id);
   * ```
   * 
   */
  m<T extends Identifiable>(definition : ModelDefinition<T>) : Model<T> {
    const models = this.models;

    return models[definition.name] as Model<T> || (models[definition.name] = new Model<T>(this,definition));
  }

  /*
   * Returns a SingletonModel object for the given ModelDefinition
   */
  s<T extends Identifiable>(definition : SingletonModelDefinition<T>) : SingletonModel<T> {
    const models = this.models;
    return models[definition.name] as SingletonModel<T> ||
      (models[definition.name] = new SingletonModel<T>(this,definition))
  }

  fetchMulti<T extends Identifiable>(model: Model<T>, ids: T['id'][], force: boolean = false) {
    const records = ids.map((id) => (this.fetch(model, id, force) as ModelRecord<T>));
    const results: ReifiedQueryResult<T> = Object.assign(
      records,
      {
        _loading: records.some((r)  => (r._loading)),
        _found: records.some((r)  => (r._found)),
        _loaded: records.every((r) => (r._loaded))
      });
    return results;
  }

  // Returns a model for the given id
  fetch<T extends Identifiable>(model: Model<T> | SingletonModel<T>, id: T['id'], force?: boolean) : ModelRecord<T>;
  fetch<T extends Identifiable>(model: Model<T> | SingletonModel<T>, id: NewRecordId, force?: boolean) : ModelRecord<T> | NewRecord<T>;
  fetch<T extends Identifiable>(model: Model<T> | SingletonModel<T>, id: RecordId<T['id']>, force: boolean = false) : ModelRecord<T> | NewRecord<T> {
    if((typeof(id) === 'undefined' || id == null) && !model.singleton) {
      throw new Error("Whoops!");
    }
    let exists = true;
    let record = this.fetchNewRecord(model, id) || model.instances.get(id) as ModelRecord<T> | undefined || {
      _loading: true, _loaded: exists = false, _found: false, _seq: this.seq++, id,
    } as ModelRecord<T>;
    if(!exists) {
      model.instances.set(id, record);
      this.emit('recordInterestsChanged');
    }
    if(!record._new && (!exists || record._stale || force)) {
      const key = this.recordKey(model.name, id);
      if(!this.pendingRecords.has(key)) {
        record = { ...record, _loading: true, _stale: true, _seq: this.seq++ };
        model.instances.set(id, record);
        this.pendingRecords.add(key);
        this.io_queue.enqueue({ io_type: 'fetch', model, run_time: 0, record });
        this.schedule_queue_processing();
        this.soil();
      }
    }
    this.emit('loadSequence', record._seq);
    return record;

  }


  /*
   * Returns a txn object the represents the outstanding transaction
   * The txn object will be populated with an 'id' property once the transaction
   * compeltes
   *
   * Error handling: TBD
   */
  create<T extends Identifiable>(
    model: Model<T>|SingletonModel<T>,
    record: Partial<Omit<T, 'id'>> & { id?: RecordId<T['id']> }
  ) {
    const {id, ...record_params} = record;
    const new_record = {...record_params, ...{
      _loading: true,
      _loaded:  false,
      _found:   true,
      _seq:     this.seq++
    }};
    const txn = { record: new_record, seq: new_record._seq };


    const url = "/" + encodeURIComponent(model.singleton ? model.name : model.inflections.plural) + '.json';

    const responseOrder = ++this.requestClock;
    const request = this.axios.post(url,
      {[model.name]: record_params},
      {
      }
    );

    request.then((response) => {
      //Put all the new entities in
      this.update_store(response, responseOrder);

      //Update the txn to reflect the id of the new object
      this.txns.set(txn, {
        id: response.data.id,
        status: 'succeeded',
        seq: this.seq++
      });

      //This is the case where a record was created with new() and we need to redirect that placeholder key to the live record
      if(id) {
        this.news.set(id as unknown as NewRecordId, response.data.id);        
      }

      //Will force a reload of queries
      model.query_version++;
      this.soil();
    }).catch((error) => {
      const response = error.response;
      this.txns.set(txn, {
        id: null,
        status: 'error',
        errors: response?.data?.errors,
        httpStatus: response?.status,
        seq: this.seq++
      });
      this.soil();
    });

    return txn;
  }

  /*
   * Creates a new, blank record that can later be "patched" but will actually do a "create"
   */
  new<T extends Identifiable>(model: Model<T>|SingletonModel<T>, initial_fields: Partial<Omit<T,"id">>) : NewRecord<T> {
    const id = {
      seq: this.seq++,
      //To madke it usable as, e.g., a key in a React list
      toString() { return "new-"+this.seq; }
    } as NewRecordId; //Opaque object as the id

    const ret = Object.assign({},initial_fields,{
      _loading: model.server_side_new,
      _loaded:  true,
      _found:   !model.server_side_new, //It's not considered "found" until a round-trip to the server
      _new:     true,
      _seq:     this.seq, //Already incremented above
      id: id
    }) as NewRecord<T>;
    this.news.set(id, ret);

    if(model.server_side_new) {
      const query_string = JSON.stringify({[model.name]: initial_fields});
      const url = "/" + encodeURIComponent(model.singleton ? model.name : model.inflections.plural) + '/new.json?json=' + encodeURIComponent(query_string);

      const responseOrder = ++this.requestClock;
    const request = this.axios.get(url);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      request.then((response: any) => {
        //These will only be "ancillary" records, not the new object
        this.update_store(response, responseOrder);
  
        const new_object = response.data.data as T; //The new record

        this.news.set(id, Object.assign({},
          ret,
          new_object,
          { _loading: false, _found: true, _seq: this.seq++}
        ));

        this.soil();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      }).catch((_error) => {
        //TODO: Does not handle errors on new correctly, can safely retry
        // const response = error.response;

        // let tmp = {
        //   id: null,
        //   status: 'error',
        //   errors: response && response.data.errors,
        //   seq: this.seq++
        // };
        this.soil();
      });
    }

    this.emit('loadSequence',ret._seq);
    return ret;
  }

  /*
   * Given a txn ojbect from create() or patch(), returns information about the transaction if the txn is completed
   * Retuns undefined if the request is still in progress
   *
   * TODO: Handle updates and errors
   */
  txn_status(txn: Txn) {
    const txn_result = this.txns.get(txn);
    // When txn_result is null (still in progress), it's equivalent to the seq number at the time the txn was started
    this.emit('loadSequence', txn_result ? txn_result.seq : txn.seq);
    return txn_result;
  }

  destroy<T extends Identifiable>(model: Model<T>|SingletonModel<T>, id: RecordId<T['id']>) : Txn {
    const new_record = this.news.get(id as NewRecordId);
    if(new_record) {
      //We're destroying a record that never existed in the first place
      this.news.delete(id as NewRecordId);
      const txn = {
        record: Object.assign({}, new_record, {_destroyed: true}),
        seq: this.seq++
      };
      this.txns.set(txn, {
        id: id,
        status: 'succeeded',
        seq: this.seq++
      });
      this.soil();
      return txn;
    }
    const deleting_record = Object.assign({}, model.instances.get(id) || this.emptyLoadingRecord(id as T['id']), { _loading: true, _destroyed: true });
    const txn = {
      record: deleting_record,
      seq: this.seq++
    };
    model.instances.set(id, deleting_record);
    this.soil();


    const url = "/" + encodeURIComponent(model.singleton ? model.name : model.inflections.plural) + (id ? ('/' + encodeURIComponent(id.toString())) : '') + '.json';

    const request = this.axios.delete(url);

    request.then(() => {
      //Update the txn to reflect the id of the new object
      this.txns.set(txn, {
        status: 'succeeded',
        id: id,
        seq: this.seq++
      });

      //clear all queries for the the model
      model.query_version++;
      //clear the model that was deleted
      model.instances.delete(id);
      this.emit('recordInterestsChanged');

      this.soil();
    }).catch((error) => {
      this.txns.set(txn, {
        status: 'error',
        id: id,
        errors: error.response?.data?.errors,
        httpStatus: error.response?.status,
        seq: this.seq++
      });
      this.soil();
    });

    return txn;
  }

  /*
   * Patches a set of changes on the object with "id".
   *
   * Returns the fetched version of the object. It will be stale or empty.
   *
   */
  patch<T extends Identifiable>(model: Model<T>|SingletonModel<T>, id: RecordId<T['id']> | null, changes: Partial<T>) : Txn {
    //Do a create instead if this is a model created from new()
    const new_record = this.news.get(id as NewRecordId);
    if(typeof(new_record) === 'object') {
      const initial_values = ObjectFilterBy(new_record, (k) => (k[0] !== '_'))
      return this.create(model, {...initial_values, ...changes, id: id});
    }
    const txn = { model: model.name, id: id, changes: changes, seq: this.seq++ };

    const url = "/" + encodeURIComponent(model.singleton ? model.name : model.inflections.plural) + (id ? ('/' + encodeURIComponent(id.toString())) : '');

    const responseOrder = ++this.requestClock;
    const request = this.axios.patch(url,
      {[model.name]: changes},
      {
        headers: {
          Accept: 'application/json'
        }
      }
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    request.then((response: any) => {
      //Put all the new entities in
      this.update_store(response, responseOrder);

      //Update the txn to reflect the id of the new object
      this.txns.set(txn, {
        status: 'succeeded',
        id: id,
        seq: this.seq++
      });

      //clear all queries for the the model
      model.query_version++;
      this.soil();
    }).catch((error) => {
      this.txns.set(txn, {
        status: 'error',
        id: id,
        errors: error.response?.data?.errors,
        httpStatus: error.response?.status,
        seq: this.seq++
      });
      this.soil();
    });

    return txn;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryFor<T extends Identifiable>(model: Model<T>, name: string | null, arg: any, force = false) : ReifiedQueryResult<T> {
    const canonName = name;
    const canonArg  = this.canonicalize_query(arg);
    const querySet  = this.queriesForName(model, canonName);
    const queryVersionAtStart = model.query_version;

    let unresolvedResult : QueryResult;
    let doLoad = false;

    //Pull from cache, figure out if we need to reload
    if(querySet.has(canonArg)) {
      unresolvedResult = querySet.get(canonArg)!;
      if(unresolvedResult._query_version < model.query_version || (unresolvedResult._loaded && force)) {
        doLoad = true;
        querySet.set(canonArg, Object.assign([], unresolvedResult, {_query_version: model.query_version, _loading: true}));
      }
    } else {
      // No query in the cache, so make a placeholder and
      unresolvedResult = Object.assign([],{
        _loading: true,
        _loaded:  false,
        _found:   false,
        _seq:     this.seq++,
        _query_version:   queryVersionAtStart,
        _metadata: {}
      });
      doLoad = true;
      querySet.set(canonArg, unresolvedResult);
    }

    const ret = Object.assign(
      unresolvedResult.map((id) => (this.fetch(model, id as T['id']) as ModelRecord<T>)),
      {
        _loading: unresolvedResult._loading || doLoad,
        _loaded: unresolvedResult._loaded,
        _found: unresolvedResult._found,
        _seq: unresolvedResult._seq,
        metadata: unresolvedResult.metadata
      });
    this.emit('loadSequence', ret._seq);

    if(doLoad) {
      this.io_queue.enqueue({
        io_type: 'query',
        run_time: 0,
        model: model,
        query: {
          name: canonName,
          args: canonArg,
          query_version_at_start: queryVersionAtStart,
          error_count: 0
        }
      });
      this.schedule_queue_processing();
    }

    return ret;
  }

  /*
   * Useful when a dependent record can't be fetched b/c its is sourced from
   * an object still loading.
   *
   */
  emptyLoadingRecord<T extends Identifiable>(id: T["id"]): LoadingRecord<T>  {
    return {
      _loading: true,
      _found: false,
      _loaded: false,
      _seq: this.seq, // No need to increment because this is a non-mutating method
      id: id
    }
  }

  emptyLoadingQuery<T extends Identifiable>() : LoadingQueryResult<T> {
    const q : LoadingQueryResult<T> = Object.assign([],{
      _loading: true as const,
      _loaded: false as const,
      _found: false as const
    });
    return q;
  }

  private fetchNewRecord<T extends Identifiable>(model: Model<T>|SingletonModel<T>, id: RecordId<T['id']>|null) : NewRecord<T> | ModelRecord<T> | undefined {
    const nr = this.news.get(id as NewRecordId);
    if(typeof(nr) == "object") { //It's a record that hasn't been saved yet
      return nr as NewRecord<T>;
    } else if(nr) { //It's the 'id' of the new object, now saved
      return this.fetch(model, nr as T['id'])
    }
  }

  // null is allowed for "name" for queries that don't specify a sub-route, e.g. "/my_models?q={some_query:'foo'}"
  private queriesForName<T extends Identifiable>(model: Model<T>, name: string | null): TwoGenerationCache<string | null, QueryResult> {
    const q = model.queries;
    return q.get(name) || q.set(name, new TwoGenerationCache()).get(name)!;
  }

  // private getQuery(name, arg) {
  //   arg = JSON.stringify(this.canonicalize_query(arg));
  //   return this.queriesForName(name).get(arg);
  // }

  //converts the arg into a JSON-able object that represents the query params
  private canonicalize_query(arg: Record<string, unknown> | null) : string | null {
    if(!arg) return null;
    if(typeof arg !== "object" || Array.isArray(arg)) {
      throw new Error("Canonicalizer must be passed an object at the top level");
    }

    return JSON.stringify(this.canonicalize_query_obj(arg));
  }

  // Internal helper that returns an object ready to be serialized
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private canonicalize_query_obj(arg: any) : any {
    if(arg === undefined || arg === null) {
      return null;
    } else if(Array.isArray(arg)) {
      //Arrays are ordered, so canonicalized as-is
      return arg.map((v) => (this.canonicalize_query_obj(v)));
    } else if(typeof arg === 'number' || typeof arg === 'string' || typeof arg === 'boolean') {
      // Primitives are canonicalized as-is
      return arg;
    } else if(typeof arg === 'object') {
      //JS enumerates properties in insertion order, so this standardizes the property order to guarantee identical serialization
      const ret = {} as Record<string, unknown>;
      const props = Object.getOwnPropertyNames(arg).sort();
      for(const k of props) {
        ret[k] = this.canonicalize_query_obj(arg[k]);
      }
      return ret;
    } else {
      throw new Error("Default canonicalizer doesn't know how to serialize a " + typeof arg + ", got " + arg);
    }
  }

  // Accept primary records, sideloads and mutation results through the same gate.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update_store(response: any, responseOrder = ++this.requestClock) {
    const invalidates = response.data.invalidates as InvalidatesClause;
    if(invalidates) {
      for(const [name, invalidation] of Object.entries(invalidates)) {
        const model = this.models[name];
        if(!model) continue;
        if(invalidation === 'all' || invalidation === 'queries') model.query_version++;
        if(invalidation === 'all' || invalidation === 'records') model.instances.clear();
      }
    }
    let added = false;
    for(const model of Object.values(this.models)) {
      const items = model.singleton
        ? (response.data[model.name] ? [response.data[model.name]] : [])
        : (response.data[model.inflections.plural] || []);
      for(const item of items) {
        const id = model.singleton ? model.name : item.id;
        const orig = model.instances.peek(id);
        const newerVersion = item.lock_version !== undefined &&
          item.lock_version > (orig?.lock_version ?? -1);
        if(orig && responseOrder < (orig._response_order ?? -1) && !newerVersion) continue;
        if(orig?.lock_version !== undefined &&
          (item.lock_version === undefined || item.lock_version < orig.lock_version)) continue;
        const stale = responseOrder < (orig?._invalidated_at ?? -1) ||
          (orig?._required_version !== undefined && (item.lock_version ?? -1) < orig._required_version);
        const value = {
          ...item, _loading: false, _loaded: true, _found: true, _stale: stale,
          _invalidated_at: orig?._invalidated_at, _required_version: orig?._required_version,
          _response_order: Math.max(responseOrder, orig?._response_order ?? -1), _seq: this.seq++,
        };
        if(orig) model.instances.replace(id, value);
        else {
          model.instances.set(id, value);
          added = true;
        }
      }
    }
    if(added || invalidates) this.emit('recordInterestsChanged');
    this.soil();
  }

  private processQueue() {
    const now = Date.now();
    for(;;) {
      const op = this.io_queue.dequeue();
      if(!op) break;
      if(op.run_time > now) { this.io_queue.enqueue(op); break; }
      const model = op.model;
      const recordId = op.io_type === 'fetch' ? op.record.id : undefined;
      const key = recordId !== undefined ? this.recordKey(model.name, recordId) : undefined;
      if(op.io_type === 'fetch' && !model.instances.peek(op.record.id)) {
        this.pendingRecords.delete(key!);
        continue;
      }
      const url = op.io_type === 'fetch'
        ? "/" + encodeURIComponent(model.singleton ? model.name : model.inflections.plural) +
          (op.record.id ? '/' + encodeURIComponent(op.record.id.toString()) : '')
        : "/" + encodeURIComponent(model.inflections.plural) +
          (op.query.name ? "/" + encodeURIComponent(op.query.name) : '') + '.json' +
          (op.query.args ? '?q=' + encodeURIComponent(op.query.args) : '');
      const responseOrder = ++this.requestClock;
      this.io_rate_limiter.execute(() => this.axios.get(url, {
        headers: { Accept: 'application/json' },
      })).then(response => {
        if(op.io_type === 'query') {
          const query = op.query;
          const results = Object.assign(response.data.query, {
            _loading: false, _loaded: true, _found: true, _seq: this.seq++,
            _query_version: query.query_version_at_start, metadata: response.data.metadata,
          });
          this.queriesForName(model as Model<Identifiable>, query.name).set(query.args, results);
        }
        this.update_store(response, responseOrder);
        if(key) {
          this.pendingRecords.delete(key);
          const record = model.instances.peek(recordId!);
          if(record?._loading) model.instances.replace(recordId!, { ...record, _loading: false });
        }
        this.soil();
      }).catch(error => {
        const terminal = [401, 403, 404].includes(error.response?.status);
        if(op.io_type === 'fetch') {
          const id = op.record.id;
          const orig = model.instances.peek(id);
          if(!orig) {
            this.pendingRecords.delete(key!);
            return;
          }
          if(terminal) {
            this.pendingRecords.delete(key!);
            // An obsolete request must not erase a newer accepted response.
            if(responseOrder >= (orig._response_order ?? -1) &&
               responseOrder >= (orig._invalidated_at ?? -1)) {
              model.instances.replace(id, {
                id, _found: false, _loaded: true, _loading: false,
                _response_order: responseOrder, _seq: this.seq++,
              });
            } else model.instances.replace(id, { ...orig, _loading: false });
          } else {
            const errors = (op.record._error ?? 0) + 1;
            const record = { ...orig, _error: errors, _loading: true };
            model.instances.replace(id, record);
            this.io_queue.enqueue({
              ...op, record, run_time: Date.now() + 1000 * Math.min(30, errors ** 1.5),
            });
          }
        } else {
          const query = op.query;
          this.queriesForName(model as Model<Identifiable>, query.name).set(query.args, Object.assign([], {
            _loading: !terminal, _loaded: true, _found: false, _seq: this.seq++,
            _query_version: query.query_version_at_start,
          }));
          if(!terminal) {
            const errors = query.error_count + 1;
            this.io_queue.enqueue({
              ...op, run_time: Date.now() + 1000 * Math.min(30, errors ** 1.5),
              query: { ...query, error_count: errors, query_version_at_start: model.query_version },
            });
          }
        }
        this.soil();
        this.schedule_queue_processing();
      });
    }
    this.schedule_queue_processing();
  }

  private schedule_queue_processing() {
    //Whatever last timeout was set, cancel it 'cause we're recomputing the right time to run
    if(this.io_timeout) {
      window.clearTimeout(this.io_timeout);
    }
    const next_op = this.io_queue.peek();
    if(next_op) {
      this.io_timeout = window.setTimeout(() => {
        this.processQueue();
      },Math.max(0, next_op.run_time - Date.now()));
    }
  }

  //Uses a setTimeout() hack to batch a lot of changes up into one "changed" event
  soil() {
    if(!this.is_dirty) {
      this.is_dirty = true;
      requestAnimationFrame(() => {
        this.is_dirty = false;
        this.emit("change");
      });
    }
  }
}


function ObjectFilterBy(obj: Record<string,unknown>, predicate: (k: string) => boolean) {
  return Object.keys(obj)
    .filter(key => predicate(key))
    .reduce((out, key) => {
      out[key] = obj[key];
      return out;
    }, {} as Record<string,unknown>);
}

/****
 * Loading Truth Table
 *
 *  loaded | loading | found |
 * -----------------------------
 *    F         F        F      Not possible
 *    F         F        T      Not possible
 *    F         T        F      Loading, no response yet
 *    F         T        T      Not possible
 *    T         F        F      Attempted load, not found
 *    T         F        T      Loaded object
 *    T         T        F      Attempted load, not found, currently reloading
 *    T         T        T      Loaded object, reloading
 */

 type InvalidatesClause = {
   [clazz: string]: "all" | "queries" | "records"
 }
