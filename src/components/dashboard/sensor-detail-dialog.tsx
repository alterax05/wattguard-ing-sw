import { useMemo } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Building2, Calendar, TrendingUp, Thermometer, Wind, Zap, Flame } from "lucide-react"
import { Line, LineChart, XAxis, YAxis, CartesianGrid } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { useSensor, useSensorReadings, type SensorWithBuilding, type SensorType } from "@/hooks/use-sensors"

function getSensorTypeLabel(sensorType: SensorType) {
  switch (sensorType) {
    case "internal_temp":
      return "Temperatura Interna"
    case "external_temp":
      return "Temperatura Esterna"
    case "energy_meter":
      return "Contatore Energia"
    case "gas_meter":
      return "Contatore Gas"
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

function getSensorStatusLabel(status: string) {
  switch (status) {
    case "active":
      return "Attivo"
    case "inactive":
      return "Inattivo"
    case "maintenance":
      return "Manutenzione"
    case "error":
      return "Errore"
    default:
      return status
  }
}

function getSensorIcon(sensorType: SensorType) {
  switch (sensorType) {
    case "internal_temp":
      return <Thermometer className="h-5 w-5" />
    case "external_temp":
      return <Wind className="h-5 w-5" />
    case "energy_meter":
      return <Zap className="h-5 w-5" />
    case "gas_meter":
      return <Flame className="h-5 w-5" />
  }
}

interface SensorDetailDialogProps {
  /** Pass a sensor ID to fetch details from the API */
  sensorId?: string
  /** Or pass a pre-loaded sensor object (avoids extra API call) */
  sensor?: SensorWithBuilding
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SensorDetailDialog({ sensorId, sensor: preloadedSensor, open, onOpenChange }: SensorDetailDialogProps) {
  const effectiveId = sensorId ?? preloadedSensor?.id
  const { data: sensorData, isLoading: sensorLoading } = useSensor(
    preloadedSensor ? undefined : effectiveId
  )

  const sensor = preloadedSensor ?? sensorData?.sensor

  // Fetch last 24 hours of readings
  const readingsParams = useMemo(() => {
    if (!effectiveId) return undefined
    const end = new Date()
    const start = new Date()
    start.setHours(start.getHours() - 24)
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      sortOrder: "asc" as const,
      limit: "100",
    }
  }, [effectiveId])

  const { data: readingsData, isLoading: readingsLoading } = useSensorReadings(
    open ? effectiveId : undefined,
    readingsParams
  )

  const chartData = useMemo(() => {
    if (!readingsData?.readings) return []
    return readingsData.readings.map((r) => ({
      time: new Date(r.timestamp).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
      value: r.value,
    }))
  }, [readingsData])

  const unit = sensor ? getSensorUnit(sensor.sensorType) : ""

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        {sensorLoading || !sensor ? (
          <div className="space-y-4 py-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <div className="grid gap-4 md:grid-cols-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
            <Skeleton className="h-64" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {getSensorIcon(sensor.sensorType)}
                {sensor.location}
              </DialogTitle>
              <DialogDescription>
                {sensor.building?.name ?? "Edificio"}
                {sensor.serialNumber ? ` — S/N: ${sensor.serialNumber}` : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Sensor Info */}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Tipo Sensore</p>
                  <p className="text-sm font-semibold">{getSensorTypeLabel(sensor.sensorType)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Stato</p>
                  <Badge
                    variant="secondary"
                    className={
                      sensor.status === "active"
                        ? "bg-chart-3 text-white"
                        : sensor.status === "error"
                          ? "bg-destructive text-destructive-foreground"
                          : sensor.status === "maintenance"
                            ? "bg-chart-4 text-foreground"
                            : ""
                    }
                  >
                    {getSensorStatusLabel(sensor.status)}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Intervallo</p>
                  <p className="text-sm font-semibold">{sensor.transmissionInterval}s</p>
                </div>
              </div>

              <Separator />

              {/* Current Reading */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  Lettura Corrente
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold">
                    {sensor.lastReading?.value?.toFixed(2) ?? "N/A"}
                  </span>
                  <span className="text-lg text-muted-foreground">
                    {sensor.lastReading?.unit ?? unit}
                  </span>
                </div>
                {sensor.lastReading?.timestamp && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Aggiornato: {new Date(sensor.lastReading.timestamp).toLocaleString("it-IT")}
                  </p>
                )}
              </div>

              {/* Chart */}
              <div>
                <div className="mb-4 flex items-center gap-2 text-sm font-medium">
                  <Calendar className="h-4 w-4" />
                  Andamento Ultime 24 Ore
                </div>
                {readingsLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : chartData.length > 0 ? (
                  <ChartContainer
                    config={{
                      value: {
                        label: unit,
                        color: "hsl(var(--chart-1))",
                      },
                    }}
                    className="h-64 w-full"
                  >
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="time" tickLine={false} axisLine={false} className="text-xs" />
                      <YAxis tickLine={false} axisLine={false} className="text-xs" />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line type="monotone" dataKey="value" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ChartContainer>
                ) : (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    Nessun dato disponibile per le ultime 24 ore
                  </div>
                )}
              </div>

              <Separator />

              {/* Building Info */}
              {sensor.building && (
                <div>
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <Building2 className="h-4 w-4" />
                    Edificio
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="font-medium">{sensor.building.name}</p>
                    <p className="text-sm text-muted-foreground">{sensor.building.address}</p>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Chiudi
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
