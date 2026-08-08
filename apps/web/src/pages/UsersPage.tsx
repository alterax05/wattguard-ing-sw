import { UsersManagement } from "@/components/dashboard/users-management"

export function UsersPage() {
  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Gestione Utenti</h1>
        <p className="text-muted-foreground">Gestisci gli utenti del sistema di monitoraggio energetico</p>
      </div>
      <UsersManagement />
    </div>
  )
}
