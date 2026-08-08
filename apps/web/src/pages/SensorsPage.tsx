import { SensorsMonitoring } from "@/components/dashboard/sensors-monitoring"

export function SensorsPage() {
  return (
    <div className="space-y-6 p-4 sm:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Monitoraggio Sensori</h1>
        <p className="text-muted-foreground">
          Controlla lo stato operativo e l'ultimo aggiornamento dei sensori installati negli edifici.
        </p>
      </div>
      <SensorsMonitoring />
    </div>
  )
}
