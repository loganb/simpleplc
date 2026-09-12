import { useEffect, useState } from 'preact/hooks';
import { useTxnStatus } from '../../components/useTxnStatus';
import type { ExistingRecord, Txn } from '../../lib/RestfulModelStore';
import { HostInterface, Store } from '../../store';
import type { HostInterfaceFields } from '../../store';

/**
 * How each connection state reads to an operator. `detail` is the tooltip,
 * which is where the distinction that matters lives: "offline" is a decision
 * the poller made, "not reporting" means nothing is making decisions at all.
 */
const CONNECTION_STATE: Record<HostInterfaceFields['connection_state'], {
  label: string;
  class: string;
  detail: string;
}> = {
  online: {
    label: 'Online',
    class: 'bg-ok-bg text-ok',
    detail: 'The poller is holding this port open and polling its devices.',
  },
  offline: {
    label: 'Offline',
    class: 'bg-error-bg text-error',
    detail: 'The poller is running but could not open this port.',
  },
  releasing: {
    label: 'Releasing...',
    class: 'bg-active-bg text-active',
    detail: 'Disabled, but the poller still has the port. It will let go within a poll cycle.',
  },
  disabled: {
    label: 'Disabled',
    class: 'bg-surface-alt text-text-muted',
    detail: 'Turned off by an operator. The port is free for other software to use.',
  },
  unknown: {
    label: 'Not reporting',
    class: 'bg-surface-alt text-text-muted',
    detail: 'No recent report from the poller — it may be stopped. Nothing is polling this bus.',
  },
};

export function HostInterfaceCard({ iface, onEdit, onRefresh }: {
  iface: ExistingRecord<HostInterfaceFields>;
  onEdit: () => void;
  onRefresh: () => void;
}) {
  const [toggleTxn, setToggleTxn] = useState<Txn | undefined>();
  const { txnResult, saving } = useTxnStatus(toggleTxn);
  const state = CONNECTION_STATE[iface.connection_state];

  useEffect(() => {
    if (txnResult?.status === 'succeeded') onRefresh();
  }, [txnResult, onRefresh]);

  // Only flips `enabled`. Whether the port is actually open is the poller's to
  // report, which is why the badge can still say "Releasing..." after this
  // succeeds.
  const toggleEnabled = () => {
    setToggleTxn(Store.m(HostInterface).patch(iface.id, { enabled: !iface.enabled }));
  };

  return (
    <div class="rounded-lg border border-border bg-surface p-4">
      <div class="flex items-start justify-between gap-3">
        <h3 class="text-sm font-semibold">{iface.name}</h3>
        <div class="flex shrink-0 items-center gap-2">
          {!iface.port_present && (
            <span
              class="rounded border border-error px-1.5 py-0.5 text-xs text-error"
              title="The configured port does not exist on this host right now."
            >
              Missing
            </span>
          )}
          <span class={`rounded px-1.5 py-0.5 text-xs font-medium ${state.class}`} title={state.detail}>
            {state.label}
          </span>
        </div>
      </div>

      <p class="mt-2 break-all font-mono text-xs text-text-muted">{iface.port}</p>
      <p class="mt-1 text-xs text-text-muted">
        {iface.baud_rate} baud, {iface.data_bits}{iface.parity.charAt(0).toUpperCase()}{iface.stop_bits}
        {iface.resolved_device && ` · ${iface.resolved_device}`}
      </p>

      {iface.connection_error && (
        <p class="mt-2 break-words text-xs text-error">{iface.connection_error}</p>
      )}

      <div class="mt-3 flex items-center gap-2">
        <button
          class="rounded border border-border px-2 py-1 text-xs font-medium text-text-muted hover:text-text"
          onClick={onEdit}
        >
          Edit
        </button>
        <button
          class="rounded border border-border px-2 py-1 text-xs font-medium text-text-muted hover:text-text disabled:opacity-50"
          disabled={saving}
          onClick={toggleEnabled}
        >
          {iface.enabled ? 'Disable' : 'Enable'}
        </button>
      </div>
    </div>
  );
}
