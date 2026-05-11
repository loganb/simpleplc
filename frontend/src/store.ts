import axios from 'axios';
import RestfulModelStore from './lib/RestfulModelStore';
import type { ModelDefinition } from './lib/RestfulModelStore';

// In production, override via the global. In dev, hit localhost Rails.
const API_BASE = (globalThis as Record<string, unknown>).PLC_API_BASE as string
  ?? 'http://localhost:3000';

const AxiosClient = axios.create({
  baseURL: API_BASE,
  headers: { Accept: 'application/json' },
});

const Store = new RestfulModelStore(AxiosClient, {
  cacheEpochIntervalMs: 5 * 60 * 1000,
});

// ---------------------------------------------------------------------------
// Model Definitions
// ---------------------------------------------------------------------------

export interface DeviceFields {
  id: number;
  name: string;
  modbus_address: number;
  driver: string;
  host_interface_id: number;
  last_polled_at: string | null;
  current_state: {
    polled_at: string;
    status: string;
    error: string | null;
    data: Record<string, unknown>;
  } | null;
}

export const Device: ModelDefinition<DeviceFields> = {
  name: 'device',
  inflections: { plural: 'devices', title: 'Device' },
  singleton: false,
};

export interface HostInterfaceFields {
  id: number;
  port: string;
  baud_rate: number;
  data_bits: number;
  stop_bits: number;
  parity: string;
}

export const HostInterface: ModelDefinition<HostInterfaceFields> = {
  name: 'host_interface',
  inflections: { plural: 'host_interfaces', title: 'HostInterface' },
  singleton: false,
};

export interface MeasurementFields {
  id: number;
  logic_diagram_id: number;
  name: string;
  mode: 'acquisition' | 'simulation';
  device_id: number | null;
  source_path: string | null;
  units: string | null;
  simulation_value: number | null;
  latest_value: number | null;
  created_at: string;
  updated_at: string;
}

export const Measurement: ModelDefinition<MeasurementFields> = {
  name: 'measurement',
  inflections: { plural: 'measurements', title: 'Measurement' },
  singleton: false,
};

export interface LogicDiagramFields {
  id: number;
  name: string;
  update_period: number;
  output_enable: boolean;
  created_at: string;
  updated_at: string;
}

export const LogicDiagram: ModelDefinition<LogicDiagramFields> = {
  name: 'logic_diagram',
  inflections: { plural: 'logic_diagrams', title: 'LogicDiagram' },
  singleton: false,
};

export interface BaseLogicBlockFields {
  id: number;
  logic_diagram_id: number;
  name: string;
  stratum: number;
  input_expressions: Record<string, string>;
  config: Record<string, unknown>;
  latest_value: number | null;
  latest_state: Record<string, unknown> | null;
  output: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface HysteresisLogicBlockFields extends BaseLogicBlockFields {
  type: 'HysteresisLogicBlock';
  block_type: 'hysteresis';
  value: number | null;
  low_limit: number | null;
  high_limit: number | null;
}

export interface LatchLogicBlockFields extends BaseLogicBlockFields {
  type: 'LatchLogicBlock';
  block_type: 'latch';
  set: boolean | null;
  reset: boolean | null;
}

export type LogicBlockFields = HysteresisLogicBlockFields | LatchLogicBlockFields;

export const LogicBlock: ModelDefinition<LogicBlockFields> = {
  name: 'logic_block',
  inflections: { plural: 'logic_blocks', title: 'LogicBlock' },
  singleton: false,
};

export interface OutputBlockFields {
  id: number;
  logic_diagram_id: number;
  name: string;
  device_id: number;
  channel: number;
  input_expression: string;
  output_enable: boolean;
  latest_value: number | null;
  latest_state: Record<string, unknown> | null;
  desired_output: boolean | null;
  effective_output: boolean | null;
  write_pending: boolean | null;
  created_at: string;
  updated_at: string;
}

export const OutputBlock: ModelDefinition<OutputBlockFields> = {
  name: 'output_block',
  inflections: { plural: 'output_blocks', title: 'OutputBlock' },
  singleton: false,
};

export interface TraceFields {
  id: number;
  logic_diagram_id: number;
  results: {
    schema_version: number;
    measurements: Record<string, TraceResult>;
    logic_blocks: Record<string, TraceResult>;
    output_blocks: Record<string, TraceResult>;
  };
  recorded_at: string;
  created_at: string;
  updated_at: string;
}

export interface TraceResult {
  id: number;
  name: string;
  type?: string;
  value: number | null;
  state: Record<string, unknown>;
  input_values: Record<string, unknown>;
  recorded_at: string;
}

export const Trace: ModelDefinition<TraceFields> = {
  name: 'trace',
  inflections: { plural: 'traces', title: 'Trace' },
  singleton: false,
};

export { AxiosClient, Store };
