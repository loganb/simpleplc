import {EventEmitter} from 'fbemitter';

import {Trackable} from './DataLoader2';

export type UXTreeDefinition = {
  data: Record<string, unknown>;
  pages?: Record<string, UXTreeDefinition>;
};

/* The TT parameter carries the full tree shape for compile-time validation */
export interface URLTreeState<TT extends UXTreeDefinition> extends Trackable {

  subtree<K extends string & keyof NonNullable<TT['pages']>>(name: K): URLTreeState<NonNullable<TT['pages']>[K]>;
  setActiveSubtree(name: string & keyof NonNullable<TT['pages']>): void;
  getActiveSubtree(): (string & keyof NonNullable<TT['pages']>) | undefined;

  get<K extends string & keyof TT['data']>(key: K): TT['data'][K] | undefined;
  set<K extends string & keyof TT['data']>(key: K, value: TT['data'][K] | undefined): void;
}

// Parent nodes must be able to propagate URL fragment regeneration upward.
// Using an interface here avoids variance issues between SubTree<X> and SubTree<Y>.
interface TreeParent {
  regenerateFragment(child?: unknown): void;
}

export default class TreeStore<TT extends UXTreeDefinition> implements TreeParent {
  readonly rootSubtree: SubTree<TT>;

  constructor() {
    const urldata = document.location.hash.split('/');
    if (urldata.shift() === '#') {
      this.rootSubtree = new SubTree<TT>(this, urldata);
    } else {
      this.rootSubtree = new SubTree<TT>(this);
    }
  }

  subtree(): URLTreeState<TT> {
    return this.rootSubtree;
  }

  regenerateFragment(): void {
    const frag = this.rootSubtree.toURIFragment();
    window.history.replaceState({}, "", `#${frag}`);
  }
}

type Pages<TT extends UXTreeDefinition> = NonNullable<TT['pages']>;

// Internally, Maps are keyed/valued loosely (string → unknown) because TS can't
// express per-key Map types.  Type safety lives at the public API boundary
// (get/set/subtree), where generics narrow to the exact key.
class SubTree<TT extends UXTreeDefinition> extends EventEmitter implements URLTreeState<TT> {
  private parent: TreeParent;
  private data   = new Map<string, { seq: number; value: unknown }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private subtrees = new Map<string, SubTree<any>>();
  private active_subtree: string | undefined = undefined;
  private active_subtree_seq = 0;
  seq = 1;
  private is_dirty = false;

  constructor(parent: TreeParent, urldata?: string[]) {
    super();
    this.parent = parent;
    if (urldata && urldata.length > 0) {
      const config = urldata.shift();
      const encodedActiveTree = urldata.shift();
      const activeTree = encodedActiveTree
        ? JSON.parse(decodeURIComponent(encodedActiveTree)) as string
        : undefined;
      if (config) {
        const parsed = JSON.parse(decodeURIComponent(config)) as Record<string, unknown>;
        for (const key in parsed) {
          this.data.set(key, { seq: 0, value: parsed[key] });
        }
      }
      if (activeTree) {
        this.subtrees.set(activeTree, new SubTree(this, urldata));
        this.active_subtree = activeTree;
      }
    }
  }

  subtree<K extends string & keyof Pages<TT>>(name: K): URLTreeState<Pages<TT>[K]> {
    const existing = this.subtrees.get(name);
    if (existing) return existing as SubTree<Pages<TT>[K]>;
    const created = new SubTree<Pages<TT>[K]>(this);
    this.subtrees.set(name, created);
    return created;
  }

  setActiveSubtree(name: string & keyof Pages<TT>): void {
    this.active_subtree = name;
    this.active_subtree_seq = this.seq++;
    this.soil();
  }

  getActiveSubtree(): (string & keyof Pages<TT>) | undefined {
    this.emit('loadSequence', this.active_subtree_seq);
    return this.active_subtree as (string & keyof Pages<TT>) | undefined;
  }

  get<K extends string & keyof TT['data']>(key: K): TT['data'][K] | undefined {
    const record = this.data.get(key);
    if (record) {
      this.emit('loadSequence', record.seq);
      return record.value as TT['data'][K];
    }
  }

  set<K extends string & keyof TT['data']>(key: K, value: TT['data'][K] | undefined): void {
    this.data.set(key, { seq: this.seq++, value });
    this.soil();
  }

  getSequence(): number { return this.seq; }

  protected soil(): void {
    if (!this.is_dirty) {
      this.is_dirty = true;
      requestAnimationFrame(() => {
        this.is_dirty = false;
        this.regenerateFragment();
        this.emit("change");
      });
    }
  }

  toURIFragment(): string {
    const active = this.active_subtree;
    if (!active && this.data.size === 0) return "";

    const data: Record<string, unknown> = {};
    for (const [k, v] of this.data.entries()) {
      data[k] = v.value;
    }

    if (active) {
      const childFragment = this.subtrees.get(active)?.toURIFragment() ?? "";
      return '/' + encodeURIComponent(JSON.stringify(data))
           + '/' + encodeURIComponent(JSON.stringify(active))
           + childFragment;
    }
    return '/' + encodeURIComponent(JSON.stringify(data));
  }

  regenerateFragment(child?: unknown): void {
    if (child) {
      const entry = Array.from(this.subtrees).find(([, v]) => v === child);
      if (entry && this.active_subtree !== entry[0]) {
        this.setActiveSubtree(entry[0] as string & keyof Pages<TT>);
      }
    }
    this.parent.regenerateFragment(this);
  }
}

// Example tree structure definition
/*
type ExampleTreeDefinition = {
  data: { counter: number };
  pages: {
    home: {
      data: {
        foo?: string;
      };
    };
    settings: {
      data: {
        theme: 'light' | 'dark';
      };
    };
  };
};
*/