import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useLoaders } from "@/lib/DataLoader2"
import { Store, Device, HostInterface } from "@/store"
import type { DeviceFields, HostInterfaceFields } from "@/store"
import type { FoundRecord, ReifiedQueryResult } from "@/lib/RestfulModelStore"

function App() {
  const { devices, interfaces } = useLoaders(() => {
    const devices = Store.m(Device).queryFor(null, {});
    const interfaces = Store.m(HostInterface).queryFor(null, {});
    return { devices, interfaces };
  }, [Store]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4">
        <h1 className="text-2xl font-bold tracking-tight">PLC Controller</h1>
        <p className="text-sm text-muted-foreground">HVAC Monitoring Dashboard</p>
      </header>

      <main className="p-6">
        {!devices._loaded ? (
          <p className="text-muted-foreground">Loading devices...</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {devices.map((device) => (
              <DeviceCard
                key={device.id as number}
                device={device}
                interfaces={interfaces}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function DeviceCard({ device, interfaces }: {
  device: ReifiedQueryResult<DeviceFields>[number],
  interfaces: ReifiedQueryResult<HostInterfaceFields>
}) {
  if (!device._found) return null;
  const found = device as FoundRecord<DeviceFields>;
  const state = found.current_state;
  const iface = interfaces.find((i) => i._found && (i as FoundRecord<HostInterfaceFields>).id === found.host_interface_id);
  const ifaceFound = iface?._found ? iface as FoundRecord<HostInterfaceFields> : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{found.name}</CardTitle>
        <StatusBadge status={state?.status ?? null} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Addr {found.modbus_address}</span>
          {ifaceFound && <span>on {ifaceFound.port}</span>}
        </div>

        {state?.data && <DeviceData data={state.data} driver={found.driver} />}

        {state?.polled_at && (
          <p className="text-xs text-muted-foreground">
            Polled: {new Date(state.polled_at).toLocaleTimeString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (status === "ok") {
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">OK</Badge>;
  }
  if (status === "error") {
    return <Badge variant="destructive">Error</Badge>;
  }
  return <Badge variant="outline">Unknown</Badge>;
}

function DeviceData({ data }: { data: Record<string, unknown>, driver: string }) {
  if ("temperatures" in data) {
    const temps = data.temperatures as (number | null)[];
    const active = temps.map((t, i) => ({ ch: i + 1, temp: t })).filter((t) => t.temp !== null);

    return (
      <div className="grid grid-cols-2 gap-1">
        {active.map(({ ch, temp }) => (
          <div key={ch} className="flex justify-between rounded bg-muted px-2 py-1 text-sm">
            <span className="text-muted-foreground">Ch {ch}</span>
            <span className="font-mono font-medium">{temp!.toFixed(1)}&deg;C</span>
          </div>
        ))}
        {active.length === 0 && (
          <p className="col-span-2 text-xs text-muted-foreground">No active channels</p>
        )}
      </div>
    );
  }

  if ("outputs" in data && "inputs" in data) {
    const outputs = data.outputs as boolean[];
    const inputs = data.inputs as boolean[];

    return (
      <div className="space-y-2">
        <IORow label="Outputs" values={outputs} />
        <IORow label="Inputs" values={inputs} />
      </div>
    );
  }

  return <pre className="text-xs overflow-auto">{JSON.stringify(data, null, 2)}</pre>;
}

function IORow({ label, values }: { label: string, values: boolean[] }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex gap-1">
        {values.map((v, i) => (
          <div
            key={i}
            className={`h-6 w-6 rounded text-center text-xs leading-6 font-mono ${
              v
                ? "bg-green-500 text-white"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {i + 1}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App
