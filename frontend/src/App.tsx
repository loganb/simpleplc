import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

function App() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4">
        <h1 className="text-2xl font-bold tracking-tight">PLC Controller</h1>
        <p className="text-sm text-muted-foreground">HVAC Monitoring Dashboard</p>
      </header>

      <main className="p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">DS18B20 Temperature Board</CardTitle>
              <Badge variant="outline">Polling</Badge>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">8-channel digital temperature sensor</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">NTC Temperature Board</CardTitle>
              <Badge variant="outline">Polling</Badge>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">32-channel analog temperature sensor</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Relay I/O Board</CardTitle>
              <Badge variant="outline">Polling</Badge>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">8 relay outputs, 8 digital inputs</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

export default App
