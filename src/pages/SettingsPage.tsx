import { SettingsPanel } from "@/components/dashboard/settings-panel"

export function SettingsPage() {
  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Impostazioni Sistema</h1>
        <p className="text-muted-foreground">Configura i parametri del sistema di monitoraggio energetico</p>
      </div>
      <SettingsPanel />
    </div>
  )
}
