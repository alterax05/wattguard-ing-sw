import { useTranslation } from "react-i18next"
import { Activity, Building2, Thermometer, Zap } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import type { BuildingDetail, RealTimeData } from "@/hooks/use-buildings"

export interface StatsGridProps {
  building: BuildingDetail
  realTimeData?: RealTimeData
  activeSensors: number
  totalSensors: number
}

export function StatsGrid({
  building,
  realTimeData,
  activeSensors,
  totalSensors,
}: StatsGridProps) {
  const { t } = useTranslation()
  const rt = realTimeData

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent className="flex flex-col items-center justify-center pt-6 text-center">
          <Zap className="mb-2 h-5 w-5 text-chart-1" />
          <p className="text-2xl font-bold">
            {rt?.data.energyConsumption.value != null
              ? `${rt.data.energyConsumption.value}`
              : "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("buildings.currentPower", {
              unit: rt?.data.energyConsumption.unit ?? "W",
            })}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col items-center justify-center pt-6 text-center">
          <Thermometer className="mb-2 h-5 w-5 text-chart-5" />
          <p className="text-2xl font-bold">
            {rt?.data.internalTemperature.value != null
              ? `${rt.data.internalTemperature.value}°`
              : "—"}
          </p>
          <p className="text-xs text-muted-foreground">{t("sensors.type.internal_temp")}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col items-center justify-center pt-6 text-center">
          <Activity className="mb-2 h-5 w-5 text-chart-3" />
          <p className="text-2xl font-bold">{activeSensors}</p>
          <p className="text-xs text-muted-foreground">
            {t("buildings.activeSensorsOf", { total: totalSensors })}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col items-center justify-center pt-6 text-center">
          <Building2 className="mb-2 h-5 w-5 text-chart-2" />
          <p className="text-2xl font-bold">{building?.surface ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{t("buildings.surfaceLabel")}</p>
        </CardContent>
      </Card>
    </div>
  )
}
