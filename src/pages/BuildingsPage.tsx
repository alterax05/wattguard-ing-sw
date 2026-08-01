import { useState } from "react"
import { BuildingSearch } from "@/components/dashboard/building-search"
import { AddBuildingDialog } from "@/components/dashboard/add-building-dialog"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

export function BuildingsPage() {
  const [showAddDialog, setShowAddDialog] = useState(false)

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ricerca Edifici</h1>
          <p className="text-muted-foreground">
            Cerca e seleziona gli edifici pubblici del Comune di Trento
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Aggiungi Edificio
        </Button>
      </div>
      <BuildingSearch />
      {showAddDialog && (
        <AddBuildingDialog onClose={() => setShowAddDialog(false)} />
      )}
    </div>
  )
}
