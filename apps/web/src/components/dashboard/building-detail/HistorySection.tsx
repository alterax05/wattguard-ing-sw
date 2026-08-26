import { useTranslation } from "react-i18next"
import type { DateRange } from "react-day-picker"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { DateRangePicker } from "../date-range-picker"
import { SENSOR_TYPE_CONFIG, type SensorTypeKey } from "./helpers"
import { AlertCircle } from "lucide-react"

interface HistorySectionProps {
  range: DateRange | undefined
  onRangeChange: (range: DateRange | undefined) => void
  selectedSensorType: SensorTypeKey
  onSelectedSensorTypeChange: (type: SensorTypeKey) => void
  historyLoading: boolean
  chartData: { timestamp: string; value: number; sensorType: string; unit: string }[]
}

export function HistorySection({
  range,
  onRangeChange,
  selectedSensorType,
  onSelectedSensorTypeChange,
  historyLoading,
  chartData,
}: HistorySectionProps) {
  const { t } = useTranslation()

  return (
    <>
      <Card>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">{t("buildings.analysisPeriod")}</span>
            <DateRangePicker value={range} onChange={onRangeChange} />
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">{t("buildings.historicalData")}</CardTitle>
            <Tabs
              value={selectedSensorType}
              onValueChange={(v) => {
                // SAFETY: the Tabs only render the four sensor types defined in SENSOR_TYPE_CONFIG.
                onSelectedSensorTypeChange(v as SensorTypeKey)
              }}
            >
              <TabsList className="h-8">
                {(
                  // SAFETY: Object.entries widens the keys; SENSOR_TYPE_CONFIG declares exactly the SensorTypeKey entries.
                  Object.entries(SENSOR_TYPE_CONFIG) as [
                    SensorTypeKey,
                    (typeof SENSOR_TYPE_CONFIG)[SensorTypeKey],
                  ][]
                ).map(([key, cfg]) => {
                  const Icon = cfg.icon
                  return (
                    <TabsTrigger key={key} value={key} className="gap-1 text-xs px-2.5">
                      <Icon className="h-3 w-3" />
                      {t(cfg.labelKey)}
                    </TabsTrigger>
                  )
                })}
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-sm text-muted-foreground">
              <AlertCircle className="mb-2 h-8 w-8" />
              {t("buildings.noDataForPeriod", {
                label: t(SENSOR_TYPE_CONFIG[selectedSensorType].labelKey),
              })}
            </div>
          ) : (
            <ChartContainer
              config={{
                value: {
                  label: `${t(SENSOR_TYPE_CONFIG[selectedSensorType].labelKey)} (${SENSOR_TYPE_CONFIG[selectedSensorType].unit})`,
                  color: SENSOR_TYPE_CONFIG[selectedSensorType].color,
                },
              }}
              className="h-72 w-full aspect-auto"
            >
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="timestamp"
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  tickFormatter={(v) =>
                    `${v} ${SENSOR_TYPE_CONFIG[selectedSensorType].unit}`
                  }
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) =>
                        `${String(value)} ${SENSOR_TYPE_CONFIG[selectedSensorType].unit}`
                      }
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={SENSOR_TYPE_CONFIG[selectedSensorType].color}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </>
  )
}
