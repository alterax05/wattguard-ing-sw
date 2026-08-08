import { AlertsManagement } from "@/components/dashboard/alerts-management"

export function AlertsPage() {
  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Gestione Notifiche</h1>
        <p className="text-muted-foreground">Monitora e gestisci le notifiche e gli avvisi del sistema</p>
      </div>
      <AlertsManagement />
    </div>
  )
}

export default AlertsPage;
