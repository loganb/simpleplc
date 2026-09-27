import axios from 'axios';
import { createConsumer } from '@rails/actioncable';
import RecordStream from './lib/RecordStream';
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
  configuration_revision: number;
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

export interface DriverFields {
  id: string; name: string; channel_count: number; fields: string[];
  binary_outputs: boolean; configuration_effects: string;
}
export interface SerialProfile { baud_rate: number; data_bits: number; stop_bits: number; parity: string }
export interface DriverSupport { driver: string; support: 'yes' | 'no' | 'maybe'; reason: string; evidence: unknown[] }
export interface ScanDevice { address: number; profile_index: number; profile: SerialProfile; observed_at: string; driver_support: DriverSupport[] }
export interface HostInterfaceFields {
  configuration_revision: number;
  scan_state: 'idle' | 'requested' | 'scanning' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  scan_request_id: string | null;
  scan_options: { port?: string; profiles?: SerialProfile[]; first_address?: number; last_address?: number };
  scan_results: { completed?: number; total?: number; devices?: ScanDevice[]; error?: string; diagnostics?: unknown[] };
  scan_cancel_requested: boolean;
  scan_requested_at: string | null;
  scan_started_at: string | null;
  scan_finished_at: string | null;
  scan_updated_at: string | null;
  id: number;
  name: string;
  port: string;
  baud_rate: number;
  data_bits: number;
  stop_bits: number;
  parity: string;
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
   * - `releasing` — disabled, but the poller still has the port
   * - `disabled` — disabled and the port is free
   * - `unknown` — no recent report; the poller is down or has never seen this bus
   */
  connection_state: 'online' | 'offline' | 'releasing' | 'disabled' | 'unknown';
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

// Open the connection with the mounted app, not merely by importing model definitions.
export function connectLiveRecords() {
  const cableUrl = new URL('/cable', new URL(API_BASE, window.location.href));
  cableUrl.protocol = cableUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  return new RecordStream(Store, createConsumer(cableUrl.toString()));
}

export { AxiosClient, Store };
