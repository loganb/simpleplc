// @ts-nocheck
// @ts-nocheck
import {EventEmitter} from 'fbemitter';


export default class MemoryStore extends EventEmitter {
  constructor(initial_data, name) {
    super()
    this.name = name || "MemoryStore";

    const mem_data = JSON.parse(sessionStorage.getItem(this.name)) || {};

    let setup_reducer = (h,kvp) => {h[kvp[0]] = [kvp[1], 0]; return h;};
    this.data = Object.assign(
      Object.entries(initial_data || {}).reduce(setup_reducer, {}), 
      Object.entries(mem_data).reduce(setup_reducer, {})
    );
    this.seq  = 1; // One higher than the initial version of data in the store
  }

  getSequence() {
    return this.seq;
  }

  set(key, value) {
    this.data[key] = [value, this.seq++];
    this.soil();
  }

  get(key) {
    const tuple = this.data[key];
    if(tuple) {
      this.emit('loadSequence',tuple[1]);
      return tuple[0];
    }
  }

  //Uses a setTimeout() hack to batch a lot of changes up into one "changed" event
  soil() {
    if(!this.is_dirty) {
      this.is_dirty = true;
      requestAnimationFrame(() => {
        this.is_dirty = false;
        sessionStorage.setItem(this.name, JSON.stringify(
          Object.entries(this.data).reduce( (h,kvp) => {h[kvp[0]] = kvp[1][0]; return h}, {})
        ));
        this.emit("change");
      });
    }
  }

}