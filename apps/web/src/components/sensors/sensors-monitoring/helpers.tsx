import { Flame, Thermometer, Wind, Zap } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { getDateFnsLocale, getIntlLocale } from "@/lib/dates"
import type { SensorType, SensorWithBuilding } from "@/hooks/use-sensors"
import type { MonitoringStatus } from "@/lib/sensor-status"

export type SensorGroup = "all" | "thermometers" | "meters"
export type StatusFilter = "all" | MonitoringStatus

export const SENSOR_GROUPS: SensorGroup[] = ["all", "thermometers", "meters"]

export function getSensorIcon(sensorType: SensorType) {
  switch (sensorType) {
    case "energy_meter":
      return <Zap className="h-4 w-4" />
    case "gas_meter":
      return <Flame className="h-4 w-4" />
    case "internal_temp":
      return <Thermometer className="h-4 w-4" />
    case "external_temp":
      return <Wind className="h-4 w-4" />
  }
}

export function getSensorUnit(sensorType: SensorType) {
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

export function belongsToGroup(sensor: SensorWithBuilding, group: SensorGroup) {
  if (group === "all") return true
  if (group === "thermometers") {
    return sensor.sensorType === "internal_temp" || sensor.sensorType === "external_temp"
  }
  return sensor.sensorType === "energy_meter" || sensor.sensorType === "gas_meter"
}

export function getLastUpdate(timestamp?: string) {
  if (!timestamp) return null

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return null

  return {
    relative: formatDistanceToNow(date, { addSuffix: true, locale: getDateFnsLocale() }),
    absolute: date.toLocaleString(getIntlLocale()),
  }
}
