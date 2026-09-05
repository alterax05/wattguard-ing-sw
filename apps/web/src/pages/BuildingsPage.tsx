import { useState } from "react"
import { useTranslation } from "react-i18next"
import { BuildingSearch, AddBuildingDialog } from "@/components/buildings"
import { BuildingTypesManagement } from "@/components/building-types"
import { Button } from "@/components/ui/button"
import { Plus, Tags } from "lucide-react"
import { useAuth } from "@/lib/auth"

export function BuildingsPage() {
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showTypes, setShowTypes] = useState(false)
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("buildings.searchTitle")}</h1>
          <p className="text-muted-foreground">
            {t("buildings.searchSubtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin ? (
            <Button variant="outline" onClick={() => { setShowTypes((v) => !v) }}>
              <Tags className="mr-2 h-4 w-4" />
              {t("buildingTypes.manage")}
            </Button>
          ) : null}
          <Button onClick={() => { setShowAddDialog(true) }}>
            <Plus className="mr-2 h-4 w-4" />
            {t("buildings.add")}
          </Button>
        </div>
      </div>
      {showTypes && isAdmin ? (
        <BuildingTypesManagement isAdmin />
      ) : null}
      <BuildingSearch />
      {showAddDialog && (
        <AddBuildingDialog onClose={() => { setShowAddDialog(false) }} />
      )}
    </div>
  )
}

export default BuildingsPage;
