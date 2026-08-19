import { useEffect, useMemo, useState } from "react"
import { endOfDay } from "date-fns"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import type { DateRange } from "react-day-picker"
import { useNavigate } from "react-router-dom"
import { toIsoDate } from "@/lib/dates"
import { useQueries } from "@tanstack/react-query"
import { client } from "@/lib/api"
import { errorMessage } from "@/lib/errors"
import { DateRangePicker } from "./date-range-picker"
import {
  BUILDINGS_QUERY_KEY,
  type BuildingDetail,
  type EfficiencyMetrics,
} from "@/hooks/use-buildings"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { BuildingStatusBadge } from "./building-status-badge"
import {
  ArrowLeft,
  Building2,
  MapPin,
  Zap,
  Activity,
  Cloud,
  Sun,
  CloudRain,
  CloudSnow,
  Gauge,
  AlertCircle,
  Radio,
} from "lucide-react"

interface WeatherData {
  temperature: number
  humidity: number
  windSpeed: number
  weatherCode: number
}

function getWeatherIcon(code: number) {
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

function getWeatherLabel(code: number, t: TFunction) {
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

function getBuildingTypeName(bt: BuildingDetail["buildingType"]): string {
  if (typeof bt === "string") return bt
  return bt.name
}

function getDefaultDateRange(): DateRange {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return { from: start, to: end }
}

interface BuildingsCompareProps {
  buildingIds: string[]
}

export function BuildingsCompare({ buildingIds }: BuildingsCompareProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [weather, setWeather] = useState<WeatherData | null>(null)

  const [range, setRange] = useState<DateRange | undefined>(getDefaultDateRange)

  const efficiencyParams = useMemo(() => {
    const startDate = toIsoDate(range?.from)
    const endDate = toIsoDate(range?.to ? endOfDay(range.to) : undefined)
    if (!startDate || !endDate) return undefined
    return { startDate, endDate }
  }, [range])

  // Fetch all buildings in parallel using useQueries
  const buildingQueries = useQueries({
    queries: buildingIds.map((id) => ({
      queryKey: [...BUILDINGS_QUERY_KEY, "detail", id],
      queryFn: async () => {
        const res = await client.api.v1.buildings[":id"].$get({
          param: { id },
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(errorMessage(data, "Building not found"))
        }
        const data = await res.json()
        return data as { building: BuildingDetail }
      },
      staleTime: 2 * 60 * 1000,
    })),
  })

  // Fetch efficiency for each building in parallel
  const efficiencyQueries = useQueries({
    queries: buildingIds.map((id) => ({
        queryKey: [...BUILDINGS_QUERY_KEY, "efficiency", id, efficiencyParams],
        queryFn: async () => {
          const res = await client.api.v1.buildings[":id"].efficiency.$get({
            param: { id },
            query: {
              startDate: efficiencyParams!.startDate,
              endDate: efficiencyParams!.endDate,
            },
          })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(errorMessage(data, "Efficiency error"))
        }
        const data = await res.json()
        return data as EfficiencyMetrics
      },
      staleTime: 5 * 60 * 1000,
      enabled: !!efficiencyParams,
    })),
  })

  // Combine loaded buildings
  const buildings = buildingQueries
    .map((q, i) => {
      if (!q.data) return null
      return {
        building: q.data.building,
        efficiency: efficiencyQueries[i]?.data ?? null,
      }
    })
    .filter(Boolean) as Array<{
    building: BuildingDetail
    efficiency: EfficiencyMetrics | null
  }>

  const isLoading = buildingQueries.some((q) => q.isLoading)

  useEffect(() => {
    async function fetchWeather() {
      try {
        const res = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=46.0664&longitude=11.1257&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=Europe/Rome"
        )
        const data = await res.json()
        setWeather({
          temperature: data.current.temperature_2m,
          humidity: data.current.relative_humidity_2m,
          windSpeed: data.current.wind_speed_10m,
          weatherCode: data.current.weather_code,
        })
      } catch {
        setWeather(null)
      }
    }
    fetchWeather()
  }, [])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {buildingIds.map((id) => (
            <Card key={id}>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (buildings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Building2 className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="font-medium">{t("buildings.notFound")}</p>
        <Button
          variant="outline"
          className="mt-4 bg-transparent"
          onClick={() => navigate("/dashboard/buildings")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("buildings.backToSearch")}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/dashboard/buildings")}
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="sr-only">{t("common.back")}</span>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-balance">
            {t("buildings.compareTitle", { count: buildings.length })}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {buildings.map((b) => b.building.name).join(" / ")}
          </p>
        </div>
        {weather && (
          <div className="hidden items-center gap-2 rounded-lg border px-3 py-2 md:flex">
            {getWeatherIcon(weather.weatherCode)}
            <div className="text-sm">
              <p className="font-medium">{weather.temperature}&deg;C</p>
              <p className="text-xs text-muted-foreground">
                {getWeatherLabel(weather.weatherCode, t)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Date range picker */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">{t("buildings.analysisPeriod")}</span>
            <DateRangePicker value={range} onChange={setRange} />
          </div>
        </CardContent>
      </Card>

      {/* Building Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {buildings.map(({ building }) => (
          <Card
            key={building.id}
            className="cursor-pointer transition-all hover:shadow-md hover:ring-1 hover:ring-border"
            onClick={() => navigate(`/dashboard/buildings/${building.id}`)}
          >
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold leading-tight">
                      {building.name}
                    </h3>
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {building.address}
                    </div>
                  </div>
                  <BuildingStatusBadge status={building.status} />
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-3 text-center">
                  <div>
                    <Building2 className="mx-auto mb-1 h-4 w-4 text-chart-2" />
                    <p className="text-lg font-bold">{building.surface}</p>
                    <p className="text-[10px] text-muted-foreground">{t("common.squareMeters")}</p>
                  </div>
                  <div>
                    <Activity className="mx-auto mb-1 h-4 w-4 text-chart-3" />
                    <p className="text-lg font-bold">
                      {getBuildingTypeName(building.buildingType)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{t("buildings.type")}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    {building.heatingSystemType}
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {building.geographicZone}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Efficiency Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4" />
            {t("buildings.efficiencyCompareTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {efficiencyQueries.some((q) => q.isLoading) ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : buildings.some((b) => b.efficiency) ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {buildings.map(({ building, efficiency }) => (
                <div key={building.id} className="rounded-lg border p-4 space-y-3">
                  <p className="text-sm font-semibold">{building.name}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground">{t("buildings.efficiencyCopAvg")}</p>
                      <p className="text-sm font-semibold tabular-nums">
                        {efficiency?.metrics.averageCop != null
                          ? efficiency.metrics.averageCop.toFixed(2)
                          : t("common.na")}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">{t("buildings.efficiencyHeatLossShort")}</p>
                      <p className="text-sm font-semibold tabular-nums">
                        {efficiency?.metrics.estimatedHeatLossCoefficient != null
                          ? efficiency.metrics.estimatedHeatLossCoefficient.toFixed(1)
                          : t("common.na")}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">{t("buildings.totalConsumption")}</p>
                      <p className="text-sm font-semibold tabular-nums">
                        {efficiency?.metrics.totalEnergyConsumed != null
                          ? `${efficiency.metrics.totalEnergyConsumed.toFixed(1)} ${t("common.kwh")}`
                          : t("common.na")}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              <AlertCircle className="mr-2 h-4 w-4" />
              {t("buildings.efficiencyUnavailable")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("buildings.comparisonSummary")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-3 pr-4 text-left font-medium text-muted-foreground">
                    {t("buildings.parameter")}
                  </th>
                  {buildings.map(({ building }) => (
                    <th
                      key={building.id}
                      className="pb-3 pr-4 text-left font-medium"
                    >
                      {building.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="py-3 pr-4 text-muted-foreground">{t("common.status")}</td>
                  {buildings.map(({ building }) => (
                    <td key={building.id} className="py-3 pr-4">
                      <BuildingStatusBadge status={building.status} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-muted-foreground">{t("buildings.surface")} ({t("common.squareMeters")})</td>
                  {buildings.map(({ building }) => (
                    <td key={building.id} className="py-3 pr-4 tabular-nums">
                      {building.surface}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-muted-foreground">
                    <span className="flex items-center gap-1"><Radio className="h-3.5 w-3.5" /> {t("buildings.activeSensors")}</span>
                  </td>
                  {buildings.map(({ building }) => (
                    <td key={building.id} className="py-3 pr-4 tabular-nums">
                      {building.activeSensors}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-muted-foreground">
                    <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5" /> {t("buildings.currentConsumptionKwh")}</span>
                  </td>
                  {buildings.map(({ building }) => (
                    <td key={building.id} className="py-3 pr-4 font-semibold tabular-nums text-chart-1">
                      {building.currentConsumption != null
                        ? building.currentConsumption.toFixed(1)
                        : t("common.na")}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-muted-foreground">{t("buildings.kwhPerSqm")}</td>
                  {buildings.map(({ building }) => (
                    <td key={building.id} className="py-3 pr-4 tabular-nums">
                      {building.currentConsumption != null && building.surface > 0
                        ? (building.currentConsumption / building.surface).toFixed(2)
                        : t("common.na")}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-muted-foreground">{t("buildings.type")}</td>
                  {buildings.map(({ building }) => (
                    <td key={building.id} className="py-3 pr-4">
                      {getBuildingTypeName(building.buildingType)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-muted-foreground">{t("buildings.constructionYear")}</td>
                  {buildings.map(({ building }) => (
                    <td key={building.id} className="py-3 pr-4 tabular-nums">
                      {building.constructionYear ?? t("common.na")}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-muted-foreground">{t("buildings.heatingSystem")}</td>
                  {buildings.map(({ building }) => (
                    <td key={building.id} className="py-3 pr-4">
                      {building.heatingSystemType}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-muted-foreground">{t("buildings.geographicZone")}</td>
                  {buildings.map(({ building }) => (
                    <td key={building.id} className="py-3 pr-4">
                      {building.geographicZone}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-muted-foreground">{t("buildings.efficiencyCopAvg")}</td>
                  {buildings.map(({ building, efficiency }) => (
                    <td key={building.id} className="py-3 pr-4 font-semibold tabular-nums">
                      {efficiency?.metrics.averageCop != null
                        ? efficiency.metrics.averageCop.toFixed(2)
                        : t("common.na")}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-muted-foreground">{t("buildings.efficiencyHeatLossShort")}</td>
                  {buildings.map(({ building, efficiency }) => (
                    <td key={building.id} className="py-3 pr-4 tabular-nums">
                      {efficiency?.metrics.estimatedHeatLossCoefficient != null
                        ? efficiency.metrics.estimatedHeatLossCoefficient.toFixed(1)
                        : t("common.na")}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-muted-foreground">{t("buildings.totalConsumptionKwh")}</td>
                  {buildings.map(({ building, efficiency }) => (
                    <td key={building.id} className="py-3 pr-4 font-semibold tabular-nums">
                      {efficiency?.metrics.totalEnergyConsumed != null
                        ? efficiency.metrics.totalEnergyConsumed.toFixed(1)
                        : t("common.na")}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
