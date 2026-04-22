// @ts-nocheck
// @ts-nocheck
import * as Collections from 'typescript-collections';

export default class RateLimiter {
  public readonly initialRps: number;
  public readonly successIncrement: number;
  public readonly failureFraction: number;
  public readonly minRps: number;

  public currentRps: number;
  public fails = 0;
  public successes = 0;
  public queues = 0;
  
  private readonly q = new Collections.Queue<() => Promise<any>>();
  private lastExecuteTime = 0;

/*
 * @param initialRps The starting Requests-per-second to execute
 * @param successIncrement The amount to increment the RPS when a request succeeds
 * @param failureFraction The fraction to backoff on failure, default is 0.8 which means 80% of the current RPS
 * @param minRps Minimum allowable RPS, default is 0.2, meaning one request per 5 seconds
 * 
 * This class is designed to implement additive increase/multiplicative decrease in request rate to ensure fair sharing if server resources are contended. 
 * 
 * NOTE: Because the successIncrement is adjusted on a per-request basis, the increase is quadratic, not linear as intended.
 *
 * TODO: Make the increase linear, not quadratic
 * 
 */
  constructor({initialRps=1, successIncrement=0.1, failureFraction=0.8, minRps = 0.2}) {
    this.initialRps = initialRps;
    this.successIncrement = successIncrement;
    this.failureFraction = failureFraction;
    this.minRps = minRps;
    
    this.currentRps = this.initialRps;
  }

  /*
   * Takes a block, queues it for execution. Depending on success/failure of the resulting Promise, the 
   * execution rate is adjusted.  
   */
  execute<T>(block: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const q = this.q;
    const q_is_empty = q.isEmpty();

    if(q_is_empty && (this.currentRps * (now - this.lastExecuteTime)/1000 >= 1)) {
      //Directly execute if if the queue is empty and at least one event can be fired immediately
      this.lastExecuteTime = now;
      //Direct invocation doesn't increase the rate because we're not running under rate pressure, 
      //But errors still indicate we're running too fast
      const p = block(); 
      p.then(() => (this.successes++)).catch(() => {this.fails++;this.blockFailed()});
      return p;
    } else {
      // If we have to wait a little while to execute, wrap the block and kick it off later

      // We only need to actually schedule execution if the queue started empty, otherwise, it's guaranteed to already be happening
      if(q_is_empty) this.queueNextExecute(now);

      this.queues++;

      return new Promise((resolve, reject) => {
        q.add(() => {
          const p = block();
          p.then((r) => (resolve(r))).catch((e) => (reject(e)));
          return p;
        });  
      });
    }
  }

  private executeBlocks() {
    const now = Date.now();
    const q = this.q;
    //TODO What about if the queue is empty?
    let blocksToExecute = this.currentRps * (now - this.lastExecuteTime)/1000;
    for(;(blocksToExecute >= 1) && !q.isEmpty();blocksToExecute--) {
      const promise = q.dequeue()!();
      promise.then(() => (this.blockSucceeded())).catch(() => (this.blockFailed()));
    }
    //There may be a fractional request left over, carry it forward by deducting it off the execution time
    //In the case where there's a lot left over, this is irrelevant because execution will happen immediately
    this.lastExecuteTime = now - 1000*(blocksToExecute / this.currentRps);
    if(!this.q.isEmpty()) this.queueNextExecute(now);
  }
  
  private queueNextExecute(now: number) {
    const timeToNextExecute = (this.lastExecuteTime + (1000 / this.currentRps)) - now;

    // It's possible the time to next execute to be negative if we're running slow
    setTimeout(() => (this.executeBlocks()), Math.max(timeToNextExecute, 0));
  }


  private blockSucceeded() {
    this.currentRps += this.successIncrement;
    this.successes++;
  }

  private blockFailed() {
    this.currentRps = Math.max(this.currentRps*this.failureFraction, this.minRps);
    this.fails++;
  }

}

// function sleep(ms) {
//   return new Promise(resolve => setTimeout(resolve, ms));
// }
// p = (async () => {
//   console.log("One");
//   await sleep(100);
//   // throw new Error("Poop");
// })();
// p.catch(() => (console.log("SWALLOWING"))).then(() => (console.log("Three")));p.catch(() =>(console.log("Four")));p.then(() => (console.log("FIVE")));