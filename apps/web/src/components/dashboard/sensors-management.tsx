import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useSensors, type SensorWithBuilding, type SensorType, type SensorStatus } from "@/hooks/use-sensors"
import { useBuildings } from "@/hooks/use-buildings"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Activity, Zap, Flame, Thermometer, Wind, AlertCircle, Search, RefreshCw } from "lucide-react"
import { SensorDetailDialog } from "./sensor-detail-dialog"
import { useQueryClient } from "@tanstack/react-query"
import { SENSORS_QUERY_KEY } from "@/hooks/use-sensors"
import { getIntlLocale } from "@/lib/dates"
import { toast } from "sonner"

function getSensorIcon(sensorType: SensorType) {
  switch (sensorType) {
    case "energy_meter":
      return <Zap className="h-4 w-4" />
    case "gas_meter":
      return <Flame className="h-4 w-4" />
    case "internal_temp":
      return <Thermometer className="h-4 w-4" />
    case "external_temp":
      return <Wind className="h-4 w-4" />
    default:
      return <Activity className="h-4 w-4" />
  }
}

function getStatusColor(status: SensorStatus) {
  switch (status) {
    case "active":
      return "bg-chart-3 text-white"
    case "inactive":
      return "bg-muted text-muted-foreground"
    case "maintenance":
      return "bg-chart-4 text-foreground"
    case "error":
      return "bg-destructive text-destructive-foreground"
  }
}

function getSensorUnit(sensorType: SensorType) {
  switch (sensorType) {
    case "internal_temp":
    case "external_temp":
      return "°C"
    case "energy_meter":
      return "kWh"
    case "gas_meter":
      return "m³"
  }
}

type TabKey = "all" | "energy_meter" | "gas_meter" | "internal_temp" | "external_temp"

export function SensorsManagement() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState("")
  const [buildingFilter, setBuildingFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedSensor, setSelectedSensor] = useState<SensorWithBuilding | null>(null)

  const { data: sensorsData, isLoading: sensorsLoading } = useSensors()
  const { data: buildingsData } = useBuildings({ limit: "100" })

  const sensors = sensorsData?.sensors ?? []
  const buildings = buildingsData?.buildings ?? []

  const filteredSensors = sensors.filter((sensor: SensorWithBuilding) => {
    const matchesSearch =
      sensor.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sensor.building?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sensor.serialNumber?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesBuilding = buildingFilter === "all" || sensor.buildingId === buildingFilter
    const matchesStatus = statusFilter === "all" || sensor.status === statusFilter
    return matchesSearch && matchesBuilding && matchesStatus
  })

  const sensorsByType: Record<TabKey, SensorWithBuilding[]> = {
    all: filteredSensors,
    energy_meter: filteredSensors.filter((s: SensorWithBuilding) => s.sensorType === "energy_meter"),
    gas_meter: filteredSensors.filter((s: SensorWithBuilding) => s.sensorType === "gas_meter"),
    internal_temp: filteredSensors.filter((s: SensorWithBuilding) => s.sensorType === "internal_temp"),
    external_temp: filteredSensors.filter((s: SensorWithBuilding) => s.sensorType === "external_temp"),
  }

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: SENSORS_QUERY_KEY })
    toast.success(t("sensors.dataRefreshed"))
  }

  const intlLocale = getIntlLocale()

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("sensors.filtersTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("sensors.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={buildingFilter} onValueChange={setBuildingFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t("sensors.building")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("sensors.allBuildings")}</SelectItem>
                {buildings.map((building) => (
                  <SelectItem key={building.id} value={building.id}>
                    {building.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t("common.status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("sensors.allStatuses")}</SelectItem>
                <SelectItem value="active">{t("sensors.status.active")}</SelectItem>
                <SelectItem value="inactive">{t("sensors.status.inactive")}</SelectItem>
                <SelectItem value="maintenance">{t("sensors.status.maintenance")}</SelectItem>
                <SelectItem value="error">{t("sensors.status.error")}</SelectItem>
              </SelectContent>
            </Select>

            <Button onClick={handleRefresh} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("common.refresh")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="all">{t("sensors.all", { count: sensorsByType.all.length })}</TabsTrigger>
          <TabsTrigger value="energy_meter">
            <Zap className="mr-2 h-4 w-4" />
            {t("sensors.energy", { count: sensorsByType.energy_meter.length })}
          </TabsTrigger>
          <TabsTrigger value="gas_meter">
            <Flame className="mr-2 h-4 w-4" />
            {t("sensors.gas", { count: sensorsByType.gas_meter.length })}
          </TabsTrigger>
          <TabsTrigger value="internal_temp">
            <Thermometer className="mr-2 h-4 w-4" />
            {t("sensors.tempInternalShort", { count: sensorsByType.internal_temp.length })}
          </TabsTrigger>
          <TabsTrigger value="external_temp">
            <Wind className="mr-2 h-4 w-4" />
            {t("sensors.tempExternalShort", { count: sensorsByType.external_temp.length })}
          </TabsTrigger>
        </TabsList>

        {(Object.entries(sensorsByType) as [TabKey, SensorWithBuilding[]][]).map(([type, typeSensors]) => (
          <TabsContent key={type} value={type} className="mt-6">
            {sensorsLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i}>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-8 w-8 rounded-lg" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                      <Skeleton className="h-5 w-14" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-8 w-20" />
                      <Skeleton className="mt-2 h-3 w-32" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {typeSensors.length === 0 ? (
                  <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                    <AlertCircle className="mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{t("sensors.notFound")}</p>
                  </div>
                ) : (
                  typeSensors.map((sensor) => (
                    <Card
                      key={sensor.id}
                      className="cursor-pointer transition-colors hover:bg-muted/50"
                      onClick={() => setSelectedSensor(sensor)}
                    >
                      <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <div className="flex items-center gap-2">
                          <div className="rounded-lg bg-primary/10 p-2 text-primary">
                            {getSensorIcon(sensor.sensorType)}
                          </div>
                          <div>
                            <p className="text-sm font-medium leading-none">{sensor.location}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {sensor.building?.name ?? "—"}
                            </p>
                          </div>
                        </div>
                        <Badge className={getStatusColor(sensor.status)} variant="secondary">
                          {t(`sensors.status.${sensor.status}`, { defaultValue: sensor.status })}
                        </Badge>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="flex items-baseline justify-between">
                            <span className="text-2xl font-bold">
                              {sensor.lastReading?.value?.toFixed(2) ?? t("common.na")}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {sensor.lastReading?.unit ?? getSensorUnit(sensor.sensorType)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {t(`sensors.type.${sensor.sensorType}`, { defaultValue: sensor.sensorType })}
                          </p>
                          {sensor.lastReading?.timestamp && (
                            <p className="text-xs text-muted-foreground">
                              {t("sensors.lastUpdate", {
                                date: new Date(sensor.lastReading.timestamp).toLocaleString(intlLocale),
                              })}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {selectedSensor && (
        <SensorDetailDialog
          sensor={selectedSensor}
          open={!!selectedSensor}
          onOpenChange={(open) => { if (!open) setSelectedSensor(null) }}
        />
      )}
    </>
  )
}
