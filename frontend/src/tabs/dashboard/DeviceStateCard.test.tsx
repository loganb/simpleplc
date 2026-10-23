// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/preact';
import type { ReifiedQueryResult } from '../../lib/RestfulModelStore';
import type { DeviceFields, HostInterfaceFields } from '../../store';
import { DeviceStateCard } from './DeviceStateCard';

afterEach(cleanup);

it('shows both pulse counter channels with their matching frequencies', () => {
  const device = {
    _found: true,
    id: 4,
    name: 'Flow counter',
    host_interface_id: 1,
    modbus_address: 2,
    last_polled_at: new Date().toISOString(),
    current_state: {
      status: 'ok', error: null, polled_at: new Date().toISOString(),
      data: { counts: [0, 4294967295], frequencies: [0, 2.75] },
    },
  } as unknown as ReifiedQueryResult<DeviceFields>[number];
  const interfaces = [] as unknown as ReifiedQueryResult<HostInterfaceFields>;

  render(<DeviceStateCard device={device} interfaces={interfaces} />);

  expect(screen.getByText('Ch 1').nextElementSibling?.textContent).toBe('0 (0 Hz)');
  expect(screen.getByText('Ch 2').nextElementSibling?.textContent).toBe('4294967295 (2.75 Hz)');
  expect(screen.queryByText(/"counts"/)).toBeNull();
});
