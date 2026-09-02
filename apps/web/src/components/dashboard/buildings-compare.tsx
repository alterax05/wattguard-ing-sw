import * as React from "react"
import { useMemo, useState } from "react"
import { endOfDay } from "date-fns"
import { useTranslation } from "react-i18next"
import type { DateRange } from "react-day-picker"
import { useNavigate } from "react-router-dom"
import { toIsoDate } from "@/lib/dates"
import { useQueries } from "@tanstack/react-query"
import { client } from "@/lib/api"
import { errorMessageFromResponse } from "@/lib/errors"
import { DateRangePicker } from "./date-range-picker"
import {
  BUILDINGS_QUERY_KEY,
  type BuildingDetail,
  type EfficiencyMetrics,
} from "@/hooks/use-buildings"
import { useWeather, type WeatherData } from "@/hooks/use-weather"
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
  Gauge,
  AlertCircle,
  Radio,
} from "lucide-react"

import { getBuildingTypeName, getDefaultDateRange, getWeatherIcon, getWeatherLabel } from "./buildings-compare/helpers"

// ── Context (lifted state, decoupled provider) ─────────────────────────────

interface BuildingsCompareContextValue {
  buildingIds: string[]
  buildings: Array<{ building: BuildingDetail; efficiency: EfficiencyMetrics | null }>
  isLoading: boolean
  efficiencyLoading: boolean
  weather: WeatherData | null | undefined
  range: DateRange | undefined
  setRange: (r: DateRange | undefined) => void
}

const BuildingsCompareContext = React.createContext<BuildingsCompareContextValue | null>(null)

function useBuildingsCompareContext() {
  const ctx = React.use(BuildingsCompareContext)
  if (!ctx) throw new Error("BuildingsCompare.* must be used within BuildingsCompare.Provider")
  return ctx
}

function BuildingsCompareProvider({
  buildingIds,
  children,
}: {
  buildingIds: string[]
  children: React.ReactNode
}) {
  const [range, setRange] = useState<DateRange | undefined>(getDefaultDateRange)

  const efficiencyParams = useMemo(() => {
    const startDate = toIsoDate(range?.from)
    const endDate = toIsoDate(range?.to ? endOfDay(range.to) : undefined)
    if (!startDate || !endDate) return undefined
    return { startDate, endDate }
  }, [range])

  const buildingQueries = useQueries({
    queries: buildingIds.map((id) => ({
      queryKey: [...BUILDINGS_QUERY_KEY, "detail", id],
      queryFn: async () => {
        const res = await client.api.v1.buildings[":id"].$get({ param: { id } })
        if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Building not found"))
        return res.json()
      },
      staleTime: 2 * 60 * 1000,
    })),
  })

  const efficiencyQueries = useQueries({
    queries: buildingIds.map((id) => ({
      queryKey: [...BUILDINGS_QUERY_KEY, "efficiency", id, efficiencyParams],
      queryFn: async () => {
        const res = await client.api.v1.buildings[":id"].efficiency.$get({
          param: { id },
          query: { startDate: efficiencyParams!.startDate, endDate: efficiencyParams!.endDate },
        })
        if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Efficiency error"))
        return res.json()
      },
      staleTime: 5 * 60 * 1000,
      enabled: !!efficiencyParams,
    })),
  })

  // SAFETY: map yields null for missing queries; filter(Boolean) drops nulls so remaining are typed
  const buildings = buildingQueries
    .map((q, i) => {
      if (!q.data) return null
      return { building: q.data.building, efficiency: efficiencyQueries[i]?.data ?? null }
    })
    .filter(Boolean) as Array<{ building: BuildingDetail; efficiency: EfficiencyMetrics | null }>

  const isLoading = buildingQueries.some((q) => q.isLoading)
  const efficiencyLoading = efficiencyQueries.some((q) => q.isLoading)
  const { data: weather } = useWeather()

  const value = useMemo<BuildingsCompareContextValue>(
    () => ({ buildingIds, buildings, isLoading, efficiencyLoading, weather: weather ?? null, range, setRange }),
    [buildingIds, buildings, isLoading, efficiencyLoading, weather, range]
  )

  return <BuildingsCompareContext value={value}>{children}</BuildingsCompareContext>
}

// ── Compound sections (children composition, no boolean props) ─────────────

function BuildingsCompareHeader() {
  const { buildings, weather } = useBuildingsCompareContext()
  const navigate = useNavigate()
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-4">
      <Button variant="ghost" size="icon" onClick={() => { void navigate("/dashboard/buildings") }}>
        <ArrowLeft className="h-5 w-5" />
        <span className="sr-only">{t("common.back")}</span>
      </Button>
      <div className="flex-1">
        <h1 className="text-2xl font-bold tracking-tight text-balance">
          {t("buildings.compareTitle", { count: buildings.length })}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{buildings.map((b) => b.building.name).join(" / ")}</p>
      </div>
      {weather && (
        <div className="hidden items-center gap-2 rounded-lg border px-3 py-2 md:flex">
          {getWeatherIcon(weather.weatherCode)}
          <div className="text-sm">
            <p className="font-medium">{weather.temperature}&deg;C</p>
            <p className="text-xs text-muted-foreground">{getWeatherLabel(weather.weatherCode, t)}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function BuildingsCompareDateRange() {
  const { range, setRange } = useBuildingsCompareContext()
  const { t } = useTranslation()
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">{t("buildings.analysisPeriod")}</span>
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      </CardContent>
    </Card>
  )
}

function BuildingsCompareSummaryCards() {
  const { buildings } = useBuildingsCompareContext()
  const navigate = useNavigate()
  const { t } = useTranslation()
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {buildings.map(({ building }) => (
        <Card
          key={building.id}
          className="cursor-pointer transition-all hover:shadow-md hover:ring-1 hover:ring-border"
          onClick={() => { void navigate(`/dashboard/buildings/${building.id}`) }}
        >
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold leading-tight">{building.name}</h3>
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
                  <p className="text-lg font-bold">{getBuildingTypeName(building.buildingType)}</p>
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
  )
}

function BuildingsCompareEfficiency() {
  const { buildings, efficiencyLoading } = useBuildingsCompareContext()
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4" />
          {t("buildings.efficiencyCompareTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {efficiencyLoading ? (
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
                      {efficiency?.metrics.averageCop != null ? efficiency.metrics.averageCop.toFixed(2) : t("common.na")}
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
  )
}

function BuildingsCompareTable() {
  const { buildings } = useBuildingsCompareContext()
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("buildings.comparisonSummary")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="pb-3 pr-4 text-left font-medium text-muted-foreground">{t("buildings.parameter")}</th>
                {buildings.map(({ building }) => (
                  <th key={building.id} className="pb-3 pr-4 text-left font-medium">
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
                <td className="py-3 pr-4 text-muted-foreground">
                  {t("buildings.surface")} ({t("common.squareMeters")})
                </td>
                {buildings.map(({ building }) => (
                  <td key={building.id} className="py-3 pr-4 tabular-nums">
                    {building.surface}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 pr-4 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Radio className="h-3.5 w-3.5" /> {t("buildings.activeSensors")}
                  </span>
                </td>
                {buildings.map(({ building }) => (
                  <td key={building.id} className="py-3 pr-4 tabular-nums">
                    {building.activeSensors}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 pr-4 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5" /> {t("buildings.currentConsumptionKwh")}
                  </span>
                </td>
                {buildings.map(({ building }) => (
                  <td key={building.id} className="py-3 pr-4 font-semibold tabular-nums text-chart-1">
                    {building.currentConsumption != null ? building.currentConsumption.toFixed(1) : t("common.na")}
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
                    {efficiency?.metrics.averageCop != null ? efficiency.metrics.averageCop.toFixed(2) : t("common.na")}
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
                    {efficiency?.metrics.totalEnergyConsumed != null ? efficiency.metrics.totalEnergyConsumed.toFixed(1) : t("common.na")}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function BuildingsCompareLayout({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6">{children}</div>
}

// Keep skeletons/empty inside orchestrator for simplicity
function BuildingsCompareInner({ buildingIds }: { buildingIds: string[] }) {
  const { buildings, isLoading } = useBuildingsCompareContext()
  const navigate = useNavigate()
  const { t } = useTranslation()

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
        <Button variant="outline" className="mt-4 bg-transparent" onClick={() => { void navigate("/dashboard/buildings") }}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("buildings.backToSearch")}
        </Button>
      </div>
    )
  }

  return (
    <BuildingsCompareLayout>
      <BuildingsCompareHeader />
      <BuildingsCompareDateRange />
      <BuildingsCompareSummaryCards />
      <BuildingsCompareEfficiency />
      <BuildingsCompareTable />
    </BuildingsCompareLayout>
  )
}

interface BuildingsCompareProps {
  buildingIds: string[]
}

export function BuildingsCompare({ buildingIds }: BuildingsCompareProps) {
  return (
    <BuildingsCompareProvider buildingIds={buildingIds}>
      <BuildingsCompareInner buildingIds={buildingIds} />
    </BuildingsCompareProvider>
  )
}

// Compound export — explicit variants via composition, no booleans
export const BuildingsCompareCompound = {
  Provider: BuildingsCompareProvider,
  Header: BuildingsCompareHeader,
  DateRange: BuildingsCompareDateRange,
  SummaryCards: BuildingsCompareSummaryCards,
  Efficiency: BuildingsCompareEfficiency,
  Table: BuildingsCompareTable,
  Layout: BuildingsCompareLayout,
  Context: BuildingsCompareContext,
}
