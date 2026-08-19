import { useTranslation } from "react-i18next"
import { useBuildings, type BuildingSummary } from "@/hooks/use-buildings"
import { Building2, Activity, Zap, Radio } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { BuildingStatusBadge } from "./building-status-badge"

function getBuildingTypeName(bt: BuildingSummary["buildingType"]): string {
  if (typeof bt === "string") return bt
  return bt.name
}

export function BuildingsList() {
  const { data, isLoading, isError } = useBuildings({ limit: "5" })
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (isError || !data) {
    return <div className="text-sm text-muted-foreground">{t("buildings.loadError")}</div>
  }

  const buildings = data.buildings

  if (buildings.length === 0) {
    return <div className="text-sm text-muted-foreground">{t("buildings.notFound")}</div>
  }

  return (
    <div className="space-y-3">
      {buildings.map((building) => (
        <div
          key={building.id}
          className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">{building.name}</p>
              <p className="text-xs text-muted-foreground">
                {getBuildingTypeName(building.buildingType)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <BuildingStatusBadge status={building.status} icon={<Activity className="h-3 w-3" />} />
            <span className="flex items-center gap-1 text-xs text-muted-foreground" title={t("buildings.activeSensors")}>
              <Radio className="h-3 w-3" />
              {building.activeSensors}
            </span>
            {building.currentConsumption !== null && (
              <span className="flex items-center gap-1 text-sm font-semibold text-chart-1" title={t("buildings.currentConsumption")}>
                <Zap className="h-3 w-3" />
                {building.currentConsumption.toFixed(1)} {t("common.kwh")}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
