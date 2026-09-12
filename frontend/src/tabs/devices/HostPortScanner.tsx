import type { ExistingRecord, ReifiedQueryResult } from '../../lib/RestfulModelStore';
import type { HostPortFields } from '../../store';

/** What each identity basis actually survives, shown so the guarantees aren't implied to be equal. */
const IDENTITY_BASIS: Record<HostPortFields['identity_basis'], { label: string; detail: string }> = {
  by_id: {
    label: 'Stable',
    detail: 'Identified by the adapter’s serial number — survives reboots, replugs, and moving to another USB socket.',
  },
  by_path: {
    label: 'Socket-bound',
    detail: 'This adapter reports no serial number, so it is identified by which USB socket it is plugged into. Moving the plug will break this interface.',
  },
  device: {
    label: 'Onboard',
    detail: 'Built-in UART with a fixed device name.',
  },
};

export function HostPortScanner({ ports, expanded, onToggle, onRescan, onUsePort }: {
  ports: ReifiedQueryResult<HostPortFields>;
  expanded: boolean;
  onToggle: () => void;
  onRescan: () => void;
  onUsePort: (port: ExistingRecord<HostPortFields>) => void;
}) {
  const foundPorts = ports._loaded
    ? ports.filter((p) => p._found) as ExistingRecord<HostPortFields>[]
    : [];

  return (
    <div class="rounded-lg border border-border bg-surface-alt">
      <div class="flex items-center justify-between gap-4 p-4">
        <button class="flex items-center gap-2 text-left" onClick={onToggle}>
          <span class="text-text-muted">{expanded ? '▾' : '▸'}</span>
          <span class="text-sm font-semibold">Serial ports on this host</span>
          {ports._loaded && (
            <span class="text-xs text-text-muted">
              {foundPorts.length} found
            </span>
          )}
        </button>
        {expanded && (
          <button
            class="rounded border border-border px-3 py-1.5 text-sm font-medium text-text-muted hover:text-text"
            onClick={onRescan}
          >
            Rescan
          </button>
        )}
      </div>

      {expanded && (
        <div class="border-t border-border p-4">
          {!ports._loaded ? (
            <p class="text-text-muted">Scanning...</p>
          ) : foundPorts.length === 0 ? (
            <p class="text-text-muted">
              No serial ports detected. Check that the RS-485 adapter is plugged in.
            </p>
          ) : (
            <div class="space-y-3">
              {foundPorts.map((port) => (
                <HostPortRow key={port.id} port={port} onUse={() => onUsePort(port)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HostPortRow({ port, onUse }: {
  port: ExistingRecord<HostPortFields>;
  onUse: () => void;
}) {
  const claimed = port.host_interface_id !== null;
  const basis = IDENTITY_BASIS[port.identity_basis];

  return (
    <div class="rounded border border-border bg-surface p-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h4 class="text-sm font-semibold">{port.label}</h4>
            <span class="rounded bg-surface-alt px-1.5 py-0.5 text-xs text-text-muted">{port.tty}</span>
            <span class="rounded bg-surface-alt px-1.5 py-0.5 text-xs text-text-muted" title={basis.detail}>
              {basis.label}
            </span>
            {claimed && (
              <span class="rounded bg-surface-alt px-1.5 py-0.5 text-xs text-text-muted">In use</span>
            )}
            {port.console && (
              <span class="rounded border border-error px-1.5 py-0.5 text-xs text-error">
                Kernel console
              </span>
            )}
          </div>
          <p class="mt-1 break-all font-mono text-xs text-text-muted">{port.stable_path}</p>
          <p class="mt-1 text-xs text-text-muted">
            {[
              port.kernel_driver,
              port.usb_serial && `serial ${port.usb_serial}`,
              port.usb_vendor_id && `${port.usb_vendor_id}:${port.usb_product_id}`,
            ].filter(Boolean).join(' · ')}
          </p>
        </div>

        {!claimed && (
          <button
            class="shrink-0 rounded bg-active px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            onClick={onUse}
          >
            Use This Port
          </button>
        )}
      </div>

      {port.console && (
        <p class="mt-2 text-xs text-error">
          The kernel uses this port as a serial console. Configuring a Modbus bus here means
          competing with kernel log output for the line.
        </p>
      )}
      {port.identity_basis === 'by_path' && !claimed && (
        <p class="mt-2 text-xs text-text-muted">{basis.detail}</p>
      )}
    </div>
  );
}
