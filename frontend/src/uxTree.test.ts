import { describe, expect, it, vi } from 'vitest';
import TreeStore from './lib/TreeStore';
import type { AppUXTree } from './uxTree';

function installHashDom(hash = '') {
  const replaceState = vi.fn();
  globalThis.document = {
    location: { hash },
  } as unknown as Document;
  globalThis.window = {
    history: { replaceState },
  } as unknown as Window & typeof globalThis;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(Date.now());
    return 1;
  }) as typeof requestAnimationFrame;
  return { replaceState };
}

describe('App UX tree', () => {
  it('tracks the active tab and keeps tab state in child subtrees', () => {
    const { replaceState } = installHashDom();
    const tree = new TreeStore<AppUXTree>();
    const root = tree.subtree();

    expect(root.getActiveSubtree()).toBeUndefined();

    root.setActiveSubtree('logic');
    root.subtree('logic').set('selectedDiagramId', 42);

    expect(root.getActiveSubtree()).toBe('logic');
    expect(root.subtree('logic').get('selectedDiagramId')).toBe(42);

    root.setActiveSubtree('devices');
    root.subtree('devices').set('showDeviceForm', 'new');

    expect(root.getActiveSubtree()).toBe('devices');
    expect(root.subtree('logic').get('selectedDiagramId')).toBe(42);
    expect(root.subtree('devices').get('showDeviceForm')).toBe('new');
    expect(replaceState).toHaveBeenCalled();
  });

  it('writes active subtree names as plain path segments', () => {
    const { replaceState } = installHashDom();
    const tree = new TreeStore<AppUXTree>();

    tree.subtree().setActiveSubtree('logic');

    expect(replaceState).toHaveBeenLastCalledWith({}, '', '#/%7B%7D/logic');
  });

});
