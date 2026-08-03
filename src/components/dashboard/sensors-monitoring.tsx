import { useState, type KeyboardEvent, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { formatDistanceToNow } from "date-fns"
import { it } from "date-fns/locale"
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Flame,
  Gauge,
  MapPin,
  Radio,
  RefreshCw,
  Search,
  Thermometer,
  WifiOff,
  Wind,
  Zap,
} from "lucide-react"
import { useBuildings } from "@/hooks/use-buildings"
import {
  SENSORS_QUERY_KEY,
  useAllSensors,
  type SensorType,
  type SensorWithBuilding,
} from "@/hooks/use-sensors"
import {
  getMonitoringStatus,
  getMonitoringStatusPresentation,
  type MonitoringStatus,
} from "@/lib/sensor-status"
import { cn } from "@/lib/utils"
import { SensorDetailDialog } from "./sensor-detail-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"

type SensorGroup = "all" | "thermometers" | "meters"
type StatusFilter = "all" | MonitoringStatus

const SENSOR_GROUPS: SensorGroup[] = ["all", "thermometers", "meters"]

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
  }
}

function getSensorTypeLabel(sensorType: SensorType) {
  switch (sensorType) {
    case "internal_temp":
      return "Temperatura interna"
    case "external_temp":
      return "Temperatura esterna"
    case "energy_meter":
      return "Contatore energia"
    case "gas_meter":
      return "Contatore gas"
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

function belongsToGroup(sensor: SensorWithBuilding, group: SensorGroup) {
  if (group === "all") return true
  if (group === "thermometers") {
    return sensor.sensorType === "internal_temp" || sensor.sensorType === "external_temp"
  }
  return sensor.sensorType === "energy_meter" || sensor.sensorType === "gas_meter"
}

function getLastUpdate(timestamp?: string) {
  if (!timestamp) return null

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return null

  return {
    relative: formatDistanceToNow(date, { addSuffix: true, locale: it }),
    absolute: date.toLocaleString("it-IT"),
  }
}

function MonitoringStatCard({
  icon,
  label,
  value,
  description,
  className,
}: {
  icon: ReactNode
  label: string
  value: number | string
  description: string
  className?: string
}) {
  return (
    <Card className={cn("gap-3 py-4", className)}>
      <CardContent className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function SensorTableRow({
  sensor,
  onSelect,
}: {
  sensor: SensorWithBuilding
  onSelect: (sensor: SensorWithBuilding) => void
}) {
  const status = getMonitoringStatus(sensor)
  const statusPresentation = getMonitoringStatusPresentation(status)
  const lastUpdate = getLastUpdate(sensor.lastReading?.timestamp)
  const StatusIcon = statusPresentation.icon

  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      onSelect(sensor)
    }
  }

  return (
    <TableRow
      className="cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      tabIndex={0}
      role="button"
      aria-label={`Apri dettagli ${sensor.location}`}
      onClick={() => onSelect(sensor)}
      onKeyDown={handleKeyDown}
    >
      <TableCell>
        <div className="flex min-w-[170px] items-center gap-2">
          <div className="rounded-md bg-primary/10 p-2 text-primary">{getSensorIcon(sensor.sensorType)}</div>
          <span className="font-medium">{getSensorTypeLabel(sensor.sensorType)}</span>
        </div>
      </TableCell>
      <TableCell className="min-w-[260px] whitespace-normal">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">{sensor.location}</p>
            <p className="text-xs text-muted-foreground">
              {sensor.building?.name ?? "Edificio non disponibile"}
            </p>
            {sensor.building?.address && (
              <p className="text-xs text-muted-foreground">{sensor.building.address}</p>
            )}
            {sensor.serialNumber && (
              <p className="mt-1 text-xs text-muted-foreground">S/N: {sensor.serialNumber}</p>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className={cn("gap-1", statusPresentation.className)}>
          <StatusIcon />
          {statusPresentation.label}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="min-w-[110px]">
          <p className="font-medium">
            {sensor.lastReading?.value !== undefined
              ? sensor.lastReading.value.toLocaleString("it-IT", { maximumFractionDigits: 2 })
              : "N/D"}
          </p>
          <p className="text-xs text-muted-foreground">
            {sensor.lastReading?.unit ?? getSensorUnit(sensor.sensorType)}
          </p>
        </div>
      </TableCell>
      <TableCell>
        {lastUpdate ? (
          <div className="min-w-[175px]">
            <div className="flex items-center gap-1.5 font-medium">
              <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
              {lastUpdate.relative}
            </div>
            <p className="text-xs text-muted-foreground">{lastUpdate.absolute}</p>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Nessun dato ricevuto</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
      </TableCell>
    </TableRow>
  )
}

function SensorTable({
  sensors,
  isLoading,
  errorMessage,
  onRetry,
  onSelect,
}: {
  sensors: SensorWithBuilding[]
  isLoading: boolean
  errorMessage?: string
  onRetry: () => void
  onSelect: (sensor: SensorWithBuilding) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Elenco sensori</CardTitle>
        <CardDescription>
          Posizione fisica, stato operativo e ultimo aggiornamento dei dispositivi installati.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Posizione</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Ultima lettura</TableHead>
                <TableHead>Ultimo aggiornamento</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 6 }, (_, index) => (
                <TableRow key={index}>
                  <TableCell><Skeleton className="h-6 w-36" /></TableCell>
                  <TableCell><Skeleton className="h-10 w-56" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-36" /></TableCell>
                  <TableCell><Skeleton className="ml-auto h-4 w-4" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : errorMessage ? (
          <div className="p-6">
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Impossibile caricare i sensori</AlertTitle>
              <AlertDescription className="flex flex-col gap-3">
                <p>{errorMessage}</p>
                <Button className="w-fit" variant="outline" onClick={onRetry}>
                  Riprova
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : sensors.length === 0 ? (
          <Empty className="rounded-none border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Gauge /></EmptyMedia>
              <EmptyTitle>Nessun sensore trovato</EmptyTitle>
              <EmptyDescription>
                Modifica i filtri oppure verifica che siano stati installati sensori negli edifici.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Posizione fisica</TableHead>
                <TableHead>Stato operativo</TableHead>
                <TableHead>Ultima lettura</TableHead>
                <TableHead>Ultimo aggiornamento</TableHead>
                <TableHead className="w-10"><span className="sr-only">Dettagli</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sensors.map((sensor) => (
                <SensorTableRow key={sensor.id} sensor={sensor} onSelect={onSelect} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

export function SensorsMonitoring() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState("")
  const [buildingFilter, setBuildingFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [sensorGroup, setSensorGroup] = useState<SensorGroup>("all")
  const [selectedSensor, setSelectedSensor] = useState<SensorWithBuilding | null>(null)

  const {
    data: sensorsData,
    isLoading: sensorsLoading,
    isFetching: sensorsFetching,
    error: sensorsError,
  } = useAllSensors({ refetchInterval: 60 * 1000 })
  const { data: buildingsData } = useBuildings({ limit: "100" })

  const sensors = sensorsData?.sensors ?? []
  const buildings = buildingsData?.buildings ?? []
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase("it-IT")

  const filteredSensors = sensors.filter((sensor) => {
    const searchableText = [
      sensor.location,
      sensor.serialNumber,
      sensor.building?.name,
      sensor.building?.address,
      getSensorTypeLabel(sensor.sensorType),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("it-IT")
    const matchesSearch = !normalizedSearch || searchableText.includes(normalizedSearch)
    const matchesBuilding = buildingFilter === "all" || sensor.buildingId === buildingFilter
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
      ? "Si è verificato un errore durante il caricamento."
      : undefined

  const handleRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: SENSORS_QUERY_KEY })
    toast.success("Stato dei sensori aggiornato")
  }

  const handleRetry = () => {
    void queryClient.invalidateQueries({ queryKey: SENSORS_QUERY_KEY })
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MonitoringStatCard
          icon={<Radio className="h-5 w-5" />}
          label="Sensori totali"
          value={sensorsLoading ? "..." : totalSensors}
          description="Termometri e contatori installati"
        />
        <MonitoringStatCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Attivi"
          value={sensorsLoading ? "..." : activeSensors}
          description="Con aggiornamenti regolari"
          className="border-chart-3/30"
        />
        <MonitoringStatCard
          icon={<WifiOff className="h-5 w-5" />}
          label="Offline"
          value={sensorsLoading ? "..." : offlineSensors}
          description="Nessun dato oltre l'intervallo previsto"
          className="border-muted-foreground/30"
        />
        <MonitoringStatCard
          icon={<Thermometer className="h-5 w-5" />}
          label="Termometri"
          value={sensorsLoading ? "..." : thermometerSensors}
          description="Temperatura interna ed esterna"
        />
        <MonitoringStatCard
          icon={<Zap className="h-5 w-5" />}
          label="Contatori"
          value={sensorsLoading ? "..." : meterSensors}
          description="Energia e gas"
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Filtri e ricerca</CardTitle>
              <CardDescription>
                Aggiornamento automatico ogni 60 secondi
                {sensorsFetching && " · aggiornamento in corso"}
              </CardDescription>
            </div>
            <Button variant="outline" onClick={handleRefresh} disabled={sensorsFetching}>
              <RefreshCw className={cn("mr-2 h-4 w-4", sensorsFetching && "animate-spin")} />
              Aggiorna
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cerca posizione, edificio o seriale..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-9"
                aria-label="Cerca sensori"
              />
            </div>
            <Select value={buildingFilter} onValueChange={setBuildingFilter}>
              <SelectTrigger aria-label="Filtra per edificio">
                <SelectValue placeholder="Edificio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli edifici</SelectItem>
                {buildings.map((building) => (
                  <SelectItem key={building.id} value={building.id}>
                    {building.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as StatusFilter)}
            >
              <SelectTrigger aria-label="Filtra per stato operativo">
                <SelectValue placeholder="Stato operativo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                <SelectItem value="active">Attivi</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
                <SelectItem value="maintenance">Manutenzione</SelectItem>
                <SelectItem value="error">Errore</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Tabs
        value={sensorGroup}
        onValueChange={(value) => setSensorGroup(value as SensorGroup)}
        className="w-full"
      >
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="all">
            Tutti <span className="ml-1 text-muted-foreground">({filteredSensors.length})</span>
          </TabsTrigger>
          <TabsTrigger value="thermometers">
            <Thermometer className="mr-2 h-4 w-4" />
            Termometri <span className="ml-1 text-muted-foreground">({filteredSensors.filter((sensor) => belongsToGroup(sensor, "thermometers")).length})</span>
          </TabsTrigger>
          <TabsTrigger value="meters">
            <Activity className="mr-2 h-4 w-4" />
            Contatori <span className="ml-1 text-muted-foreground">({filteredSensors.filter((sensor) => belongsToGroup(sensor, "meters")).length})</span>
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
