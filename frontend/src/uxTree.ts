import TreeStore from './lib/TreeStore';
import type { URLTreeState, UXTreeDefinition } from './lib/TreeStore';

export type TabName = 'dashboard' | 'instances' | 'logic' | 'measurements' | 'devices';

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
    showInputForm: number | 'new' | null;
    showBlockForm: number | 'new' | null;
    showOutputForm: number | 'new' | null;
  };
};

export type InstancesUXTree = {
  data: {
    selectedInstanceId: number | null;
    showInstanceForm: boolean;
  };
};

export type MeasurementsUXTree = {
  data: {
    selectedMeasurementId: number | null;
    sourceFilter: { logic_instance_id: number; logic_input_id?: number; logic_output_id?: number } | null;
  };
};

export type AppUXTree = UXTreeDefinition & {
  data: Record<string, never>;
  pages: {
    dashboard: DashboardUXTree;
    instances: InstancesUXTree;
    devices: DevicesUXTree;
    logic: LogicUXTree;
    measurements: MeasurementsUXTree;
  };
};

export type AppUXState = URLTreeState<AppUXTree>;
export type DashboardUXState = URLTreeState<DashboardUXTree>;
export type DevicesUXState = URLTreeState<DevicesUXTree>;
export type InstancesUXState = URLTreeState<InstancesUXTree>;
export type LogicUXState = URLTreeState<LogicUXTree>;
export type MeasurementsUXState = URLTreeState<MeasurementsUXTree>;

export const appTree = new TreeStore<AppUXTree>();
