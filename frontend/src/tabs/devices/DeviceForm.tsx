import type { ExistingRecord, ReifiedQueryResult } from '../../lib/RestfulModelStore';
import type { HostInterfaceFields } from '../../store';
import { DeviceEditor } from './HardwareForms';
export function DeviceForm({ interfaces, ...props }: { editId: number | null; interfaces: ReifiedQueryResult<HostInterfaceFields>; onClose: () => void; onRefresh: () => void }) {
  return <DeviceEditor {...props} interfaces={interfaces.filter(i => i._found) as ExistingRecord<HostInterfaceFields>[]} />;
}
