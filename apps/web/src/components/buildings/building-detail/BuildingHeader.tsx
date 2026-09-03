import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { ArrowLeft, Building2, MapPin, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { BuildingStatusBadge } from "../building-status-badge"
import { getBuildingTypeName } from "./helpers"
import type { BuildingDetail } from "@/hooks/use-buildings"

export interface BuildingHeaderProps {
  building: BuildingDetail
  isAdmin: boolean
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
  children?: ReactNode
}

export function BuildingHeaderRoot({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-4">{children}</div>
}

export function BuildingHeaderBack({ onClick }: { onClick?: () => void }) {
  const { t } = useTranslation()

  return (
    <Button variant="ghost" size="icon" onClick={onClick}>
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
  name: string
  address: string
  buildingType?: BuildingDetail["buildingType"]
  children?: ReactNode
}) {
  return (
    <div className="flex-1">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-balance">
        {name}
        {children}
      </h1>
      <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" />
        {address}
        {buildingType && (
          <>
            <Separator orientation="vertical" className="h-3.5" />
            <span>{getBuildingTypeName(buildingType)}</span>
          </>
        )}
      </div>
    </div>
  )
}

export function BuildingHeaderBadge({ status }: { status: BuildingDetail["status"] }) {
  return <BuildingStatusBadge status={status} className="text-sm" />
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

    if (children) {
      return <BuildingHeaderRoot>{children}</BuildingHeaderRoot>
    }

    return (
      <BuildingHeaderRoot>
        <BuildingHeaderBack onClick={onBack} />
        <BuildingHeaderTitle
          name={building.name}
          address={building.address}
          buildingType={building.buildingType}
        >
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
        </BuildingHeaderTitle>
        <BuildingHeaderBadge status={building.status} />
      </BuildingHeaderRoot>
    )
  },
  {
    Root: BuildingHeaderRoot,
    Back: BuildingHeaderBack,
    Title: BuildingHeaderTitle,
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
