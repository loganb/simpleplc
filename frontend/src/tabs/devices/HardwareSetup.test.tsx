// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
// The store builds its HTTP client with axios.create(); hand it this fake. Components never see it.
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('axios', () => ({ default: { create: () => api } }));
import { Store } from '../../store';
import type { DeviceFields, DeviceScanFields, HostInterfaceFields, LogicInputBindingFields } from '../../store';
import type { ReifiedQueryResult } from '../../lib/RestfulModelStore';
import { InterfaceEditor } from './HardwareForms';
import { DeviceForm } from './DeviceForm';
import { DeviceScanPanel } from './DeviceScanPanel';
import { HostInterfaceCard } from './HostInterfaceCard';
const bus = { id: 1, name: 'Bus', port: '/dev/missing', baud_rate: 9600, data_bits: 8, stop_bits: 1, parity: 'none', enabled: false, port_present: true,
  connection_state: 'disabled', connection_error: null } as unknown as HostInterfaceFields;
const scanOf = (fields: Partial<DeviceScanFields> = {}): DeviceScanFields => ({
  id: 9, host_interface_id: 1, first_address: 1, last_address: 247, state: 'done', completed: 247, total: 247, error: null,
  started_at: null, finished_at: null, results: [
    { address: 1, observed_at: new Date().toISOString(), driver_support: [
      { driver: 'relay', support: 'maybe', reason: 'Binary registers', evidence: [{ kind: 'holding_registers', address: 0, status: 'ok', values: [0] }] },
      { driver: 'ntc', support: 'no', reason: 'Different ID', evidence: [{ kind: 'holding_registers', address: 247, status: 'ok', values: [2532] }] },
    ] },
  ], ...fields });
const drivers = [
  { id: 'relay', name: 'Relay board', channel_count: 2, fields: ['inputs', 'outputs'], binary_outputs: true, configuration_effects: 'None',
    inputs: [{ path: 'inputs[0]', label: 'Input 1', value_type: 'boolean', units: null }, { path: 'inputs[1]', label: 'Input 2', value_type: 'boolean', units: null }],
    outputs: [{ channel: 1, label: 'Relay 1', value_type: 'boolean', units: null }, { channel: 2, label: 'Relay 2', value_type: 'boolean', units: null }] },
  { id: 'counter', name: 'Pulse counter', channel_count: 2, fields: ['counts'], binary_outputs: false, configuration_effects: 'None', inputs: [], outputs: [],
    settings: [{ key: 'address', label: 'Module address', type: 'integer', min: 1, max: 247, requires_power_cycle: true },
      { key: 'pull_up', label: 'Input pull-up', type: 'boolean', requires_power_cycle: false }] },
  { id: 'ntc', name: 'NTC board', channel_count: 1, fields: ['temperatures'], binary_outputs: false, configuration_effects: 'None', inputs: [], outputs: [] },
];
const relayDevice = { id: 3, name: 'Relay', host_interface_id: 1, modbus_address: 3, driver: 'relay',   io_labels: { inputs: { 'inputs[0]': 'Boiler enable' }, outputs: {} }, inputs: drivers[0].inputs, outputs: drivers[0].outputs } as unknown as DeviceFields;
const counterDevice = { id: 4, name: 'Flow', host_interface_id: 1, modbus_address: 2, driver: 'counter',   io_labels: {}, settings: { pull_up: true }, inputs: [], outputs: [] } as unknown as DeviceFields;
const interfaces = Object.assign([{ ...bus, _found: true }], { _loaded: true }) as unknown as ReifiedQueryResult<HostInterfaceFields>;
let current: { bus: HostInterfaceFields; inputBindings: Partial<LogicInputBindingFields>[]; scans: DeviceScanFields[] };
const index = <T extends { id: unknown },>(plural: string, rows: T[]) => ({ [plural]: rows, query: rows.map(r => r.id) });
beforeEach(() => {
  Store.models = {}; // Fresh caches per test; models are recreated lazily by Store.m().
  current = { bus, inputBindings: [], scans: [] };
  for (const method of [api.post, api.patch, api.delete]) method.mockReset().mockResolvedValue({ data: {} });
  api.get.mockReset().mockImplementation(async (url: string) => ({ data:
    url.startsWith('/drivers.json') ? index('drivers', drivers) :
    url.startsWith('/host_ports.json') ? index('host_ports', []) :
    url.startsWith('/device_scans.json') ? index('device_scans', current.scans) :
    url.startsWith('/logic_input_bindings.json') ? index('logic_input_bindings', current.inputBindings as { id: number }[]) :
    url.startsWith('/logic_output_bindings.json') ? index('logic_output_bindings', []) :
    url.startsWith('/logic_inputs.json') ? index('logic_inputs', [{ id: 12, name: 'Supply temp' }]) :
    url.startsWith('/logic_outputs.json') ? index('logic_outputs', []) :
    url.startsWith('/logic_instances.json') ? index('logic_instances', [{ id: 2, name: 'Boiler room' }]) :
    url.startsWith('/devices.json') ? index('devices', [relayDevice]) :
    url.startsWith('/devices/3') ? { devices: [relayDevice] } :
    url === '/host_interfaces/1' ? { host_interfaces: [current.bus] } : {} }));
});
afterEach(cleanup);
const conflict = { response: { status: 409, data: { errors: { base: ['Configuration changed'] } } } };

describe('hardware editors', () => {
  it('closes the Device modal with Escape', async () => {
    const close = vi.fn();
    render(<DeviceForm editId={3} interfaces={interfaces} onClose={close} onRefresh={vi.fn()} />);
    await screen.findByRole('dialog', { name: 'Edit Device' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
  });

  it('edits custom I/O labels in a modal and submits only overrides', async () => {
    const close = vi.fn();
    render(<DeviceForm editId={3} interfaces={interfaces} onClose={close} onRefresh={vi.fn()} />);
    expect((await screen.findByLabelText('Custom label for Input 1') as HTMLInputElement).value).toBe('Boiler enable');
    expect((screen.getByLabelText('Custom label for Relay 1') as HTMLInputElement).placeholder).toBe('Relay 1');
    fireEvent.input(screen.getByLabelText('Custom label for Input 1'), { target: { value: '' } });
    fireEvent.input(screen.getByLabelText('Custom label for Relay 2'), { target: { value: 'Alarm relay' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(api.patch).toHaveBeenCalledWith('/devices/3', {
      device: expect.objectContaining({ io_labels: { outputs: { '2': 'Alarm relay' } } }),
    }, expect.anything());
  });

  it('edits driver settings, leaving blank ones unmanaged', async () => {
    api.get.mockImplementation(async (url: string) => ({ data: url.startsWith('/drivers.json') ? index('drivers', drivers)
      : url.startsWith('/devices/4') ? { devices: [counterDevice] } : index('devices', [counterDevice]) }));
    const close = vi.fn();
    render(<DeviceForm editId={4} interfaces={interfaces} onClose={close} onRefresh={vi.fn()} />);
    expect(await screen.findByText('power cycle required')).toBeTruthy();
    expect((screen.getByLabelText(/Input pull-up/) as HTMLSelectElement).value).toBe('true');
    fireEvent.input(screen.getByLabelText(/Module address/), { target: { value: '9' } });
    await waitFor(() => expect((screen.getByLabelText(/Module address/) as HTMLInputElement).value).toBe('9'));
    const pullUp = screen.getByLabelText(/Input pull-up/) as HTMLSelectElement;
    pullUp.value = ''; // fireEvent.change would send `input` here; see the scan-result test below.
    fireEvent(pullUp, new Event('change', { bubbles: true }));
    await waitFor(() => expect((screen.getByLabelText(/Input pull-up/) as HTMLSelectElement).value).toBe(''));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(api.patch).toHaveBeenCalledWith('/devices/4', {
      device: expect.objectContaining({ settings: { address: 9 } }),
    }, expect.anything());
  });

  it('keeps the draft and reports a failed save', async () => {
    const close = vi.fn();
    render(<InterfaceEditor editId={1} onClose={close} onRefresh={vi.fn()} />);
    const name = await screen.findByLabelText('Name');
    fireEvent.input(name, { target: { value: 'My draft' } });
    api.patch.mockRejectedValue(conflict);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Configuration changed');
    const [, body] = api.patch.mock.calls[api.patch.mock.calls.length - 1];
    expect(body.host_interface).toMatchObject({ name: 'My draft' });
    expect((name as HTMLInputElement).value).toBe('My draft');
    expect(close).not.toHaveBeenCalled();
  });

  it('waits for deletion and keeps the form visible on failure', async () => {
    const close = vi.fn();
    render(<InterfaceEditor editId={1} onClose={close} onRefresh={vi.fn()} />);
    await screen.findByLabelText('Name');
    fireEvent.click(screen.getByRole('button', { name: 'Review deletion' }));
    await screen.findByRole('button', { name: 'Confirm deletion' });
    api.delete.mockRejectedValue({ response: { status: 409, data: { errors: { base: ['New dependency exists'] } } } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));
    await screen.findByText('New dependency exists');
    expect(close).not.toHaveBeenCalled();
    expect(api.delete).toHaveBeenCalledWith('/host_interfaces/1.json');
  });

  it('shows what depends on the bus devices and offers no deletion while they do', async () => {
    current.inputBindings = [{ id: 5, device_id: 3, logic_instance_id: 2, logic_input_id: 12 }];
    render(<InterfaceEditor editId={1} onClose={vi.fn()} onRefresh={vi.fn()} />);
    await screen.findByLabelText('Name');
    fireEvent.click(screen.getByRole('button', { name: 'Review deletion' }));
    await screen.findByText('Boiler room · Supply temp — open instance');
    expect(screen.getByText('Reassign or remove these connections in Instances before deleting.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm deletion' })).toBeNull();
  });
});

describe('device scanning', () => {
  it('shows range inputs, starts a scan by creating one, and shows progress with cancel', async () => {
    const view = render(<DeviceScanPanel iface={bus} devices={[]} onRefresh={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Scan for devices' }));
    fireEvent.input(screen.getByLabelText('Last address'), { target: { value: '40' } });
    await waitFor(() => expect((screen.getByLabelText('Last address') as HTMLInputElement).value).toBe('40'));
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/device_scans.json',
      { device_scan: { host_interface_id: 1, first_address: 1, last_address: 40 } }, expect.anything()));
    view.unmount();
    current.scans = [scanOf({ state: 'running', completed: 10, total: 40, results: [] })];
    render(<DeviceScanPanel iface={bus} devices={[]} onRefresh={vi.fn()} />);
    await screen.findByText('Scanning 10/40');
    expect((screen.getByLabelText('Scan progress') as HTMLProgressElement).value).toBe(10);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel scan' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/device_scans/9', { device_scan: { state: 'cancelled' } }, expect.anything()));
  });

  it('says it is waiting for the poller while a scan is pending', async () => {
    current.scans = [scanOf({ state: 'pending', completed: 0, results: [] })];
    render(<DeviceScanPanel iface={bus} devices={[]} onRefresh={vi.fn()} />);
    await screen.findByText('Waiting for the poller…');
    expect(screen.queryByRole('button', { name: 'Scan for devices' })).toBeNull();
  });

  it('explains that the bus must be disabled and offers no scan while it is enabled', async () => {
    render(<DeviceScanPanel iface={{ ...bus, enabled: true, connection_state: 'online' } as HostInterfaceFields} devices={[]} onRefresh={vi.fn()} />);
    expect((await screen.findByRole('button', { name: 'Scan for devices' }) as HTMLButtonElement).disabled).toBe(true);
    screen.getByText('Disable the bus to scan.');
  });

  it('reports a rejected scan request', async () => {
    api.post.mockRejectedValue({ response: { status: 422, data: { errors: { base: ['A scan is already pending or running'] } } } });
    render(<DeviceScanPanel iface={bus} devices={[]} onRefresh={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Scan for devices' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await screen.findByText('A scan is already pending or running');
  });

  it('says what to check when nothing responded', async () => {
    current.scans = [scanOf({ results: [] })];
    render(<DeviceScanPanel iface={bus} devices={[]} onRefresh={vi.fn()} />);
    await screen.findByText(/No devices responded at 9600 baud, 8\/none\/1\. Check wiring, power and serial settings\./);
  });

  it('says why a scan failed', async () => {
    current.scans = [scanOf({ state: 'failed', error: 'Poller restarted', results: [] })];
    render(<DeviceScanPanel iface={bus} devices={[]} onRefresh={vi.fn()} />);
    await screen.findByText('Scan failed: Poller restarted');
  });

  it('preselects the best driver, disables ruled-out ones, and adds a new device', async () => {
    current.scans = [scanOf()];
    const refresh = vi.fn();
    render(<DeviceScanPanel iface={bus} devices={[]} onRefresh={refresh} />);
    const driver = await screen.findByLabelText('Driver') as HTMLSelectElement;
    await waitFor(() => expect(driver.value).toBe('relay'));
    expect((screen.getByRole('option', { name: /NTC board/ }) as HTMLOptionElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Add as new device' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith('/devices.json',
      { device: { host_interface_id: 1, name: 'Device at 1', driver: 'relay', modbus_address: 1 } }, expect.anything());
  });

  it('leaves the driver unselected when every driver was ruled out', async () => {
    const result = scanOf().results[0];
    current.scans = [scanOf({ results: [{ ...result, driver_support: result.driver_support.map(v => ({ ...v, support: 'no' as const })) }] })];
    render(<DeviceScanPanel iface={bus} devices={[]} onRefresh={vi.fn()} />);
    expect(((await screen.findByLabelText('Driver')) as HTMLSelectElement).value).toBe('');
    expect((screen.getByRole('button', { name: 'Add as new device' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('points an existing device at a scan result by patching it', async () => {
    current.scans = [scanOf()];
    render(<DeviceScanPanel iface={bus} devices={[{ ...relayDevice, modbus_address: 7 }]} onRefresh={vi.fn()} />);
    // Not fireEvent.change: with preact/compat loaded it sends `input`, but a <select>'s onChange listens for `change`.
    const useAs = await screen.findByLabelText('Use as') as HTMLSelectElement;
    useAs.value = '3';
    fireEvent(useAs, new Event('change', { bubbles: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use for device #3' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/devices/3',
      { device: { driver: 'relay', modbus_address: 1 } }, expect.anything()));
  });

  it('shows an address that is already configured instead of an add form, warning when the evidence disagrees', async () => {
    const result = scanOf().results[0];
    current.scans = [scanOf({ results: [{ ...result, driver_support: [
      { driver: 'relay', support: 'yes', reason: 'Matches', evidence: [] }, { driver: 'ntc', support: 'no', reason: 'Different ID', evidence: [] },
    ] }] })];
    const mine = { ...relayDevice, modbus_address: 1, driver: 'ntc' } as DeviceFields;
    const view = render(<DeviceScanPanel iface={bus} devices={[mine]} onRefresh={vi.fn()} />);
    await screen.findByText(/Configured as/);
    expect(screen.queryByRole('button', { name: 'Add as new device' })).toBeNull();
    screen.getByText(/disagrees with this driver; it looks more like Relay board/);
    view.unmount();
    render(<DeviceScanPanel iface={bus} devices={[{ ...mine, driver: 'relay' }]} onRefresh={vi.fn()} />);
    await screen.findByText(/Configured as/);
    expect(screen.queryByText(/disagrees/)).toBeNull();
  });

  it('explains the verdicts and the registers read in words', async () => {
    current.scans = [scanOf()];
    render(<DeviceScanPanel iface={bus} devices={[]} onRefresh={vi.fn()} />);
    await screen.findByText('Why?');
    screen.getByText('Binary registers');
    screen.getByText('Holding register 247: ok, value 2532');
  });
});

describe('interface card', () => {
  it('enables a disabled bus with one plain patch', async () => {
    const refresh = vi.fn();
    render(<HostInterfaceCard iface={bus} devices={[]} onEdit={vi.fn()} onRefresh={refresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(api.patch).toHaveBeenCalledWith('/host_interfaces/1', { host_interface: { enabled: true } }, expect.anything());
  });

  it('disables a running bus with one plain patch', async () => {
    const enabled = { ...bus, enabled: true, connection_state: 'online' } as HostInterfaceFields;
    render(<HostInterfaceCard iface={enabled} devices={[]} onEdit={vi.fn()} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/host_interfaces/1', { host_interface: { enabled: false } }, expect.anything()));
  });

  it('reports the server refusing to enable a bus that is scanning', async () => {
    api.patch.mockRejectedValue({ response: { status: 422, data: { errors: { enabled: ["can't be turned on while a scan is pending or running; cancel the scan first"] } } } });
    render(<HostInterfaceCard iface={bus} devices={[]} onEdit={vi.fn()} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable' }));
    await screen.findByText(/cancel the scan first/);
  });

  it('shows the connection state, disabled immediately', () => {
    render(<HostInterfaceCard iface={bus} devices={[]} onEdit={vi.fn()} onRefresh={vi.fn()} />);
    screen.getByText('disabled');
  });
});
