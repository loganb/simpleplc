import TreeStore from './lib/TreeStore';
import type { URLTreeState, UXTreeDefinition } from './lib/TreeStore';

export type TabName = 'dashboard' | 'devices' | 'logic';

export type DashboardUXTree = {
  data: Record<string, never>;
};

export type DevicesUXTree = {
  data: {
    showHostInterfaceForm: number | 'new' | null;
    showDeviceForm: number | 'new' | null;
    /** Whether the discovered-ports panel is expanded. */
    showPortScan: boolean;
    /** HostPort id whose details prefill the new-interface form, if any. */
    prefillPortId: string | null;
  };
};

export type LogicUXTree = {
  data: {
    selectedDiagramId: number | null;
    showDiagramForm: boolean;
    showMeasurementForm: number | 'new' | null;
    showBlockForm: number | 'new' | null;
    showOutputForm: number | 'new' | null;
  };
};

export type AppUXTree = UXTreeDefinition & {
  data: Record<string, never>;
  pages: {
    dashboard: DashboardUXTree;
    devices: DevicesUXTree;
    logic: LogicUXTree;
  };
};

export type AppUXState = URLTreeState<AppUXTree>;
export type DashboardUXState = URLTreeState<DashboardUXTree>;
export type DevicesUXState = URLTreeState<DevicesUXTree>;
export type LogicUXState = URLTreeState<LogicUXTree>;

export const appTree = new TreeStore<AppUXTree>();
