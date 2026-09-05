import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import {
  Activity,
  CheckCircle2,
  Radio,
  RefreshCw,
  Search,
  Thermometer,
  WifiOff,
  Zap,
} from "lucide-react"
import { useBuildings } from "@/hooks/use-buildings"
import {
  SENSORS_QUERY_KEY,
  useAllSensors,
  type Sensor,
} from "@/hooks/use-sensors"
import { usePollingInterval } from "@/hooks/use-settings"
import { getMonitoringStatus } from "@/lib/sensor-status"
import { cn } from "@/lib/utils"
import { getIntlLocale } from "@/lib/dates"
import { SensorDetailDialog } from "./sensor-detail-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"

import type { SensorGroup, StatusFilter } from "./sensors-monitoring/helpers"
import { SENSOR_GROUPS, belongsToGroup } from "./sensors-monitoring/helpers"
import { MonitoringStatCard } from "./sensors-monitoring/MonitoringStatCard"
import { SensorTable } from "./sensors-monitoring/SensorTable"

export function SensorsMonitoring() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState("")
  const [buildingFilter, setBuildingFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [sensorGroup, setSensorGroup] = useState<SensorGroup>("all")
  const [selectedSensor, setSelectedSensor] = useState<Sensor | null>(null)
  const pollingInterval = usePollingInterval()

  const {
    data: sensorsData,
    isLoading: sensorsLoading,
    isFetching: sensorsFetching,
    error: sensorsError,
  } = useAllSensors(undefined, { refetchInterval: pollingInterval })
  const { data: buildingsData } = useBuildings({ limit: "100" })

  const sensors = sensorsData?.sensors ?? []
  const buildings = buildingsData?.buildings ?? []
  const intlLocale = getIntlLocale()
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase(intlLocale)

  const filteredSensors = sensors.filter((sensor) => {
    const building = sensor.building instanceof Object ? sensor.building : null
    const buildingName = building?.name
    const buildingAddress = building?.address
    const searchableText = [
      sensor.location,
      sensor.serialNumber,
      buildingName,
      buildingAddress,
      t(`sensors.type.${sensor.sensorType}`, { defaultValue: sensor.sensorType }),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase(intlLocale)
    const matchesSearch = !normalizedSearch || searchableText.includes(normalizedSearch)
    const sensorBuildingId = building ? building._id : sensor.building
    const matchesBuilding = buildingFilter === "all" || sensorBuildingId === buildingFilter
    const matchesStatus = statusFilter === "all" || getMonitoringStatus(sensor) === statusFilter

    return matchesSearch && matchesBuilding && matchesStatus
  })

  const totalSensors = sensorsData?.pagination.total ?? sensors.length
  const activeSensors = sensors.filter((sensor) => getMonitoringStatus(sensor) === "active").length
  const offlineSensors = sensors.filter((sensor) => getMonitoringStatus(sensor) === "offline").length
  const thermometerSensors = sensors.filter((sensor) => belongsToGroup(sensor, "thermometers")).length
  const meterSensors = sensors.filter((sensor) => belongsToGroup(sensor, "meters")).length
  const errorMessage = sensorsError instanceof Error
    ? sensorsError.message
    : sensorsError
      ? t("sensors.genericLoadError")
      : undefined

  const handleRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: SENSORS_QUERY_KEY })
    toast.success(t("sensors.dataRefreshed"))
  }

  const handleRetry = () => {
    void queryClient.invalidateQueries({ queryKey: SENSORS_QUERY_KEY })
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MonitoringStatCard
          icon={<Radio className="h-5 w-5" />}
          label={t("sensors.total")}
          value={sensorsLoading ? "..." : totalSensors}
          description={t("sensors.totalDescription")}
        />
        <MonitoringStatCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label={t("sensors.status.active")}
          value={sensorsLoading ? "..." : activeSensors}
          description={t("sensors.activeDescription")}
          className="border-chart-3/30"
        />
        <MonitoringStatCard
          icon={<WifiOff className="h-5 w-5" />}
          label={t("sensors.status.offline")}
          value={sensorsLoading ? "..." : offlineSensors}
          description={t("sensors.offlineDescription")}
          className="border-muted-foreground/30"
        />
        <MonitoringStatCard
          icon={<Thermometer className="h-5 w-5" />}
          label={t("sensors.thermometers")}
          value={sensorsLoading ? "..." : thermometerSensors}
          description={t("sensors.thermometersDescription")}
        />
        <MonitoringStatCard
          icon={<Zap className="h-5 w-5" />}
          label={t("sensors.meters")}
          value={sensorsLoading ? "..." : meterSensors}
          description={t("sensors.metersDescription")}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>{t("sensors.filtersTitle")}</CardTitle>
              <CardDescription>
                {t("sensors.autoRefresh")}
                {sensorsFetching && t("sensors.refreshing")}
              </CardDescription>
            </div>
            <Button variant="outline" onClick={handleRefresh} disabled={sensorsFetching}>
              <RefreshCw className={cn("mr-2 h-4 w-4", sensorsFetching && "animate-spin")} />
              {t("common.refresh")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("sensors.searchPlaceholderMonitoring")}
                value={searchQuery}
                onChange={(event) => { setSearchQuery(event.target.value) }}
                className="pl-9"
                aria-label={t("sensors.searchAria")}
              />
            </div>
            <Select value={buildingFilter} onValueChange={setBuildingFilter}>
              <SelectTrigger aria-label={t("sensors.filterByBuilding")}>
                <SelectValue placeholder={t("sensors.building")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("sensors.allBuildings")}</SelectItem>
                {buildings.map((building) => (
                  <SelectItem key={building._id} value={building._id}>
                    {building.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                // SAFETY: the Select only offers the monitoring statuses plus "all".
                setStatusFilter(value as StatusFilter)
              }}
            >
              <SelectTrigger aria-label={t("sensors.filterByStatus")}>
                <SelectValue placeholder={t("sensors.operationalStatus")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("sensors.allStatuses")}</SelectItem>
                <SelectItem value="active">{t("sensors.status.active")}</SelectItem>
                <SelectItem value="offline">{t("sensors.status.offline")}</SelectItem>
                <SelectItem value="maintenance">{t("sensors.status.maintenance")}</SelectItem>
                <SelectItem value="error">{t("sensors.status.error")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Tabs
        value={sensorGroup}
        onValueChange={(value) => {
          // SAFETY: the Tabs only render the three sensor groups defined in SENSOR_GROUPS.
          setSensorGroup(value as SensorGroup)
        }}
        className="w-full"
      >
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="all">
            {t("common.all")} <span className="ml-1 text-muted-foreground">({filteredSensors.length})</span>
          </TabsTrigger>
          <TabsTrigger value="thermometers">
            <Thermometer className="mr-2 h-4 w-4" />
            {t("sensors.thermometersWithCount", { count: filteredSensors.filter((sensor) => belongsToGroup(sensor, "thermometers")).length })}
          </TabsTrigger>
          <TabsTrigger value="meters">
            <Activity className="mr-2 h-4 w-4" />
            {t("sensors.metersWithCount", { count: filteredSensors.filter((sensor) => belongsToGroup(sensor, "meters")).length })}
          </TabsTrigger>
        </TabsList>

        {SENSOR_GROUPS.map((group) => (
          <TabsContent key={group} value={group} className="mt-4">
            <SensorTable
              sensors={filteredSensors.filter((sensor) => belongsToGroup(sensor, group))}
              isLoading={sensorsLoading}
              errorMessage={errorMessage}
              onRetry={handleRetry}
              onSelect={setSelectedSensor}
            />
          </TabsContent>
        ))}
      </Tabs>

      {selectedSensor && (
        <SensorDetailDialog
          sensor={selectedSensor}
          open={!!selectedSensor}
          onOpenChange={(open) => {
            if (!open) setSelectedSensor(null)
          }}
        />
      )}
    </div>
  )
}
