import React, { useState, useLayoutEffect, useRef, useMemo } from 'react';

import {EventEmitter} from 'fbemitter';

//Data store objects must be of this type
export type Trackable = EventEmitter & {
  getSequence() : number
};

// Reference to the HOC wrapper instance passed into wrapped components
export type DataLoaderRef<P,S> = React.Component<P,S>;

// The P & S are partial here because the render class can ignore those
// args if it wants to
export type ComponentProps<P,S,D> = P & S & D & {
  data_loader: DataLoaderRef<P,S>
};



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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoizedPropsData = useMemo(trackAndLoad, deps as readonly unknown[]);

  // 2) Data Loaded whenever the stores change
  const changedDataLoad = useRef<TrackedData<D> | undefined>(undefined);
  const [, setForceRenderCount] = useState(0);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps as readonly unknown[]); //useEffect needs to be resubscribed whenever the deps change because the trackAndLoad closure will be different
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