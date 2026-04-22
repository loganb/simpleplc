// @ts-nocheck
// @ts-nocheck
/* eslint-disable import/no-anonymous-default-export */
import React, { useState, useLayoutEffect, useRef, useMemo } from 'react';

import {EventEmitter, EventSubscription} from 'fbemitter';

export interface DataLoader<P,S,D> extends React.Component<P,S> {
};

interface DLWrappedClass<P,S,D> extends React.ComponentClass<ComponentProps<P,S,D>, any> {}

//Data store objects must be of this type
export type Trackable = EventEmitter & {
  getSequence() : number
};

// The P & S are parital here because the render class can irgnore those 
// args if it wants to
export type ComponentProps<P,S,D> = P & S & D & {
  data_loader: DataLoader<P,S,D>
};

export default function<P,S,D>(
    Component: React.ComponentClass<ComponentProps<P,S,D>, any>, 
    storeProps: Array<keyof P>,
    getDataFunc: (props: P, state: S, data_loader: DataLoader<P,S,D>) => D
  ) : React.ComponentClass<P,S> {
  
  // type mergedProps = P&S&{children?: React.ReactNode};
  // type propsToComponent = P & S & {children?: React.ReactNode, data_loader: DataLoader<P,S,D>}
  // type propsToDataHandler = {props: P, state: S};

  const DataHandlingClass = class extends React.PureComponent<P,S> {
    listenerTokens: Array<EventSubscription>;
    lastTrackingRun: {[index: string]: number};
    data: D | undefined;

    constructor(props: P, context?: any) {
      super(props,context);

      this.listenerTokens = [];
      this.lastTrackingRun = {};
    }

    componentDidMount() {
      this.listenerTokens = storeProps.map((p) => (
        (this.props[p] as unknown as EventEmitter).addListener('change', (e: any) => (this.handleStoresChanged(e)))
      ));
    }
    componentWillUnmount() {
      this.listenerTokens.forEach((t) => {
        t.remove();
      });
    }

    handleStoresChanged(e: any) {
      const {data: newData, tracking} = this.trackedData();
      const ltr = this.lastTrackingRun;

      if(Object.keys(tracking).some((k) => ((typeof(ltr[k]) !== 'number') || (tracking[k] > ltr[k]) ))) {
        // console.log("FORCING AN UPDATE BECAUSE ", tracking, " IS NEWER THAN ", ltr);
        this.lastTrackingRun = tracking;
        this.data = newData;
        this.forceUpdate();  
      } else {
        //Do not update the data because nothing was new 
        // console.log("DID NOT FORCE AN UPDATE BECAUSE ", tracking, " IS NOT NEWER THAN ", ltr);
      }
    }

    // Returns the value from func() if any data fetched from a store named by StoreSet accesses data newer than the last time squenceTracking was used
    // Returns an empty object otherwise, for easy merging into a new "state" object 
    // storeSet defaults to all stores
    private trackedData() {
      // const storeSet = storeProps;
      let seq_values : {[index: string]: number} = {};
      let subscriptions = storeProps.map((p) => (
        (this.props[p] as unknown as EventEmitter).addListener('loadSequence', (seq_value: number) => (
          seq_values[p as string] = Math.max( (seq_values[p as string] || 0) as number, seq_value)
        ))
      ));

      let ret;
      try {
        ret = getDataFunc(this.props, this.state, this);
      } finally {
        subscriptions.forEach((s) => (s.remove()));
      }

      return {data: ret,tracking: seq_values};
    }

    render() {
      //Perf optimization, this is set if the render is caused by a change event in the data store (and not props/state change)
      let data, tracking;
      if(this.data) {
        data = this.data;
        this.data = undefined;
      } else {
        ({data, tracking} = this.trackedData());
        this.lastTrackingRun = tracking;
      }

      const wrappedProps = Object.assign({}, {data: data, data_loader: this, props: this.props}, this.props, this.state, data);
      return <Component {...wrappedProps}></Component>;
    }
  };

  Object.defineProperty (DataHandlingClass, 'name', {value: `${Component.name} (Data Loader)`})
  return DataHandlingClass;
}


type LoaderFunc<D> = () => D;
type TrackedData<D> = {data: D, data_sequences: number[], global_sequences: number[]};

//This needs to be a global b/c any internal state inside useLoaders could be stale because useEffect isn't refreshed every time
let forceRenderCounter = 1;

export function useLoaders<D>(loaderFunc : LoaderFunc<D>, stores : Trackable[], deps?: any[] ) : D {
  //Pull data and track
  function trackAndLoad() {
    const seq_values: number[] = stores.map(() => (0)); //Hack to fill with zeros
    const global_seq_values = stores.map((s) => (s.getSequence()));
    const subscriptions = stores.map((p, idx) => (
      p.addListener('loadSequence', (seq_value: number) => (
        seq_values[idx] = Math.max( (seq_values[idx] || 0) as number, seq_value)
      ))
    ));
  
    let ret;
    try {
      ret = loaderFunc();
    } finally {
      subscriptions.forEach((s) => (s.remove()));
    }

    return {data: ret,data_sequences: seq_values, global_sequences: global_seq_values};
  }

  //Two paths to loaded data: 
  
  // 1) Memoized based on the dependencies, changes when the props change
  const memoizedPropsData = useMemo(trackAndLoad,deps);

  // 2) Data Loaded whenever the stores change
  const changedDataLoad = useRef<TrackedData<D>>();
  const [forceRenderCount, setForceRenderCount] = useState(0);
  useLayoutEffect(() => {
    const storeChangeHandler = () => {
      const newLoad = trackAndLoad();
      //See below for how this logic picks the "latest" load
      const lastLoad = (changedDataLoad.current && changedDataLoad.current.global_sequences.some(
          (seq,idx) => (memoizedPropsData.global_sequences[idx] < seq)
        )) ? changedDataLoad.current : memoizedPropsData;

      if(newLoad.data_sequences.some((seq, idx) => (seq > lastLoad.data_sequences[idx]) )) {
        //Means we fetched some newer data, so force a load
        // console.log("FORCING A RELOAD BECAUSE", newLoad.data_sequences, " > ", lastLoad.data_sequences);
        changedDataLoad.current = newLoad;
        setForceRenderCount(forceRenderCounter++);
      } else {
        // Ignore this data load because it didn't pull any new data
        // console.log("NOT FORCING A RELOAD BECAUSE", newLoad.data_sequences, " <= ", lastLoad.data_sequences);
      }
    };

    const subscriptions = stores.map((s) => (s.addListener('change', storeChangeHandler)));

    return () => {
      // console.log("CLEANING UP AN EFFECT");
      subscriptions.map((s) => (s.remove()))
    };
  }, deps); //useEffect needs to be resubscribed whenever the deps change because the trackAndLoad closure will be different
  //NOTE: This is weird because on every call, the trackAndLoad closure will technically be different, but it will be ignored unless 
  //      the "deps" actually changed


  // Pick the newer of the memoized-from-props and loaded-from-a-change-event:
  // The change event version is used if any of the memoized global sequences are less than the fetched data ones (means definitively that data was fetched more recently than the last props change)
  // Otherwise, use the memoized version.
  if(changedDataLoad.current && changedDataLoad.current.global_sequences.some((seq,idx) => (
    memoizedPropsData.global_sequences[idx] < seq
  ))) {
    return changedDataLoad.current.data;
  } else {
    return memoizedPropsData.data;
  }
}