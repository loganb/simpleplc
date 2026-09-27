// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import type { DeviceFields, HostInterfaceFields } from '../../store';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('../../store', () => ({ AxiosClient: api }));
import { InterfaceEditor } from './HardwareForms';
import { DeviceScanPanel } from './DeviceScanPanel';
import { HostInterfaceCard } from './HostInterfaceCard';
const bus = { id: 1, name: 'Bus', port: '/dev/missing', baud_rate: 9600, data_bits: 8, stop_bits: 1, parity: 'none', enabled: false,
  configuration_revision: 4, scan_state: 'completed', scan_request_id: 'scan-a', scan_options: {}, scan_results: { completed: 1, total: 1, devices: [
    { address: 1, profile_index: 0, profile: { baud_rate: 9600, data_bits: 8, stop_bits: 1, parity: 'none' }, observed_at: new Date().toISOString(), driver_support: [
      { driver: 'relay', support: 'maybe', reason: 'Binary registers', evidence: [] }, { driver: 'ntc', support: 'no', reason: 'Different ID', evidence: [] },
    ] },
  ] }, connection_state: 'disabled', connection_error: null } as unknown as HostInterfaceFields;
const drivers = [{ id: 'relay', name: 'Relay board' }, { id: 'ntc', name: 'NTC board' }];
const impact = { devices: [], measurements: [], output_blocks: [] };
beforeEach(() => {
  vi.resetAllMocks();
  api.get.mockImplementation(async (url: string) => ({ data: url === '/drivers' ? { drivers } : url === '/host_ports' ? { host_ports: [] } : url.endsWith('/impact') ? impact : { host_interfaces: [bus] } }));
});
afterEach(cleanup);

describe('hardware setup components', () => {
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
