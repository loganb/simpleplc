import { useLoaders } from '../../lib/DataLoader2';
import type { ExistingRecord } from '../../lib/RestfulModelStore';
import { Driver, Store } from '../../store';
import type { DriverFields } from '../../store';

export function useDrivers(): ExistingRecord<DriverFields>[] {
  const { drivers } = useLoaders(() => ({ drivers: Store.m(Driver).queryFor(null, {}) }), [Store], []);
  return drivers.filter(d => d._found) as ExistingRecord<DriverFields>[];
}
