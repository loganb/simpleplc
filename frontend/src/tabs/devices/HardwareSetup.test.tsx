// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
// The store builds its HTTP client with axios.create(); hand it this fake. Components never see it.
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('axios', () => ({ default: { create: () => api } }));
import { Store } from '../../store';
import type { DeviceFields, HostInterfaceFields, MeasurementFields } from '../../store';
import type { ReifiedQueryResult } from '../../lib/RestfulModelStore';
import { InterfaceEditor } from './HardwareForms';
import { DeviceForm } from './DeviceForm';
import { DeviceScanPanel } from './DeviceScanPanel';
import { HostInterfaceCard } from './HostInterfaceCard';
const profile = { baud_rate: 9600, data_bits: 8, stop_bits: 1, parity: 'none' };
const bus = { id: 1, name: 'Bus', port: '/dev/missing', ...profile, enabled: false,
  configuration_revision: 4, scan_state: 'completed', scan_request_id: 'scan-a', scan_options: {}, scan_results: { completed: 1, total: 1, devices: [
    { address: 1, profile_index: 0, profile, observed_at: new Date().toISOString(), driver_support: [
      { driver: 'relay', support: 'maybe', reason: 'Binary registers', evidence: [] }, { driver: 'ntc', support: 'no', reason: 'Different ID', evidence: [] },
    ] },
  ] }, connection_state: 'disabled', connection_error: null } as unknown as HostInterfaceFields;
const drivers = [
  { id: 'relay', name: 'Relay board', channel_count: 2, fields: ['inputs', 'outputs'], binary_outputs: true, configuration_effects: 'None',
    inputs: [{ path: 'inputs[0]', label: 'Input 1', value_type: 'boolean', units: null }, { path: 'inputs[1]', label: 'Input 2', value_type: 'boolean', units: null }],
    outputs: [{ channel: 1, label: 'Relay 1', value_type: 'boolean', units: null }, { channel: 2, label: 'Relay 2', value_type: 'boolean', units: null }] },
  { id: 'ntc', name: 'NTC board', channel_count: 1, fields: ['temperatures'], binary_outputs: false, configuration_effects: 'None', inputs: [], outputs: [] },
];
const relayDevice = { id: 3, name: 'Relay', host_interface_id: 1, modbus_address: 3, driver: 'relay', configuration_revision: 7,
  io_labels: { inputs: { 'inputs[0]': 'Boiler enable' }, outputs: {} }, inputs: drivers[0].inputs, outputs: drivers[0].outputs } as unknown as DeviceFields;
const interfaces = Object.assign([{ ...bus, _found: true }], { _loaded: true }) as unknown as ReifiedQueryResult<HostInterfaceFields>;
let current: { bus: HostInterfaceFields; measurements: Partial<MeasurementFields>[] };
const index = (plural: string, rows: { id: unknown }[]) => ({ [plural]: rows, query: rows.map(r => r.id) });
beforeEach(() => {
  Store.models = {}; // Fresh caches per test; models are recreated lazily by Store.m().
  current = { bus, measurements: [] };
  for (const method of [api.post, api.patch, api.delete]) method.mockReset().mockResolvedValue({ data: {} });
  api.get.mockReset().mockImplementation(async (url: string) => ({ data:
    url.startsWith('/drivers.json') ? index('drivers', drivers) :
    url.startsWith('/host_ports.json') ? index('host_ports', []) :
    url.startsWith('/measurements.json') ? index('measurements', current.measurements as { id: number }[]) :
    url.startsWith('/output_blocks.json') ? index('output_blocks', []) :
    url.startsWith('/devices.json') ? index('devices', [relayDevice]) :
    url === '/devices/3' ? { devices: [relayDevice] } :
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
      device: expect.objectContaining({ configuration_revision: 7, io_labels: { outputs: { '2': 'Alarm relay' } } }),
    }, expect.anything());
  });

  it('keeps an edit draft and its opening revision while reporting a save conflict', async () => {
    const close = vi.fn();
    render(<InterfaceEditor editId={1} onClose={close} onRefresh={vi.fn()} />);
    const name = await screen.findByLabelText('Name');
    fireEvent.input(name, { target: { value: 'My draft' } });
    api.patch.mockRejectedValue(conflict);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Configuration changed');
    expect(api.patch).toHaveBeenCalledWith('/host_interfaces/1',
      { host_interface: expect.objectContaining({ name: 'My draft', configuration_revision: 4 }) }, expect.anything());
    expect((name as HTMLInputElement).value).toBe('My draft');
    expect(close).not.toHaveBeenCalled();
  });

  it('compares a conflicted draft with the store record and keeps the draft against the shown revision', async () => {
    render(<InterfaceEditor editId={1} onClose={vi.fn()} onRefresh={vi.fn()} />);
    const name = await screen.findByLabelText('Name');
    fireEvent.input(name, { target: { value: 'My draft' } });
    api.patch.mockRejectedValueOnce(conflict);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    current.bus = { ...bus, name: 'Theirs', configuration_revision: 5 };
    fireEvent.click(await screen.findByRole('button', { name: 'Reload for comparison' }));
    await screen.findByText(/"name": "Theirs"/);
    fireEvent.click(screen.getByRole('button', { name: 'Keep my draft against this revision' }));
    expect((name as HTMLInputElement).value).toBe('My draft');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.patch).toHaveBeenLastCalledWith('/host_interfaces/1',
      { host_interface: expect.objectContaining({ name: 'My draft', configuration_revision: 5 }) }, expect.anything()));
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
    current.measurements = [{ id: 5, name: 'Supply temp', device_id: 3, logic_diagram_id: 2 }];
    render(<InterfaceEditor editId={1} onClose={vi.fn()} onRefresh={vi.fn()} />);
    await screen.findByLabelText('Name');
    fireEvent.click(screen.getByRole('button', { name: 'Review deletion' }));
    await screen.findByText('Supply temp — open diagram 2');
    expect(screen.getByText('Reassign or remove these dependencies in Logic before deleting.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm deletion' })).toBeNull();
  });
});

describe('device scanning', () => {
  it('requests and cancels a scan by patching the interface', async () => {
    const idle = { ...bus, scan_state: 'idle', scan_results: {} } as HostInterfaceFields;
    const view = render(<DeviceScanPanel iface={idle} devices={[]} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Scan devices' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/host_interfaces/1', { host_interface: {
      scan_state: 'requested', scan_options: { first_address: 1, last_address: 247, profiles: [profile] } } }, expect.anything()));
    view.rerender(<DeviceScanPanel iface={{ ...idle, scan_state: 'scanning' }} devices={[]} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel scan' }));
    await waitFor(() => expect(api.patch).toHaveBeenLastCalledWith('/host_interfaces/1', { host_interface: { scan_state: 'cancelling' } }, expect.anything()));
    view.rerender(<DeviceScanPanel iface={{ ...idle, scan_state: 'cancelling' }} devices={[]} onRefresh={vi.fn()} />);
    expect((await screen.findByRole('button', { name: 'Cancelling…' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('reports a rejected scan request', async () => {
    api.patch.mockRejectedValue({ response: { status: 409, data: { errors: { base: ['Disable the interface before scanning'] } } } });
    render(<DeviceScanPanel iface={{ ...bus, scan_state: 'idle' } as HostInterfaceFields} devices={[]} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Scan devices' }));
    await screen.findByText('Disable the interface before scanning');
  });

  it('shows all support verdicts and adds a new device only after an explicit driver choice', async () => {
    const refresh = vi.fn();
    render(<DeviceScanPanel iface={bus} devices={[]} onRefresh={refresh} />);
    await screen.findByText(/Relay board/);
    expect((screen.getByRole('radio', { name: /NTC board/ }) as HTMLInputElement).disabled).toBe(true);
    const add = screen.getByRole('button', { name: 'Add as new device' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Relay board/ }));
    fireEvent.click(add);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith('/devices.json',
      { device: { host_interface_id: 1, name: 'Device at 1', driver: 'relay', modbus_address: 1 } }, expect.anything());
  });

  it('points an existing device at a scan result by patching it', async () => {
    render(<DeviceScanPanel iface={bus} devices={[relayDevice]} onRefresh={vi.fn()} />);
    fireEvent.click(await screen.findByRole('radio', { name: /Relay board/ }));
    // Not fireEvent.change: with preact/compat loaded it sends `input`, but a <select>'s onChange listens for `change`.
    const useAs = screen.getByLabelText('Use as') as HTMLSelectElement;
    useAs.value = '3';
    fireEvent(useAs, new Event('change', { bubbles: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use for device #3' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/devices/3',
      { device: { driver: 'relay', modbus_address: 1, configuration_revision: 7 } }, expect.anything()));
  });

  it('will not adopt a result found at serial settings the bus does not use', async () => {
    const other = { ...bus, baud_rate: 19200 } as HostInterfaceFields;
    render(<DeviceScanPanel iface={other} devices={[]} onRefresh={vi.fn()} />);
    await screen.findByText(/Found at different serial settings/);
    // Disabled by the enclosing fieldset, which the element's own .disabled doesn't reflect.
    expect((await screen.findByRole('radio', { name: /Relay board/ })).matches(':disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Add as new device' }).matches(':disabled')).toBe(true);
  });
});

describe('interface card', () => {
  it('tracks fresh polls after enabling rather than counting old samples', async () => {
    const device = { id: 3, name: 'Relay', last_polled_at: null, current_state: null } as DeviceFields;
    const refresh = vi.fn();
    const props = { iface: bus, devices: [device], onEdit: vi.fn(), onRefresh: refresh };
    const view = render(<HostInterfaceCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review and enable' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Enable operation' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(api.patch).toHaveBeenCalledWith('/host_interfaces/1', { host_interface: { enabled: true, configuration_revision: 4 } }, expect.anything());
    const enabled = { ...bus, enabled: true, connection_state: 'online' as const };
    const good = (time: number) => ({ ...device, last_polled_at: new Date(time).toISOString(), current_state: { status: 'ok', error: null, data: {}, polled_at: '' } });
    view.rerender(<HostInterfaceCard {...props} iface={enabled} devices={[good(Date.now() + 1000)]} />);
    await screen.findByText('Waiting for two successful fresh polls per device…');
    view.rerender(<HostInterfaceCard {...props} iface={enabled} devices={[good(Date.now() + 11000)]} />);
    await screen.findByText('Verified: two successful fresh polls for every device.');
  });

  it('reports a failed disable and keeps the bus enabled', async () => {
    api.patch.mockRejectedValue(conflict);
    const enabled = { ...bus, enabled: true, connection_state: 'online' } as HostInterfaceFields;
    render(<HostInterfaceCard iface={enabled} devices={[]} onEdit={vi.fn()} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
    await screen.findByText('Configuration changed');
  });
});
