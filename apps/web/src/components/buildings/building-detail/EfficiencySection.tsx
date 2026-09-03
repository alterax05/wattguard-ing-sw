import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Gauge, TrendingDown, AlertCircle, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useBuildingEfficiency, useUpdateBuilding } from "@/hooks/use-buildings"
import { isDistrictHeating } from "./helpers"
import type { BuildingDetail } from "@/hooks/use-buildings"
import type { DateRange } from "react-day-picker"
import { toIsoDate } from "@/lib/dates"
import { endOfDay } from "date-fns"
import { toast } from "sonner"
import { useMemo } from "react"
import { useOptionalBuildingDetailContext } from "./BuildingDetailContext"

export interface EfficiencySectionProps {
  building?: BuildingDetail
  range?: DateRange | undefined
}

export function EfficiencySection(props: EfficiencySectionProps = {}) {
  const ctx = useOptionalBuildingDetailContext()
  const building = props.building ?? ctx?.state.building
  const range = props.range ?? ctx?.state.range

  const efficiencyParams = useMemo(() => {
    const startDate = toIsoDate(range?.from)
    const endDate = toIsoDate(range?.to ? endOfDay(range.to) : undefined)
    if (!startDate || !endDate) return undefined
    return { startDate, endDate }
  }, [range])

  const { data: efficiencyData, isLoading: efficiencyLoading } =
    useBuildingEfficiency(building?.id, efficiencyParams)

  if (!building) return null

  // Use key to reset form when building changes, instead of syncing via effect
  return (
    <EfficiencyThresholdForm
      key={building.id}
      building={building}
      efficiencyData={efficiencyData}
      efficiencyLoading={efficiencyLoading}
    />
  )
}

function EfficiencyThresholdForm({
  building,
  efficiencyData,
  efficiencyLoading,
}: {
  building: BuildingDetail
  efficiencyData: ReturnType<typeof useBuildingEfficiency>["data"]
  efficiencyLoading: boolean
}) {
  const { t } = useTranslation()
  const updateBuilding = useUpdateBuilding()

  const [effEnabled, setEffEnabled] = useState(
    building.efficiencyThresholds?.enabled ?? false
  )
  const [effMinCop, setEffMinCop] = useState(
    building.efficiencyThresholds?.minCop != null
      ? String(building.efficiencyThresholds.minCop)
      : ""
  )
  const [effDirty, setEffDirty] = useState(false)

  const handleSaveThreshold = () => {
    const parsed = effMinCop.trim() === "" ? null : Number(effMinCop)
    if (
      effEnabled &&
      (parsed === null || Number.isNaN(parsed) || parsed < 0 || parsed > 10)
    ) {
      toast.error(t("buildings.invalidMinCop"))
      return
    }
    updateBuilding.mutate(
      {
        id: building.id,
        efficiencyThresholds: { enabled: effEnabled, minCop: parsed },
      },
      {
        onSuccess: () => {
          setEffDirty(false)
          toast.success(t("buildings.efficiencyThresholdSaved"))
        },
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : t("buildings.efficiencyThresholdSaveError")
          )
        },
      }
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4" />
          {t("buildings.energyEfficiency")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {efficiencyLoading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-2 h-6 w-16" />
              </div>
            ))}
          </div>
        ) : efficiencyData ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                {t("buildings.efficiencyCop")}
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {efficiencyData.metrics.averageCop != null
                  ? efficiencyData.metrics.averageCop.toFixed(2)
                  : t("common.na")}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <TrendingDown className="h-3 w-3" />
                  {t("buildings.efficiencyInsulation")}
                </span>
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {efficiencyData.metrics.insulationQuality != null
                  ? `${efficiencyData.metrics.insulationQuality.toFixed(2)}`
                  : t("common.na")}
              </p>
              <p className="text-[10px] text-muted-foreground">
                W/(m²·K) -{" "}
                {efficiencyData.metrics.estimatedHeatLossCoefficient != null
                  ? t("buildings.efficiencyHeatLoss", {
                      value: efficiencyData.metrics.estimatedHeatLossCoefficient.toFixed(0),
                    })
                  : ""}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{t("buildings.totalConsumption")}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {efficiencyData.metrics.totalEnergyConsumed.toFixed(1)} {t("common.kwh")}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {efficiencyData.metrics.averageExternalTemperature != null
                  ? t("buildings.efficiencyAvgTemp", {
                      value: efficiencyData.metrics.averageExternalTemperature.toFixed(1),
                    })
                  : ""}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            <AlertCircle className="mr-2 h-4 w-4" />
            {t("buildings.efficiencyUnavailable")}
          </div>
        )}
        <div className="mt-4 border-t pt-4">
          {isDistrictHeating(building.heatingSystemType) ? (
            <p className="text-sm text-muted-foreground">
              {t("buildings.efficiencyUnavailableDistrict")}
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{t("buildings.efficiencyAlertTitle")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("buildings.efficiencyAlertDescription")}
                  </p>
                </div>
                <Switch
                  checked={effEnabled}
                  onCheckedChange={(checked) => {
                    setEffEnabled(checked)
                    setEffDirty(true)
                  }}
                />
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1">
                  <label
                    className="text-xs text-muted-foreground"
                    htmlFor="eff-min-cop"
                  >
                    {t("buildings.minCop")}
                  </label>
                  <Input
                    id="eff-min-cop"
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    value={effMinCop}
                    disabled={!effEnabled}
                    placeholder={t("buildings.minCopPlaceholder")}
                    onChange={(e) => {
                      setEffMinCop(e.target.value)
                      setEffDirty(true)
                    }}
                  />
                </div>
                <Button
                  size="sm"
                  onClick={handleSaveThreshold}
                  disabled={!effDirty || updateBuilding.isPending}
                >
                  {updateBuilding.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("common.save")
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
