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
  name: string;
  source_type: string;
  device_id: number | null;
  source_path: string | null;
  update_period: number;
  units: string | null;
  created_at: string;
  updated_at: string;
}

export const Measurement: ModelDefinition<MeasurementFields> = {
  name: 'measurement',
  inflections: { plural: 'measurements', title: 'Measurement' },
  singleton: false,
};

export interface MeasurementDatumFields {
  id: number;
  measurement_id: number;
  value: number | null;
  recorded_at: string;
}

export const MeasurementDatum: ModelDefinition<MeasurementDatumFields> = {
  name: 'measurement_datum',
  inflections: { plural: 'measurement_data', title: 'MeasurementDatum' },
  singleton: false,
};

export { AxiosClient, Store };
