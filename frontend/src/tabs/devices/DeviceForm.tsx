import type { ExistingRecord, ReifiedQueryResult } from '../../lib/RestfulModelStore';
import type { HostInterfaceFields } from '../../store';
import { Modal } from '../../components/Modal';
import { DeviceEditor } from './HardwareForms';
export function DeviceForm({ interfaces, ...props }: { editId: number | null; interfaces: ReifiedQueryResult<HostInterfaceFields>; onClose: () => void; onRefresh: () => void }) {
  return <Modal label={props.editId === null ? 'New Device' : 'Edit Device'} onClose={props.onClose}>
    <DeviceEditor {...props} interfaces={interfaces.filter(i => i._found) as ExistingRecord<HostInterfaceFields>[]} />
  </Modal>;
}
