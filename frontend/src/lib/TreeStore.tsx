// @ts-nocheck
// @ts-nocheck
import {EventEmitter} from 'fbemitter';

import {Trackable} from './DataLoader2';

type SubTreeName = string | number

export default class TreeStore {
  readonly rootSubtree : SubTree<any,any>;

  constructor() {
    const urldata = document.location.hash.split('/');
    if(urldata.shift() === '#') { //means there's some data there, potentially
      this.rootSubtree = new SubTree(this, urldata)
    } else {
      this.rootSubtree = new SubTree(this);
    }
  }

  subtree<SD,SSTN extends SubTreeName>() : UXTreeState<SD, SSTN> {
    return this.rootSubtree as UXTreeState<SD, SSTN>;
  }

  regenerateFragment() {
    const frag = this.rootSubtree.toURIFragment()
    console.log("FRAGMENT: ",frag);
    window.history.replaceState({}, "", `#${frag}`);
  }

}

class SubTree<D, STN extends SubTreeName> extends EventEmitter implements UXTreeState<D, STN> {
  parent : SubTree<any,any> | TreeStore;
  data : Map<keyof D,{seq: number, value: any}> = new Map();
  subtrees : Map<STN,SubTree<any, any>> = new Map();
  seq = 1;
  is_dirty = false;
  active_subtree : STN | undefined = undefined;
  active_subtree_seq = 0;

  constructor(parent: SubTree<any,any> | TreeStore, urldata?: string[]) {
    super();
    this.parent = parent;
    if(urldata && urldata.length > 0) {
      const config = urldata.shift();
      const ecodedActiveTree = urldata.shift();
      const activeTree = ecodedActiveTree ? JSON.parse(decodeURIComponent(ecodedActiveTree)) : undefined;
      if(config) {
        const data = JSON.parse(decodeURIComponent(config));
        for(const i in data) {
          this.data.set(i as any, {seq: 0, value: data[i]});
        }
      }
      if(activeTree) {
        this.subtrees.set(activeTree as any, new SubTree<any,any>(this, urldata));
        this.active_subtree = activeTree as any;
      }
    }
  }

  subtree<SD, SSTN extends string>(name: STN) : SubTree<SD,SSTN> {
    return (this.subtrees.get(name) || this.subtrees.set(name, new SubTree<SD, SSTN>(this)).get(name)) as SubTree<SD, SSTN>;
  }

  setActiveSubtree(name: STN) {
    this.active_subtree = name;
    this.active_subtree_seq = this.seq++;
    this.soil();
  }

  getActiveSubtree() {
    this.emit('loadSequence',this.active_subtree_seq);
    return this.active_subtree;
  }

  get(key: keyof D) {
    const record = this.data.get(key);
    if(record) {
      this.emit('loadSequence',record.seq);
      return record.value;
    }
  }

  set<K extends keyof D>(key: K, value: D[K]|undefined) {
    this.data.set(key, {seq: this.seq++, value});
    this.soil();
  }

  getSequence() { return this.seq; }

  //Uses a setTimeout() hack to batch a lot of changes up into one "changed" event
  protected soil() {
    if(!this.is_dirty) {
      this.is_dirty = true;
      requestAnimationFrame(() => {
        this.is_dirty = false;
        this.regenerateFragment();
        this.emit("change");
      });
    }
  }

  toURIFragment() : string {
    const active_subtree = this.active_subtree;
    if(!active_subtree && this.data.size === 0) return "";

    const data : Partial<D> = {};
    for(const [k,v] of this.data.entries()) {
      data[k] = v.value;
    }
    return '/' + encodeURIComponent(JSON.stringify(data)) + (
      active_subtree ? 
        ('/' + encodeURIComponent(JSON.stringify(this.getActiveSubtree())) + (this.subtree(active_subtree).toURIFragment()))
        : "");
  }
  
  regenerateFragment(subtree?: any) {
    const tuple = Array.from(this.subtrees).find((kvp) => (kvp[1] === subtree));
    if(tuple && this.active_subtree !== tuple[0]) this.setActiveSubtree(tuple[0]);

    this.parent.regenerateFragment(this);
  }
}


/* The STN parameter is the allowed list of named subtrees */
export interface UXTreeState<D = {}, STN extends SubTreeName|never = any> extends Trackable {
  subtree<SSTN>(name: STN) : UXTreeState<SSTN>;
  setActiveSubtree(name: STN) : void;
  getActiveSubtree() : STN | undefined;

  get<K extends keyof D>(key: K) : Partial<D>[K];
  set<K extends keyof D>(key: K, value: D[K]|undefined) : void;  

}