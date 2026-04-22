import axios from 'axios';
import RestfulModelStore from './lib/RestfulModelStore';
import type { ModelDefinition } from './lib/RestfulModelStore';

const AxiosClient = axios.create({
  baseURL: '',
  headers: { Accept: 'application/json' }
});

const Store = new RestfulModelStore(AxiosClient);

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
  singleton: false
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
  singleton: false
};

export { AxiosClient, Store };
