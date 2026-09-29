// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { AxiosClient, Store } from '../../store';
import type { DeviceFields, HostInterfaceFields } from '../../store';
// Stub the HTTP client the Store itself uses, so store reads and the remaining direct calls both hit these mocks.
const api = {
  get: vi.spyOn(AxiosClient, 'get'), post: vi.spyOn(AxiosClient, 'post'),
  patch: vi.spyOn(AxiosClient, 'patch'), delete: vi.spyOn(AxiosClient, 'delete'),
};
import { InterfaceEditor } from './HardwareForms';
import { DeviceForm } from './DeviceForm';
import { DeviceScanPanel } from './DeviceScanPanel';
import { HostInterfaceCard } from './HostInterfaceCard';
const bus = { id: 1, name: 'Bus', port: '/dev/missing', baud_rate: 9600, data_bits: 8, stop_bits: 1, parity: 'none', enabled: false,
  configuration_revision: 4, scan_state: 'completed', scan_request_id: 'scan-a', scan_options: {}, scan_results: { completed: 1, total: 1, devices: [
    { address: 1, profile_index: 0, profile: { baud_rate: 9600, data_bits: 8, stop_bits: 1, parity: 'none' }, observed_at: new Date().toISOString(), driver_support: [
      { driver: 'relay', support: 'maybe', reason: 'Binary registers', evidence: [] }, { driver: 'ntc', support: 'no', reason: 'Different ID', evidence: [] },
    ] },
  ] }, connection_state: 'disabled', connection_error: null } as unknown as HostInterfaceFields;
const drivers = [
  { id: 'relay', name: 'Relay board', channel_count: 2, fields: ['inputs', 'outputs'], binary_outputs: true, configuration_effects: 'None',
    inputs: [{ path: 'inputs[0]', label: 'Input 1', value_type: 'boolean', units: null }, { path: 'inputs[1]', label: 'Input 2', value_type: 'boolean', units: null }],
    outputs: [{ channel: 1, label: 'Relay 1', value_type: 'boolean', units: null }, { channel: 2, label: 'Relay 2', value_type: 'boolean', units: null }] },
  { id: 'ntc', name: 'NTC board', channel_count: 1, fields: ['temperatures'], binary_outputs: false, configuration_effects: 'None', inputs: [], outputs: [] },
];
const relayDevice = { id: 3, name: 'Relay', host_interface_id: 1, modbus_address: 1, driver: 'relay', configuration_revision: 7,
  io_labels: { inputs: { 'inputs[0]': 'Boiler enable' }, outputs: {} }, inputs: drivers[0].inputs, outputs: drivers[0].outputs };
const impact = { devices: [], measurements: [], output_blocks: [] };
let current = { bus, relayDevice };
beforeEach(() => {
  Store.models = {}; // Fresh caches per test; models are recreated lazily by Store.m().
  current = { bus, relayDevice };
  for (const method of [api.post, api.patch, api.delete]) method.mockReset().mockResolvedValue({ data: {} });
  api.get.mockReset().mockImplementation(async (url: string) => ({ data:
    url.startsWith('/drivers.json') ? { drivers, query: drivers.map(d => d.id) } :
    url === '/devices/3' ? { devices: [current.relayDevice] } :
    url.startsWith('/host_ports.json') ? { host_ports: [], query: [] } :
    url.endsWith('/impact') ? impact : { host_interfaces: [current.bus] } }));
});
afterEach(cleanup);

describe('hardware setup components', () => {
  it('closes the Device modal with Escape', async () => {
    const interfaces = Object.assign([{ ...bus, _found: true }], { _loaded: true }) as unknown as import('../../lib/RestfulModelStore').ReifiedQueryResult<HostInterfaceFields>;
    const close = vi.fn();
    render(<DeviceForm editId={3} interfaces={interfaces} onClose={close} onRefresh={vi.fn()} />);
    await screen.findByRole('dialog', { name: 'Edit Device' });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(close).toHaveBeenCalledOnce();
  });

  it('edits custom I/O labels in a modal and submits only overrides', async () => {
    const interfaces = Object.assign([{ ...bus, _found: true }], { _loaded: true }) as unknown as import('../../lib/RestfulModelStore').ReifiedQueryResult<HostInterfaceFields>;
    const close = vi.fn();
    api.patch.mockResolvedValue({ data: {} });

    render(<DeviceForm editId={3} interfaces={interfaces} onClose={close} onRefresh={vi.fn()} />);

    const dialog = await screen.findByRole('dialog', { name: 'Edit Device' });
    expect(dialog).toBeTruthy();
    expect((await screen.findByLabelText('Custom label for Input 1') as HTMLInputElement).value).toBe('Boiler enable');
    expect((screen.getByLabelText('Custom label for Relay 1') as HTMLInputElement).placeholder).toBe('Relay 1');

    fireEvent.input(screen.getByLabelText('Custom label for Input 1'), { target: { value: '' } });
    fireEvent.input(screen.getByLabelText('Custom label for Relay 2'), { target: { value: 'Alarm relay' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/devices/3', {
      device: expect.objectContaining({
        configuration_revision: 7,
        io_labels: { outputs: { '2': 'Alarm relay' } },
      }),
    }));
    expect(close).toHaveBeenCalled();
  });

  it('keeps an edit draft and its opening revision while reporting a save conflict', async () => {
    const close = vi.fn();
    render(<InterfaceEditor editId={1} onClose={close} onRefresh={vi.fn()} />);
    const name = await screen.findByLabelText('Name');
    fireEvent.input(name, { target: { value: 'My draft' } });
    api.patch.mockRejectedValue({ response: { data: { errors: { base: ['Configuration changed'] } } } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Configuration changed');
    expect(api.patch).toHaveBeenCalledWith('/host_interfaces/1', expect.objectContaining({ host_interface: expect.objectContaining({ name: 'My draft', configuration_revision: 4 }) }));
    expect((name as HTMLInputElement).value).toBe('My draft');
    expect(close).not.toHaveBeenCalled();
  });

  it('compares a conflicted draft with the store record and keeps the draft against the shown revision', async () => {
    render(<InterfaceEditor editId={1} onClose={vi.fn()} onRefresh={vi.fn()} />);
    const name = await screen.findByLabelText('Name');
    fireEvent.input(name, { target: { value: 'My draft' } });
    api.patch.mockRejectedValueOnce({ response: { data: { errors: { base: ['Configuration changed'] } } } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    current.bus = { ...bus, name: 'Theirs', configuration_revision: 5 };
    fireEvent.click(await screen.findByRole('button', { name: 'Reload for comparison' }));
    await screen.findByText(/"name": "Theirs"/);
    fireEvent.click(screen.getByRole('button', { name: 'Keep my draft against this revision' }));
    expect((name as HTMLInputElement).value).toBe('My draft');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.patch).toHaveBeenLastCalledWith('/host_interfaces/1',
      { host_interface: expect.objectContaining({ name: 'My draft', configuration_revision: 5 }) }));
  });

  it('waits for deletion and keeps the form visible on failure', async () => {
    const close = vi.fn();
    render(<InterfaceEditor editId={1} onClose={close} onRefresh={vi.fn()} />);
    await screen.findByLabelText('Name');
    fireEvent.click(screen.getByRole('button', { name: 'Review deletion' }));
    await screen.findByRole('button', { name: 'Confirm deletion' });
    api.delete.mockRejectedValue({ response: { data: { errors: { base: ['New dependency exists'] } } } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));
    await screen.findByText('New dependency exists');
    expect(close).not.toHaveBeenCalled();
    expect(api.delete).toHaveBeenCalledWith('/host_interfaces/1', { params: { configuration_revision: 4 } });
  });

  it('shows all support verdicts and requires an explicit driver choice', async () => {
    render(<DeviceScanPanel iface={bus} devices={[]} onRefresh={vi.fn()} />);
    await screen.findByText(/Relay board/);
    const no = screen.getByRole('radio', { name: /NTC board/ }) as HTMLInputElement;
    expect(no.disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Add choice to draft' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Relay board/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add choice to draft' }));
    api.post.mockResolvedValue({ data: { devices: [{ name: 'Device at 1', modbus_address: 1 }], deleted_ids: [], impact } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }));
    await screen.findByRole('button', { name: 'Apply configuration' });
    expect(api.post).toHaveBeenCalledWith('/host_interfaces/1/preview', expect.objectContaining({ devices: [expect.objectContaining({ driver: 'relay', scan_request_id: 'scan-a' })] }));
    expect(api.post.mock.calls.some(c => c[0].endsWith('/apply'))).toBe(false);
  });

  it('compares a device draft with the live saved devices and previews against the shown revision', async () => {
    const saved = { ...relayDevice, name: 'Saved relay' } as unknown as DeviceFields;
    const view = render(<DeviceScanPanel iface={bus} devices={[saved]} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit device list' }));
    const changed = { ...bus, configuration_revision: 9 };
    view.rerender(<DeviceScanPanel iface={changed} devices={[{ ...saved, name: 'Renamed elsewhere' }]} onRefresh={vi.fn()} />);
    await screen.findByText(/Configuration changed since this draft began/);
    fireEvent.click(screen.getByRole('button', { name: 'Reload for comparison' }));
    await screen.findByText('#3 Renamed elsewhere, address 1');
    fireEvent.click(screen.getByRole('button', { name: 'Keep draft against this revision' }));
    api.post.mockResolvedValue({ data: { devices: [], deleted_ids: [], impact } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/host_interfaces/1/preview',
      expect.objectContaining({ configuration_revision: 9, devices: [expect.objectContaining({ name: 'Saved relay' })] })));
  });

  it('tracks fresh polls after enabling rather than counting old samples', async () => {
    const device = { id: 3, last_polled_at: null, current_state: null } as DeviceFields;
    const refresh = vi.fn();
    const props = { iface: bus, devices: [device], onEdit: vi.fn(), onRefresh: refresh };
    const view = render(<HostInterfaceCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review and enable' }));
    await screen.findByRole('button', { name: 'Enable operation' });
    api.patch.mockResolvedValue({ data: {} });
    fireEvent.click(screen.getByRole('button', { name: 'Enable operation' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const enabled = { ...bus, enabled: true, connection_state: 'online' as const };
    const good = (time: number) => ({ ...device, last_polled_at: new Date(time).toISOString(), current_state: { status: 'ok', error: null, data: {}, polled_at: '' } });
    view.rerender(<HostInterfaceCard {...props} iface={enabled} devices={[good(Date.now() + 1000)]} />);
    await screen.findByText('Waiting for two successful fresh polls per device…');
    view.rerender(<HostInterfaceCard {...props} iface={enabled} devices={[good(Date.now() + 11000)]} />);
    await screen.findByText('Verified: two successful fresh polls for every device.');
  });
});
