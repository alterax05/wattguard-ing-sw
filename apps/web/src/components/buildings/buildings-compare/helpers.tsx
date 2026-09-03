import { Cloud, CloudRain, CloudSnow, Sun } from "lucide-react"
import type { TFunction } from "i18next"
import type { DateRange } from "react-day-picker"
import type { BuildingDetail } from "@/hooks/use-buildings"

export function getWeatherIcon(code: number) {
  if (code === 0 || code === 1)
    return <Sun className="h-5 w-5 text-amber-500" />
  if (code >= 2 && code <= 3)
    return <Cloud className="h-5 w-5 text-muted-foreground" />
  if (code >= 51 && code <= 67)
    return <CloudRain className="h-5 w-5 text-blue-500" />
  if (code >= 71 && code <= 77)
    return <CloudSnow className="h-5 w-5 text-sky-300" />
  if (code >= 80 && code <= 99)
    return <CloudRain className="h-5 w-5 text-blue-500" />
  return <Cloud className="h-5 w-5 text-muted-foreground" />
}

export function getWeatherLabel(code: number, t: TFunction) {
  if (code === 0) return t("map.weather.clear")
  if (code === 1) return t("map.weather.mostlyClear")
  if (code === 2) return t("map.weather.partlyCloudy")
  if (code === 3) return t("map.weather.overcast")
  if (code >= 51 && code <= 55) return t("map.weather.drizzle")
  if (code >= 61 && code <= 65) return t("map.weather.rain")
  if (code >= 71 && code <= 75) return t("map.weather.snow")
  if (code >= 80 && code <= 82) return t("map.weather.showers")
  if (code >= 95 && code <= 99) return t("map.weather.thunderstorm")
  return t("common.na")
}

export function getBuildingTypeName(bt: BuildingDetail["buildingType"]): string {
  if (!(bt instanceof Object)) return bt
  return bt.name
}

export function getDefaultDateRange(): DateRange {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return { from: start, to: end }
}
