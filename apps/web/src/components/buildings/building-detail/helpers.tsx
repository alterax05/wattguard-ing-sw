import type { BuildingDetail as BuildingDetailType } from "@/hooks/use-buildings"
import type { SensorWithBuilding } from "@/hooks/use-sensors"
import type { DateRange } from "react-day-picker"
import { Zap, Thermometer, Wind, Flame } from "lucide-react"
import type { HistoryParams } from "@/hooks/use-buildings"

export function getBuildingTypeName(bt: BuildingDetailType["buildingType"]): string {
  if (!(bt instanceof Object)) return bt
  return bt.name
}

export function isDistrictHeating(heatingSystemType: string): boolean {
  const t = heatingSystemType.toLowerCase()
  return t.includes("teleriscaldamento") || t.includes("district")
}

export function getSensorIcon(sensorType: SensorWithBuilding["sensorType"]) {
  switch (sensorType) {
    case "internal_temp":
      return <Thermometer className="h-4 w-4" />
    case "external_temp":
      return <Wind className="h-4 w-4" />
    case "energy_meter":
      return <Zap className="h-4 w-4" />
    case "gas_meter":
      return <Flame className="h-4 w-4" />
  }
}

export function getDefaultDateRange(): DateRange {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return { from: start, to: end }
}

export type SensorTypeKey = HistoryParams["sensorType"] & string

export const SENSOR_TYPE_CONFIG = {
  energy_meter: {
    labelKey: "sensors.type.energy_meter",
    unit: "kWh",
    color: "var(--chart-1)",
    icon: Zap,
  },
  internal_temp: {
    labelKey: "sensors.type.internal_temp",
    unit: "°C",
    color: "var(--chart-2)",
    icon: Thermometer,
  },
  external_temp: {
    labelKey: "sensors.type.external_temp",
    unit: "°C",
    color: "var(--chart-3)",
    icon: Thermometer,
  },
  gas_meter: {
    labelKey: "sensors.type.gas_meter",
    unit: "m³",
    color: "var(--chart-4)",
    icon: Flame,
  },
} satisfies Record<
  SensorTypeKey,
  {
    labelKey: string
    unit: string
    color: string
    icon: typeof Zap
  }
>

export const SENSORS_PAGE_SIZE = 4

export function getPaginationItems(
  current: number,
  total: number,
): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const items: (number | "ellipsis")[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) items.push("ellipsis")
  for (let p = start; p <= end; p++) items.push(p)
  if (end < total - 1) items.push("ellipsis")
  items.push(total)
  return items
}
