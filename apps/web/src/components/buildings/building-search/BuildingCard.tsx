import type { ReactNode } from "react"
import { MapPin, Radio, Zap } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { BuildingStatusBadge } from "../building-status-badge"
import type { BuildingSummary } from "@/hooks/use-buildings"
import { MAX_COMPARE_BUILDINGS } from "@/lib/constants"

function getBuildingTypeName(bt: BuildingSummary["buildingType"]): string {
  if (!(bt instanceof Object)) return bt
  return bt.name
}

export interface BuildingCardRootProps {
  isSelected?: boolean
  onClick?: () => void
  className?: string
  children: ReactNode
}

export function BuildingCardRoot({
  isSelected,
  onClick,
  className,
  children,
}: BuildingCardRootProps) {
  return (
    <Card
      className={cn(
        "group cursor-pointer transition-all hover:shadow-md",
        isSelected ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-border",
        className,
      )}
      onClick={onClick}
    >
      <CardContent>
        <div className="flex items-start gap-3">{children}</div>
      </CardContent>
    </Card>
  )
}

export interface BuildingCardCheckboxProps {
  checked: boolean
  disabled?: boolean
  onCheckedChange: () => void
  className?: string
}

export function BuildingCardCheckbox({
  checked,
  disabled,
  onCheckedChange,
  className,
}: BuildingCardCheckboxProps) {
  return (
    <div
      className={cn("pt-0.5", className)}
      onClick={(e) => {
        e.stopPropagation()
        if (disabled) return
        onCheckedChange()
      }}
    >
      <Checkbox checked={checked} disabled={disabled} />
    </div>
  )
}

export interface BuildingCardBodyProps {
  building: BuildingSummary
  className?: string
}

export function BuildingCardBody({ building, className }: BuildingCardBodyProps) {
  const { t } = useTranslation()

  return (
    <div className={cn("flex-1 space-y-3", className)}>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold leading-tight text-foreground transition-colors group-hover:text-primary">
            {building.name}
          </h3>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {building.address}
          </div>
        </div>
        <Badge variant="secondary" className="shrink-0 text-xs">
          {getBuildingTypeName(building.buildingType)}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex items-center gap-1.5">
          <BuildingStatusBadge status={building.status} />
        </div>
        <Separator orientation="vertical" className="h-4" />
        <div
          className="flex items-center gap-1 text-xs text-muted-foreground"
          title={t("buildings.activeSensors")}
        >
          <Radio className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{building.activeSensors}</span>
        </div>
        {building.currentConsumption !== null && (
          <>
            <Separator orientation="vertical" className="h-4" />
            <div
              className="flex items-center gap-1 text-xs"
              title={t("buildings.currentConsumption")}
            >
              <Zap className="h-3.5 w-3.5 text-chart-1" />
              <span className="font-medium text-chart-1">
                {building.currentConsumption.toFixed(1)} {t("common.kwh")}
              </span>
            </div>
          </>
        )}
        <Separator orientation="vertical" className="h-4" />
        <div className="text-xs text-muted-foreground">
          {building.surface} {t("common.squareMeters")}
        </div>
      </div>
    </div>
  )
}

export interface BuildingCardProps {
  building: BuildingSummary
  isSelected: boolean
  isAdmin: boolean
  selectedCount: number
  onToggleSelect: (id: string) => void
  onBuildingClick: (id: string) => void
}

export const BuildingCard = Object.assign(
  function BuildingCard({
    building,
    isSelected,
    isAdmin,
    selectedCount,
    onToggleSelect,
    onBuildingClick,
  }: BuildingCardProps) {
    return (
      <BuildingCardRoot
        isSelected={isSelected}
        onClick={() => {
          onBuildingClick(building._id)
        }}
      >
        {isAdmin && (
          <BuildingCardCheckbox
            checked={isSelected}
            disabled={!isSelected && selectedCount >= MAX_COMPARE_BUILDINGS}
            onCheckedChange={() => {
              onToggleSelect(building._id)
            }}
          />
        )}
        <BuildingCardBody building={building} />
      </BuildingCardRoot>
    )
  },
  {
    Root: BuildingCardRoot,
    Checkbox: BuildingCardCheckbox,
    Body: BuildingCardBody,
  },
)
