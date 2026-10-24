import axios from 'axios';
import { createConsumer } from '@rails/actioncable';
import RecordStream from './lib/RecordStream';
import RestfulModelStore from './lib/RestfulModelStore';
import type { ModelDefinition } from './lib/RestfulModelStore';

export function developmentApiBase(pageUrl: string | undefined) {
  const url = new URL(pageUrl ?? 'http://localhost');
  url.port = '3000';
  return url.origin;
}

// Production injects an empty same-origin override. In development, keep the
// page's hostname so a browser reaching the UI over LAN/Tailscale reaches the
// API on that same controller rather than its own localhost.
const API_BASE = (globalThis as Record<string, unknown>).PLC_API_BASE as string
  ?? developmentApiBase(globalThis.location?.href);

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
  io_labels: DeviceIoLabels;
  /** Desired driver settings; a key that is absent is unmanaged by the driver. */
  settings: DeviceSettings;
  inputs: DeviceInput[];
  outputs: DeviceOutput[];
}

export interface DeviceIoLabels {
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
}

export interface DeviceInput {
  path: string;
  label: string;
  value_type: 'boolean' | 'number';
  units: string | null;
}

export interface DeviceOutput {
  channel: number;
  label: string;
  value_type: 'boolean';
  units: string | null;
}

export const Device: ModelDefinition<DeviceFields> = {
  name: 'device',
  inflections: { plural: 'devices', title: 'Device' },
  singleton: false,
};

export type DeviceSettings = Record<string, number | boolean>;
export interface DriverSetting {
  key: string; label: string; type: 'boolean' | 'integer'; min?: number; max?: number;
  requires_power_cycle: boolean; help?: string;
}

export interface DriverFields {
  id: string; name: string; channel_count: number; fields: string[];
  binary_outputs: boolean; configuration_effects: string; settings: DriverSetting[];
  inputs: DeviceInput[]; outputs: DeviceOutput[];
}

/** Read-only catalog of supported drivers. `id` is the stored driver key, e.g. "Drivers::N4D8B08". */
export const Driver: ModelDefinition<DriverFields> = {
  name: 'driver',
  inflections: { plural: 'drivers', title: 'Driver' },
  singleton: false,
};
/** One register read a scan made, and what came back. */
export interface ProbeEvidence {
  kind: string; address: number | [number, number]; status: string; values?: number | number[]; error?: string;
}
export interface DriverSupport { driver: string; support: 'yes' | 'no' | 'maybe'; reason: string; evidence: ProbeEvidence[] }
export interface ScanResult { address: number; observed_at: string; driver_support: DriverSupport[] }
export interface HostInterfaceFields {
  id: number;
  name: string;
  port: string;
  baud_rate: number;
  data_bits: number;
  stop_bits: number;
  parity: string;
  /** Seconds between hardware reads and output writes on this bus. */
  update_period: number;
  /** Operator intent: should the poller open this bus at all. Writable from here. */
  enabled: boolean;
  /** Whether `port` currently resolves on the host — false means the bus is missing. */
  port_present: boolean;
  /** Device node `port` resolves to, e.g. "/dev/ttyUSB0". Null when missing. */
  resolved_device: string | null;
  /**
   * `enabled` folded together with the poller's report and how fresh it is.
   * Read-only: only the poller can say a port is held open.
   *
   * - `online` — the poller is holding the port open right now
   * - `offline` — the poller is reporting and is not holding the port
   * - `disabled` — the operator turned the bus off; the poller releases the port within a cycle
   * - `unknown` — no recent report; the poller is down or has never seen this bus
   */
  connection_state: 'online' | 'offline' | 'disabled' | 'unknown';
  /** Why the port isn't open, when it isn't. Null otherwise. */
  connection_error: string | null;
  /** When the poller last reported on this bus. Null before it ever has. */
  poller_reported_at: string | null;
}

export const HostInterface: ModelDefinition<HostInterfaceFields> = {
  name: 'host_interface',
  inflections: { plural: 'host_interfaces', title: 'HostInterface' },
  singleton: false,
};

/**
 * One sweep of a bus's address range, run by the poller. Start with `create`
 * (the bus must be disabled); cancel by patching `state` to 'cancelled'. That is
 * the only client-writable field after create; the rest is the poller's report.
 */
export interface DeviceScanFields {
  id: number;
  host_interface_id: number;
  first_address: number;
  last_address: number;
  state: 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
  completed: number;
  total: number;
  results: ScanResult[];
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export const DeviceScan: ModelDefinition<DeviceScanFields> = {
  name: 'device_scan',
  inflections: { plural: 'device_scans', title: 'DeviceScan' },
  singleton: false,
};

/**
 * A serial port discovered on the host. Read-only: the backend re-scans on
 * every request, so these are never created or edited from here.
 *
 * `id` is an opaque base64url token produced by the server from `stable_path`.
 * Treat it as opaque — never parse or construct one client-side.
 */
export interface HostPortFields {
  id: string;
  /** sysfs name, e.g. "ttyUSB0". Display only — assigned in enumeration order. */
  tty: string;
  device: string;
  by_id: string | null;
  by_path: string | null;
  /** The path to configure on a HostInterface: by_id || by_path || device. */
  stable_path: string;
  /** Which source stable_path came from; the three differ in what they survive. */
  identity_basis: 'by_id' | 'by_path' | 'device';
  label: string;
  kernel_driver: string | null;
  usb_vendor_id: string | null;
  usb_product_id: string | null;
  usb_manufacturer: string | null;
  usb_product: string | null;
  usb_serial: string | null;
  /** True when the kernel uses this tty as a console — selecting it is a bad idea. */
  console: boolean;
  /** Id of the HostInterface already using this port, or null if unclaimed. */
  host_interface_id: number | null;
}

export const HostPort: ModelDefinition<HostPortFields> = {
  name: 'host_port',
  inflections: { plural: 'host_ports', title: 'HostPort' },
  singleton: false,
};

export type LogicValueType = 'boolean' | 'number';

export interface LogicInputFields {
  id: number;
  logic_diagram_id: number;
  name: string;
  value_type: LogicValueType;
  units: string | null;
  created_at: string;
  updated_at: string;
}

export const LogicInput: ModelDefinition<LogicInputFields> = {
  name: 'logic_input',
  inflections: { plural: 'logic_inputs', title: 'LogicInput' },
  singleton: false,
};

export interface LogicDiagramFields {
  id: number;
  name: string;
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
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface HysteresisLogicBlockFields extends BaseLogicBlockFields {
  type: 'HysteresisLogicBlock';
  block_type: 'hysteresis';
}

export interface LatchLogicBlockFields extends BaseLogicBlockFields {
  type: 'LatchLogicBlock';
  block_type: 'latch';
}

export interface TimerCounterLogicBlockFields extends BaseLogicBlockFields {
  type: 'TimerCounterLogicBlock';
  block_type: 'timer_counter';
}

export interface ExpressionLogicBlockFields extends BaseLogicBlockFields {
  type: 'ExpressionLogicBlock';
  block_type: 'expression';
}

export type LogicBlockFields =
  | HysteresisLogicBlockFields
  | LatchLogicBlockFields
  | TimerCounterLogicBlockFields
  | ExpressionLogicBlockFields;

export const LogicBlock: ModelDefinition<LogicBlockFields> = {
  name: 'logic_block',
  inflections: { plural: 'logic_blocks', title: 'LogicBlock' },
  singleton: false,
};

export interface LogicOutputFields {
  id: number;
  logic_diagram_id: number;
  name: string;
  value_type: LogicValueType;
  units: string | null;
  input_expression: string;
  created_at: string;
  updated_at: string;
}

export const LogicOutput: ModelDefinition<LogicOutputFields> = {
  name: 'logic_output',
  inflections: { plural: 'logic_outputs', title: 'LogicOutput' },
  singleton: false,
};

export interface LogicInstanceFields {
  id: number;
  logic_diagram_id: number;
  name: string;
  update_period: number;
  output_enable: boolean;
  created_at: string;
  updated_at: string;
}

export const LogicInstance: ModelDefinition<LogicInstanceFields> = {
  name: 'logic_instance',
  inflections: { plural: 'logic_instances', title: 'LogicInstance' },
  singleton: false,
};

export interface LogicInputBindingFields {
  id: number;
  logic_instance_id: number;
  logic_input_id: number;
  source_kind: 'device_input' | 'fixed_value';
  device_id: number | null;
  source_path: string | null;
  fixed_value: number | boolean | null;
  latest_value: number | boolean | null;
  created_at: string;
  updated_at: string;
}

export const LogicInputBinding: ModelDefinition<LogicInputBindingFields> = {
  name: 'logic_input_binding',
  inflections: { plural: 'logic_input_bindings', title: 'LogicInputBinding' },
  singleton: false,
};

export interface LogicOutputBindingFields {
  id: number;
  logic_instance_id: number;
  logic_output_id: number;
  target_kind: 'device_output';
  device_id: number;
  channel: number;
  output_enable: boolean;
  latest_value: number | boolean | null;
  latest_state: Record<string, unknown> | null;
  desired_output: boolean | null;
  effective_output: boolean | null;
  write_pending: boolean;
  created_at: string;
  updated_at: string;
}

export const LogicOutputBinding: ModelDefinition<LogicOutputBindingFields> = {
  name: 'logic_output_binding',
  inflections: { plural: 'logic_output_bindings', title: 'LogicOutputBinding' },
  singleton: false,
};

export interface TraceFields {
  id: number;
  logic_instance_id: number;
  results: {
    schema_version: number;
    logic_inputs: Record<string, TraceResult>;
    logic_blocks: Record<string, TraceResult>;
    logic_outputs: Record<string, TraceResult>;
  };
  recorded_at: string;
  created_at: string;
  updated_at: string;
}

export interface TraceResult {
  id: number;
  name: string;
  type?: string;
  value: number | boolean | null;
  state: Record<string, unknown>;
  input_values: Record<string, unknown>;
  recorded_at: string;
}

export const Trace: ModelDefinition<TraceFields> = {
  name: 'trace',
  inflections: { plural: 'traces', title: 'Trace' },
  singleton: false,
};

// Per-source statistics for one minute; see Logic::TraceRollupBuilder.
export interface TraceRollupStats {
  null_count: number;
  count?: number;
  last?: number | boolean;
  min?: number;
  max?: number;
  mean?: number;
  true_fraction?: number;
  transitions?: number;
}

// Read-only history: query with logic_instance_id and optional since/until.
export interface TraceRollupFields {
  id: number;
  logic_instance_id: number;
  bucket_start: string;
  sample_count: number;
  results: {
    schema_version: number;
    logic_inputs: Record<string, TraceRollupStats>;
    logic_blocks: Record<string, TraceRollupStats>;
    logic_outputs: Record<string, TraceRollupStats>;
  };
}

export const TraceRollup: ModelDefinition<TraceRollupFields> = {
  name: 'trace_rollup',
  inflections: { plural: 'trace_rollups', title: 'TraceRollup' },
  singleton: false,
};

// Open the connection with the mounted app, not merely by importing model definitions.
export function connectLiveRecords() {
  const cableUrl = new URL('/cable', new URL(API_BASE, window.location.href));
  cableUrl.protocol = cableUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  return new RecordStream(Store, createConsumer(cableUrl.toString()));
}

// The axios client stays private: all server I/O goes through Store.
export { Store };
