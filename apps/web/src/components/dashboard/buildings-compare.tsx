import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQueries } from "@tanstack/react-query"
import { client } from "@/lib/api"
import {
  BUILDINGS_QUERY_KEY,
  type BuildingDetail,
  type EfficiencyMetrics,
} from "@/hooks/use-buildings"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
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
  Calendar,
  AlertCircle,
  Radio,
} from "lucide-react"

interface WeatherData {
  temperature: number
  humidity: number
  windSpeed: number
  weatherCode: number
}

function extractError(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const err = (data as Record<string, unknown>).error
    return typeof err === "string" ? err : fallback
  }
  return fallback
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

function getWeatherLabel(code: number) {
  if (code === 0) return "Sereno"
  if (code === 1) return "Prevalentemente sereno"
  if (code === 2) return "Parzialmente nuvoloso"
  if (code === 3) return "Coperto"
  if (code >= 51 && code <= 55) return "Pioviggine"
  if (code >= 61 && code <= 65) return "Pioggia"
  if (code >= 71 && code <= 75) return "Neve"
  if (code >= 80 && code <= 82) return "Rovesci"
  if (code >= 95 && code <= 99) return "Temporale"
  return "N/D"
}

function getStatusBadge(status: BuildingDetail["status"]) {
  switch (status) {
    case "active":
      return <Badge variant="secondary" className="bg-chart-3/15 text-chart-3 text-xs">Attivo</Badge>
    case "inactive":
      return <Badge variant="secondary" className="text-xs">Inattivo</Badge>
    case "decommissioned":
      return <Badge variant="secondary" className="bg-destructive/15 text-destructive text-xs">Dismesso</Badge>
  }
}

function getBuildingTypeName(bt: BuildingDetail["buildingType"]): string {
  if (typeof bt === "string") return bt
  return bt.name
}

function getDefaultDateRange() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return {
    startInput: start.toISOString().split("T")[0]!,
    endInput: end.toISOString().split("T")[0]!,
  }
}

interface BuildingsCompareProps {
  buildingIds: string[]
}

export function BuildingsCompare({ buildingIds }: BuildingsCompareProps) {
  const navigate = useNavigate()
  const [weather, setWeather] = useState<WeatherData | null>(null)

  const defaults = useMemo(() => getDefaultDateRange(), [])
  const [startInput, setStartInput] = useState(defaults.startInput)
  const [endInput, setEndInput] = useState(defaults.endInput)

  const efficiencyParams = useMemo(() => ({
    startDate: new Date(startInput).toISOString(),
    endDate: new Date(endInput + "T23:59:59").toISOString(),
  }), [startInput, endInput])

  // Fetch all buildings in parallel using useQueries
  const buildingQueries = useQueries({
    queries: buildingIds.map((id) => ({
      queryKey: [...BUILDINGS_QUERY_KEY, "detail", id],
      queryFn: async () => {
        const res = await client.api.buildings[":id"].$get({
          param: { id },
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(extractError(data, "Edificio non trovato"))
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
        const res = await client.api.buildings[":id"].efficiency.$get({
          param: { id },
          query: {
            startDate: efficiencyParams.startDate,
            endDate: efficiencyParams.endDate,
          },
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(extractError(data, "Errore efficienza"))
        }
        const data = await res.json()
        return data as EfficiencyMetrics
      },
      staleTime: 5 * 60 * 1000,
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
        <p className="font-medium">Nessun edificio trovato</p>
        <Button
          variant="outline"
          className="mt-4 bg-transparent"
          onClick={() => navigate("/dashboard/buildings")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Torna alla ricerca
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
          <span className="sr-only">Indietro</span>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-balance">
            Confronto Edifici ({buildings.length})
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
                {getWeatherLabel(weather.weatherCode)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Date range picker */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Periodo di analisi:</span>
            <Input
              type="date"
              value={startInput}
              onChange={(e) => setStartInput(e.target.value)}
              className="h-8 w-40 text-xs"
            />
            <span className="text-xs text-muted-foreground">-</span>
            <Input
              type="date"
              value={endInput}
              onChange={(e) => setEndInput(e.target.value)}
              className="h-8 w-40 text-xs"
            />
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
                  {getStatusBadge(building.status)}
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-3 text-center">
                  <div>
                    <Building2 className="mx-auto mb-1 h-4 w-4 text-chart-2" />
                    <p className="text-lg font-bold">{building.surface}</p>
                    <p className="text-[10px] text-muted-foreground">m&sup2;</p>
                  </div>
                  <div>
                    <Activity className="mx-auto mb-1 h-4 w-4 text-chart-3" />
                    <p className="text-lg font-bold">
                      {getBuildingTypeName(building.buildingType)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Tipologia</p>
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
            Confronto Efficienza Energetica
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
                      <p className="text-[10px] text-muted-foreground">COP Medio</p>
                      <p className="text-sm font-semibold tabular-nums">
                        {efficiency?.metrics.averageCop != null
                          ? efficiency.metrics.averageCop.toFixed(2)
                          : "N/D"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Dispersione (W/K)</p>
                      <p className="text-sm font-semibold tabular-nums">
                        {efficiency?.metrics.estimatedHeatLossCoefficient != null
                          ? efficiency.metrics.estimatedHeatLossCoefficient.toFixed(1)
                          : "N/D"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Consumo Totale</p>
                      <p className="text-sm font-semibold tabular-nums">
                        {efficiency?.metrics.totalEnergyConsumed != null
                          ? `${efficiency.metrics.totalEnergyConsumed.toFixed(1)} kWh`
                          : "N/D"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              <AlertCircle className="mr-2 h-4 w-4" />
              Dati di efficienza non disponibili per il periodo selezionato
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Riepilogo Comparativo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-3 pr-4 text-left font-medium text-muted-foreground">
                    Parametro
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
                  <td className="py-3 pr-4 text-muted-foreground">Stato</td>
                  {buildings.map(({ building }) => (
                    <td key={building.id} className="py-3 pr-4">
                      {getStatusBadge(building.status)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-muted-foreground">Superficie (m&sup2;)</td>
                  {buildings.map(({ building }) => (
                    <td key={building.id} className="py-3 pr-4 tabular-nums">
                      {building.surface}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-muted-foreground">
                    <span className="flex items-center gap-1"><Radio className="h-3.5 w-3.5" /> Sensori Attivi</span>
                  </td>
                  {buildings.map(({ building }) => (
                    <td key={building.id} className="py-3 pr-4 tabular-nums">
                      {building.activeSensors}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-muted-foreground">
                    <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5" /> Consumo Attuale (kWh)</span>
                  </td>
                  {buildings.map(({ building }) => (
                    <td key={building.id} className="py-3 pr-4 font-semibold tabular-nums text-chart-1">
                      {building.currentConsumption != null
                        ? building.currentConsumption.toFixed(1)
                        : "N/D"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-muted-foreground">kWh/m&sup2;</td>
                  {buildings.map(({ building }) => (
                    <td key={building.id} className="py-3 pr-4 tabular-nums">
                      {building.currentConsumption != null && building.surface > 0
                        ? (building.currentConsumption / building.surface).toFixed(2)
                        : "N/D"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-muted-foreground">Tipologia</td>
                  {buildings.map(({ building }) => (
                    <td key={building.id} className="py-3 pr-4">
                      {getBuildingTypeName(building.buildingType)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-muted-foreground">Anno Costruzione</td>
                  {buildings.map(({ building }) => (
                    <td key={building.id} className="py-3 pr-4 tabular-nums">
                      {building.constructionYear ?? "N/D"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-muted-foreground">Riscaldamento</td>
                  {buildings.map(({ building }) => (
                    <td key={building.id} className="py-3 pr-4">
                      {building.heatingSystemType}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-muted-foreground">Zona Geografica</td>
                  {buildings.map(({ building }) => (
                    <td key={building.id} className="py-3 pr-4">
                      {building.geographicZone}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-muted-foreground">COP Medio</td>
                  {buildings.map(({ building, efficiency }) => (
                    <td key={building.id} className="py-3 pr-4 font-semibold tabular-nums">
                      {efficiency?.metrics.averageCop != null
                        ? efficiency.metrics.averageCop.toFixed(2)
                        : "N/D"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-muted-foreground">Dispersione (W/K)</td>
                  {buildings.map(({ building, efficiency }) => (
                    <td key={building.id} className="py-3 pr-4 tabular-nums">
                      {efficiency?.metrics.estimatedHeatLossCoefficient != null
                        ? efficiency.metrics.estimatedHeatLossCoefficient.toFixed(1)
                        : "N/D"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-muted-foreground">Consumo Totale (kWh)</td>
                  {buildings.map(({ building, efficiency }) => (
                    <td key={building.id} className="py-3 pr-4 font-semibold tabular-nums">
                      {efficiency?.metrics.totalEnergyConsumed != null
                        ? efficiency.metrics.totalEnergyConsumed.toFixed(1)
                        : "N/D"}
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
