import { useState } from "react"
import { useTranslation } from "react-i18next"
import { BuildingSearch, AddBuildingDialog } from "@/components/buildings"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

export function BuildingsPage() {
  const [showAddDialog, setShowAddDialog] = useState(false)
  const { t } = useTranslation()

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("buildings.searchTitle")}</h1>
          <p className="text-muted-foreground">
            {t("buildings.searchSubtitle")}
          </p>
        </div>
        <Button onClick={() => { setShowAddDialog(true) }}>
          <Plus className="mr-2 h-4 w-4" />
          {t("buildings.add")}
        </Button>
      </div>
      <BuildingSearch />
      {showAddDialog && (
        <AddBuildingDialog onClose={() => { setShowAddDialog(false) }} />
      )}
    </div>
  )
}

export default BuildingsPage;
