import { useEffect, useRef, useState } from 'preact/hooks';
import { useLoaders } from './lib/DataLoader2';
import { DashboardTab } from './tabs/dashboard/DashboardTab';
import { DevicesTab } from './tabs/devices/DevicesTab';
import { LogicTab } from './tabs/logic/LogicTab';
import {
  Device,
  HostInterface,
  LogicBlock,
  LogicDiagram,
  Measurement,
  OutputBlock,
  Store,
  connectLiveRecords,
} from './store';
import { appTree } from './uxTree';
import type { TabName } from './uxTree';
import type { StreamStatus } from './lib/RecordStream';

const rootUx = appTree.subtree();

const TABS: { id: TabName; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'devices', label: 'Devices' },
  { id: 'logic', label: 'Logic' },
];

export function App() {
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('connecting');
  useEffect(() => {
    const stream = connectLiveRecords();
    setStreamStatus(stream.status);
    const listener = Store.addListener("streamStatus", setStreamStatus);
    return () => { listener.remove(); stream.stop(); };
  }, []);

  const [refreshToken, setRefreshToken] = useState(0);
  const lastForcedRefreshToken = useRef(0);

  useEffect(() => {
    const subscription = Store.addListener('cacheEpochAdvanced', () => {
      setRefreshToken((token) => token + 1);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const { activeTab } = useLoaders(() => ({
    activeTab: rootUx.getActiveSubtree() ?? 'dashboard',
  }), [rootUx], []);

  const { devices, interfaces, measurements, logicDiagrams, logicBlocks, outputBlocks } = useLoaders(() => {
    const force = refreshToken > lastForcedRefreshToken.current;
    if (force) lastForcedRefreshToken.current = refreshToken;
    const devices = Store.m(Device).queryFor(null, {}, force);
    const interfaces = Store.m(HostInterface).queryFor(null, {}, force);
    const measurements = Store.m(Measurement).queryFor(null, {}, force);
    const logicDiagrams = Store.m(LogicDiagram).queryFor(null, {}, force);
    const logicBlocks = Store.m(LogicBlock).queryFor(null, {}, force);
    const outputBlocks = Store.m(OutputBlock).queryFor(null, {}, force);
    return { devices, interfaces, measurements, logicDiagrams, logicBlocks, outputBlocks };
  }, [Store], [refreshToken]);

  const refresh = () => setRefreshToken((token) => token + 1);

  return (
    <div class="min-h-screen bg-surface">
      <header class="border-b border-border px-6 py-4">
        <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 class="text-2xl font-bold tracking-tight">PLC Controller</h1>
            <p class="text-sm text-text-muted">HVAC Monitoring Dashboard</p>
            <p class="text-xs text-text-muted" role="status">
              {streamStatus === 'live' ? 'Live updates connected' :
                streamStatus === 'connecting' ? 'Connecting live updates…' :
                  'Live updates disconnected — showing last received data'}
            </p>
          </div>
          <nav class="flex gap-1 rounded border border-border bg-surface-alt p-1" aria-label="Main sections">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                class={`rounded px-3 py-1.5 text-sm font-medium ${
                  activeTab === tab.id ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'
                }`}
                onClick={() => rootUx.setActiveSubtree(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main class="p-6">
        {activeTab === 'dashboard' && (
          <DashboardTab
            ux={rootUx.subtree('dashboard')}
            devices={devices}
            interfaces={interfaces}
            logicDiagrams={logicDiagrams}
            measurements={measurements}
            outputBlocks={outputBlocks}
          />
        )}

        {activeTab === 'devices' && (
          <DevicesTab
            ux={rootUx.subtree('devices')}
            devices={devices}
            interfaces={interfaces}
            onRefresh={refresh}
          />
        )}

        {activeTab === 'logic' && (
          <LogicTab
            ux={rootUx.subtree('logic')}
            diagrams={logicDiagrams}
            blocks={logicBlocks}
            outputBlocks={outputBlocks}
            measurements={measurements}
            devices={devices}
            onRefresh={refresh}
          />
        )}
      </main>
    </div>
  );
}
