import {EventEmitter} from 'fbemitter';
import RateLimiter from './RateLimiter';

import * as Collections from 'typescript-collections'
import { AxiosInstance } from 'axios';

export type NewRecordId = { seq: number};
export type RecordId<T = number|string> = NewRecordId|T;

export interface Txn {
  readonly record?: object,
  readonly seq?: number
}

export interface TxnResult {
  readonly status: 'succeeded' | 'error',
  readonly seq: number,
  readonly id: RecordId | null,
  readonly errors?: unknown
}

//
interface RecordFlags {
  readonly _loading: boolean,
  readonly _loaded: boolean,
  readonly _found: boolean,
  readonly _seq: number,
  readonly _new?: boolean, 
  readonly _error?: number, 
  readonly lock_version?: number,
  readonly id: RecordId
}
export type Identifiable = {id: RecordId};
/*
 * ExtantRecord<T> is guaranteed to have an 'id', but isn't necessarily found yet
 *
 */
export type ExtantRecord<T extends Identifiable> = RecordFlags & {id: RecordId<T['id']>}; //Guaranteed to have an Id, some placeholder loading records don't guarantee this

/*
 * A record that isn't found, so it has no data
 */
type NotFoundRecord<T extends Identifiable> = (ExtantRecord<T> & {_found: false});
/*
 * A record that is found, so it is guaranteed to have its fields
 *
 */
export type FoundRecord<T extends Identifiable> = (ExtantRecord<T> & {_found: true}) & Omit<T,'id'>;
export type ModelRecord<T extends Identifiable> = NotFoundRecord<T> | FoundRecord<T>;
export type LoadingRecord<T extends Identifiable> = RecordFlags & {_loading: true, _found: false} & Pick<T,'id'>;
export type ExistingRecord<T extends Identifiable> = FoundRecord<T> & { _new: false | undefined } & Pick<T, 'id'>;

export type IdType<FIELDS extends Identifiable> = ModelRecord<FIELDS>['id'];

/*
 * On New Records, the id column is an opaque object, and all fields are optional. 
 */
export type NewRecord<T> = RecordFlags & Partial<Omit<T,'id'>> & {id: NewRecordId, _new: true}; //These are returned from new()
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
  readonly _epoch: number,
  readonly _seq?: number,
  readonly _error?: number,
  readonly metadata?: unknown,
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
    epoch_at_start: number,
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

  queries: Map<string | null, Map<string,QueryResult>>;
  instances: Map<RecordId,RecordFlags>;
  query_epoch: number;

  store: RestfulModelStore;

  constructor(store: RestfulModelStore, definition: _ModelDefinition<T>) {
    this.store = store;
    this.name = definition.name;
    this.inflections = definition.inflections;
    this.instances = new Map();
    this.queries   = new Map();
    this.query_epoch = 0; //Increments with every piece of new data
    this.server_side_new = !!definition.server_side_new;
  }
}

class Model<T extends Identifiable> extends BaseModel<T> {
  public readonly singleton = false;

  public fetch(id: RecordId, force = false) : ModelRecord<T> {
    return this.store.fetch(this, id as RecordId, force);
  }

  public fetchMany(ids: RecordId[], force = false) : ReifiedQueryResult<T> {
    return this.store.fetchMulti(this,ids,force);
  }

  public queryFor(name: string | null, arg: Record<string, unknown> | null) : ReifiedQueryResult<T> {
    return this.store.queryFor(this, name, arg);
  };
  public destroy(id: RecordId) : Txn {
    return this.store.destroy(this, id);
  }

  public create(record: Partial<T>) : Txn {
    return this.store.create(this, record);
  }

  public patch(id: RecordId, changes: Partial<T>) : Txn {
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
    return this.store.fetch(this, this.name, force);
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
  news: WeakMap<NewRecordId, Identifiable>;
  seq: number;
  is_dirty: boolean = false;

  io_queue   = new Collections.PriorityQueue<IoOp>((a,b) => (a.run_time - b.run_time));
  io_timeout?: number;
  io_rate_limiter = new RateLimiter({initialRps: 10});

  constructor(axios: AxiosInstance) {
    super();
    this.axios  = axios;
    this.models = {};
    this.txns   = new WeakMap<Txn, TxnResult>();
    //Mapping of placeholder ids -> (new record | id of created record), particularly useful after save
    this.news   = new WeakMap();
    this.seq    = 0; //Increments with every piece of new data
  }

  /*
   * Used to track the current state of the data store
   */
  getSequence() {
    return this.seq;
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

  fetchMulti<T extends Identifiable>(model: Model<T>, ids: RecordId[], force: boolean = false) {
    const records = ids.map((id) => ( this.fetch(model, id, force)));
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
  fetch<T extends Identifiable>(model: Model<T> | SingletonModel<T>, id: RecordId, force: boolean = false) : NotFoundRecord<T> | FoundRecord<T> {
    if((typeof(id) === 'undefined' || id == null) && !model.singleton) {
      throw new Error("Whoops!");
    }
    //See if we get a hit in the unsaved set, followed by the cache, otherwise kick off a load cycle
    let exists = true;
    const record = this.fetchNewRecord(model, id) || model.instances.get(id) || {
      _loading: true,
      _loaded:  exists = false,
      _found:   false,
      _seq:     this.seq++,
      id: id
    };
    if(!exists || (record && record._loaded && force)) {
      //Always return a blank object
      model.instances.set(id, record);
      this.soil();
      this.io_queue.enqueue({
        io_type: 'fetch',
        model: model,
        run_time: 0, //The distant past, so means "right now"
        record: record,
      });
      this.schedule_queue_processing();
    }

    this.emit('loadSequence',record._seq);
    return record;
    //return this.models.get(id) || ret;
  }


  /*
   * Returns a txn object the represents the outstanding transaction
   * The txn object will be populated with an 'id' property once the transaction
   * compeltes
   *
   * Error handling: TBD
   */
  create<T extends Identifiable>(model: Model<T>|SingletonModel<T>, record: Partial<T>) {
    const {id, ...record_params} = record;
    const new_record = {...record_params, ...{
      _loading: true,
      _loaded:  false,
      _found:   true,
      _seq:     this.seq++
    }};
    const txn = { record: new_record, seq: new_record._seq };


    const url = "/" + encodeURIComponent(model.singleton ? model.name : model.inflections.plural) + '.json';

    const request = this.axios.post(url,
      {[model.name]: record_params},
      {
      }
    );

    request.then((response) => {
      //Put all the new entities in
      this.update_store(response);

      //Update the txn to reflect the id of the new object
      this.txns.set(txn, {
        id: response.data.id,
        status: 'succeeded',
        seq: this.seq++
      });

      //This is the case where a record was created with new() and we need to redirect that placeholder key to the live record
      if(id) {
        this.news.set(id as NewRecordId, response.data.id);        
      }

      //Will force a reload of queries
      model.query_epoch++;
      this.soil();
    }).catch((error) => {
      const response = error.response;
      this.txns.set(txn, {
        id: null,
        status: 'error',
        errors: response.data.errors,
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

      const request = this.axios.get(url,
        {
          headers: {
            'X-CSRF-Token': document.head.querySelector('meta[name=csrf-token]')!.getAttribute('content')
          }
        }
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      request.then((response: any) => {
        //These will only be "ancillary" records, not the new object
        this.update_store(response);
  
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

  destroy<T extends Identifiable>(model: Model<T>|SingletonModel<T>, id: T['id']) : Txn {
    const new_record = this.news.get(id as NewRecordId);
    if(new_record) {
      //We're destroying a record that never existed in the first place
      this.news.delete(id as NewRecordId);
      const txn = {
        record: Object.assign({}, new_record, {_destroyed: true})
      };
      this.txns.set(txn, {
        id: id,
        status: 'succeeded',
        seq: this.seq++
      });
      this.soil();
      return txn;
    }
    const deleting_record = Object.assign({}, model.instances.get(id) || this.emptyLoadingRecord(id || ""), { _loading: true, _destroyed: true });
    const txn = {
      record: deleting_record
    };
    model.instances.set(id, deleting_record);
    this.soil();


    const url = "/" + encodeURIComponent(model.singleton ? model.name : model.inflections.plural) + (id ? ('/' + encodeURIComponent(id.toString())) : '') + '.json';

    const request = this.axios.delete(url,
      {
        headers: {
          'X-CSRF-Token': document.head.querySelector('meta[name=csrf-token]')!.getAttribute('content')
        }
      }
    );

    request.then(() => {
      //Update the txn to reflect the id of the new object
      this.txns.set(txn, {
        status: 'succeeded',
        id: id,
        seq: this.seq++
      });

      //clear all queries for the the model
      model.query_epoch++;
      //clear the model that was deleted
      model.instances.delete(id);

      this.soil();
    }).catch((e) => (console.log("ERROR 2!!",e))); //TODO: Handle errors

    request.catch((e) => (
      console.log("Something bad happened during the destroy", e)
    ));

    return txn;
  }

  /*
   * Patches a set of changes on the object with "id".
   *
   * Returns the fetched version of the object. It will be stale or empty.
   *
   */
  patch<T extends Identifiable>(model: Model<T>|SingletonModel<T>, id: RecordId | null, changes: Partial<T>) : Txn {
    //Do a create instead if this is a model created from new()
    const new_record = this.news.get(id as NewRecordId);
    if(typeof(new_record) === 'object') {
      const initial_values = ObjectFilterBy(new_record, (k) => (k[0] !== '_'))
      return this.create(model, {...initial_values, ...changes, id: id});
    }
    const txn = { model: model.name, id: id, changes: changes, seq: this.seq++ };

    const url = "/" + encodeURIComponent(model.singleton ? model.name : model.inflections.plural) + (id ? ('/' + encodeURIComponent(id.toString())) : '');

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
      this.update_store(response);

      //Update the txn to reflect the id of the new object
      this.txns.set(txn, {
        status: 'succeeded',
        id: id,
        seq: this.seq++
      });

      //clear all queries for the the model
      model.query_epoch++;
      this.soil();
    }).catch(() => {
      this.txns.set(txn, {
        status: 'error',
        id: id,
        seq: this.seq++
      });
      this.soil();
    });

    return txn;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryFor<T extends Identifiable>(model: Model<T>, name: string | null, arg: any) : ReifiedQueryResult<T> {
    const canonName = name;
    const canonArg  = this.canonicalize_query(arg);
    const querySet  = this.queriesForName(model, canonName);
    const epochAtStart = model.query_epoch;

    let unresolvedResult : QueryResult;
    let doLoad = false;

    //Pull from cache, figure out if we need to reload
    if(querySet.has(canonArg)) {
      unresolvedResult = querySet.get(canonArg)!;
      if(unresolvedResult._epoch < model.query_epoch) {
        doLoad = true;
        querySet.set(canonArg, Object.assign([], unresolvedResult, {_epoch: model.queryFor}));
      }
    } else {
      // No query in the cache, so make a placeholder and
      unresolvedResult = Object.assign([],{
        _loading: true,
        _loaded:  false,
        _found:   false,
        _seq:     this.seq++,
        _epoch:   epochAtStart,
        _metadata: {}
      });
      doLoad = true;
      querySet.set(canonArg, unresolvedResult);
    }

    const ret = Object.assign(
      unresolvedResult.map((id) => (this.fetch(model, id))),
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
          epoch_at_start: epochAtStart,
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

  private fetchNewRecord<T extends Identifiable>(model: Model<T>|SingletonModel<T>, id: RecordId|null) : ExtantRecord<T> | undefined {
    const nr = this.news.get(id as NewRecordId);
    if(typeof(nr) == "object") { //It's a record that hasn't been saved yet
      return nr as NewRecord<T>;
    } else if(nr) { //It's the 'id' of the new object, now saved
      return this.fetch(model, nr)
    }
  }

  // null is allowed for "name" for queries that don't specify a sub-route, e.g. "/my_models?q={some_query:'foo'}"
  private queriesForName<T extends Identifiable>(model: Model<T>, name: string | null): Map<string | null, QueryResult> {
    const q = model.queries;
    return q.get(name) || q.set(name, new Map()).get(name)!;
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update_store(response: any) {
    const update_seq = this.seq++;
    // Invalidate anything specified in the invalidates clause
    const invalidates = response.data.invalidates as InvalidatesClause;
    if(invalidates) {
      for(const clazz of Object.keys(invalidates)) {
        const model = this.models[clazz];
        if(model) {
          const invalidation = invalidates[clazz];
          if(invalidation === "all" || invalidation === "queries")
            model.query_epoch++;
          if(invalidation === "all" || invalidation === "records")
            model.instances.clear();
        }
      }  
    }

    // Read any model objects in the response
    for(const model of Object.values(this.models)) {
      if(model.singleton) {
        if(response.data[model.name]) {
          const item = response.data[model.name];
          item._loading = false; item._loaded = true;item._found = true;item._seq = update_seq;
          model.instances.set(model.name, item);
        }
      } else {
        for(const item of (response.data[model.inflections.plural] || [])) {
          item._loading = false; item._loaded = true;item._found = true;

          //If a lock_version exists on the model, it's used to avoid unnecessary repaints
          const orig = model.instances.get(item.id);
          if(!orig || !orig.lock_version || !item.lock_version || orig.lock_version !== item.lock_version)
            item._seq = update_seq;
          else
            item._seq = orig._seq;
          model.instances.set(item.id, item);
        }
      }
    }
    this.soil();
  }

  private processQueue() {
    const now = Date.now();

    for(;;) {
      const op = this.io_queue.dequeue();
      if (!op) break;
      if (op.run_time > now) { //Put it back if we can't use it, uncommon case
        this.io_queue.enqueue(op);
        break;
      }

      const model = op.model;
      let url: string;
      if(op.io_type === 'fetch') {
        const id    = op.record.id;
        //Start the fetch of the object
        url = "/" + encodeURIComponent(model.singleton ? model.name : model.inflections.plural) + (id ? ('/' + encodeURIComponent(id.toString())) : '');  
      } else {
        const query = op.query;

        url = "/" + encodeURIComponent(model.inflections.plural) +
        (query.name ? ("/" + encodeURIComponent(query.name)) : "") + '.json' +
        (query.args ? "?q=" + encodeURIComponent(query.args) : "");
      }
      this.io_rate_limiter.execute(() => (this.axios.get(url, {
        headers: {
          Accept: 'application/json'
        }
      }))).then((response) => {
        if(op.io_type === 'query') {
          const query = op.query;
          //Extra work of responding to the query-specific portion
          //Get the IDs out of the query
          const queryResults = response.data.query;
          queryResults._loading = false;
          queryResults._loaded  = true;
          queryResults._found   = true;
          queryResults._seq     = this.seq++;
          queryResults._epoch   = query.epoch_at_start;
          queryResults.metadata = response.data.metadata;
          this.queriesForName(model as Model<Identifiable>, query.name).set(query.args, queryResults);
        }
        //This updates the model store which is uniform across both queries & fetches
        this.update_store(response);
      }).catch((error) => {
        let retriable_error, terminal_error;
        if(op.io_type === 'fetch') {
          const id = op.record.id;
          // This is for all non-final errrors, queues for retry
          //TODO: If this is a force-reload, preserve existing data
          retriable_error = () => {
            const error_count = (op.record._error || 0) + 1;
            const record = {
              _loading: true,
              _loaded: false,
              _found: false,
              _seq: this.seq++,
              _error: error_count, //Increment the error count
              id: id
            } as NotFoundRecord<Identifiable>;
            model.instances.set(id, record);
            this.io_queue.enqueue({
              io_type: 'fetch',
              model: model,
              //Retry the first error immediately, otherwise, backoff exponentially, max 30 seconds
              run_time: now + 1000*Math.min(Math.max(0,Math.min(error_count,10)-1)**1.5,30),
              record: record,
            });
            this.soil();
          }
          terminal_error = () => {
            model.instances.set(id, {
              _loading: false,
              _loaded: true,
              _found: false,
              _seq: this.seq++,
              id: id
            });
            this.soil();
          }
        } else {
          const query = op.query;
          const error_count = query.error_count + 1;
          terminal_error = () => {
            const queryResults = Object.assign([], {
              _loaded: true,
              _loading: false,
              _found: false,
              _seq: this.seq++,
              _epoch: query.epoch_at_start
            });
            this.queriesForName(model as Model<Identifiable>, query.name).set(query.name, queryResults);
          }
          retriable_error = () => {
            const queryResults = Object.assign([], {
              _loaded: true,
              _loading: true,
              _found: false,
              _seq: this.seq++,
              _epoch: query.epoch_at_start,
              _error_count: error_count
            });
            this.queriesForName(model as Model<Identifiable>, query.name).set(query.name, queryResults);
            this.soil();

            this.io_queue.enqueue(Object.assign({},op,{
              run_time: now + 1000*Math.min(Math.max(0,Math.min(error_count,10)-1)**1.5,30),
              query: Object.assign({},op.query,{
                error_count: error_count,
                //Since we're retrying the query, it is running in the current epoch, there's no chance it's stale
                epoch_at_start: model.query_epoch
              })
            }));
          }
        }
        if (error.response) {
          if (error.response.status === 404) {
            terminal_error();
          } else if (error.response.status === 401) {
            // Unauthorized, for now just treat like unfound
            terminal_error();
          } else {
            console.log("Fetch Error at Server", error);
            retriable_error();
          }
        } else {
          console.log("Fetch Error", error)
          retriable_error();
        }
        //In the case of error, it's possible we re-queued a task, so recompute the schedule
        this.schedule_queue_processing();
      });
    }
    //Either there's no items left or they're not runnable yet, schedule for future
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