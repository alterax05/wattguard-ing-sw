import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { ArrowLeft, Building2, MapPin, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { BuildingStatusBadge } from "../building-status-badge"
import { getBuildingTypeName } from "./helpers"
import type { BuildingDetail } from "@/hooks/use-buildings"
import { useOptionalBuildingDetailContext } from "./BuildingDetailContext"

export interface BuildingHeaderProps {
  building?: BuildingDetail
  isAdmin?: boolean
  onBack?: () => void
  onEdit?: () => void
  onDelete?: () => void
  children?: ReactNode
}

export function BuildingHeaderRoot({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-4">{children}</div>
}

export function BuildingHeaderBack({ onClick }: { onClick?: () => void }) {
  const { t } = useTranslation()
  const ctx = useOptionalBuildingDetailContext()
  const handleBack = onClick ?? ctx?.actions.goBack

  return (
    <Button variant="ghost" size="icon" onClick={handleBack}>
      <ArrowLeft className="h-5 w-5" />
      <span className="sr-only">{t("common.back")}</span>
    </Button>
  )
}

export function BuildingHeaderTitle({
  name,
  address,
  buildingType,
  children,
}: {
  name?: string
  address?: string
  buildingType?: BuildingDetail["buildingType"]
  children?: ReactNode
}) {
  const ctx = useOptionalBuildingDetailContext()
  const activeName = name ?? ctx?.state.building.name
  const activeAddress = address ?? ctx?.state.building.address
  const activeType = buildingType ?? ctx?.state.building.buildingType

  return (
    <div className="flex-1">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-balance">
        {activeName}
        {children}
      </h1>
      <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" />
        {activeAddress}
        {activeType && (
          <>
            <Separator orientation="vertical" className="h-3.5" />
            <span>{getBuildingTypeName(activeType)}</span>
          </>
        )}
      </div>
    </div>
  )
}

export function BuildingHeaderActions({
  children,
}: {
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const ctx = useOptionalBuildingDetailContext()

  if (children) {
    return <>{children}</>
  }

  if (!ctx) return null

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={ctx.actions.openEditBuilding}
      >
        <Pencil className="h-4 w-4" />
        <span className="sr-only">{t("buildings.edit")}</span>
      </Button>
      {ctx.state.isAdmin && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={ctx.actions.openDeleteBuilding}
        >
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">{t("buildings.delete")}</span>
        </Button>
      )}
    </>
  )
}

export function BuildingHeaderBadge({ status }: { status?: BuildingDetail["status"] }) {
  const ctx = useOptionalBuildingDetailContext()
  const activeStatus = status ?? ctx?.state.building.status
  if (!activeStatus) return null
  return <BuildingStatusBadge status={activeStatus} className="text-sm" />
}

export const BuildingHeader = Object.assign(
  function BuildingHeader({
    building,
    isAdmin,
    onBack,
    onEdit,
    onDelete,
    children,
  }: BuildingHeaderProps) {
    const { t } = useTranslation()
    const ctx = useOptionalBuildingDetailContext()

    const activeBuilding = building ?? ctx?.state.building
    const activeIsAdmin = isAdmin ?? ctx?.state.isAdmin ?? false
    const handleBack = onBack ?? ctx?.actions.goBack
    const handleEdit = onEdit ?? ctx?.actions.openEditBuilding
    const handleDelete = onDelete ?? ctx?.actions.openDeleteBuilding

    if (children) {
      return <BuildingHeaderRoot>{children}</BuildingHeaderRoot>
    }

    if (!activeBuilding) return null

    return (
      <BuildingHeaderRoot>
        <BuildingHeaderBack onClick={handleBack} />
        <BuildingHeaderTitle
          name={activeBuilding.name}
          address={activeBuilding.address}
          buildingType={activeBuilding.buildingType}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleEdit}
          >
            <Pencil className="h-4 w-4" />
            <span className="sr-only">{t("buildings.edit")}</span>
          </Button>
          {activeIsAdmin && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">{t("buildings.delete")}</span>
            </Button>
          )}
        </BuildingHeaderTitle>
        <BuildingHeaderBadge status={activeBuilding.status} />
      </BuildingHeaderRoot>
    )
  },
  {
    Root: BuildingHeaderRoot,
    Back: BuildingHeaderBack,
    Title: BuildingHeaderTitle,
    Actions: BuildingHeaderActions,
    Badge: BuildingHeaderBadge,
  },
)

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
