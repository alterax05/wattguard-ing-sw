import { useTranslation } from "react-i18next"
import { ArrowLeft, Building2, MapPin, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { BuildingStatusBadge } from "../building-status-badge"
import { getBuildingTypeName } from "./helpers"
import type { BuildingDetail } from "@/hooks/use-buildings"

interface BuildingHeaderProps {
  building: BuildingDetail
  isAdmin: boolean
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
}

export function BuildingHeader({
  building,
  isAdmin,
  onBack,
  onEdit,
  onDelete,
}: BuildingHeaderProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-4">
      <Button variant="ghost" size="icon" onClick={onBack}>
        <ArrowLeft className="h-5 w-5" />
        <span className="sr-only">{t("common.back")}</span>
      </Button>
      <div className="flex-1">
        <h1 className="text-2xl font-bold tracking-tight text-balance flex items-center gap-2">
          {building.name}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" />
            <span className="sr-only">{t("buildings.edit")}</span>
          </Button>
          {isAdmin && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">{t("buildings.delete")}</span>
            </Button>
          )}
        </h1>
        <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          {building.address}
          <Separator orientation="vertical" className="h-3.5" />
          <span>{getBuildingTypeName(building.buildingType)}</span>
        </div>
      </div>
      <BuildingStatusBadge status={building.status} className="text-sm" />
    </div>
  )
}

// Also export a compact variant for use in other contexts
export function BuildingHeaderSimple({
  building,
}: {
  building: Pick<BuildingDetail, "name" | "address" | "buildingType" | "status">
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Building2 className="h-3.5 w-3.5" />
      <span>{getBuildingTypeName(building.buildingType)}</span>
      <Separator orientation="vertical" className="h-3.5" />
      <BuildingStatusBadge status={building.status} />
    </div>
  )
}
