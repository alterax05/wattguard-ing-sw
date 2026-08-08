import { useMemo, useState } from "react";
import { endOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toIsoDate } from "@/lib/dates";
import {
  useBuilding,
  useBuildingRealTime,
  useBuildingHistory,
  useBuildingEfficiency,
  type BuildingDetail as BuildingDetailType,
  type HistoryParams,
} from "@/hooks/use-buildings";
import {
  useAllSensors,
  useDeleteSensor,
  useSensors,
  type SensorWithBuilding,
} from "@/hooks/use-sensors";
import { keepPreviousData } from "@tanstack/react-query";
import {
  getMonitoringStatus,
  getMonitoringStatusPresentation,
} from "@/lib/sensor-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Zap,
  Thermometer,
  Activity,
  Wind,
  Gauge,
  TrendingDown,
  AlertCircle,
  Flame,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { AddSensorDialog } from "./add-sensor-dialog";
import { EditSensorDialog } from "./edit-sensor-dialog";
import { EditBuildingDialog } from "./edit-building-dialog";
import { DateRangePicker } from "./date-range-picker";
import { toast } from "sonner";

interface BuildingDetailProps {
  buildingId: string;
}

function getStatusBadge(status: BuildingDetailType["status"]) {
  switch (status) {
    case "active":
      return (
        <Badge
          variant="secondary"
          className="bg-chart-3/15 text-chart-3 text-sm"
        >
          Attivo
        </Badge>
      );
    case "inactive":
      return (
        <Badge variant="secondary" className="text-sm">
          Inattivo
        </Badge>
      );
    case "decommissioned":
      return (
        <Badge
          variant="secondary"
          className="bg-destructive/15 text-destructive text-sm"
        >
          Dismesso
        </Badge>
      );
  }
}

function getBuildingTypeName(bt: BuildingDetailType["buildingType"]): string {
  if (typeof bt === "string") return bt;
  return bt.name;
}

function getSensorIcon(sensorType: SensorWithBuilding["sensorType"]) {
  switch (sensorType) {
    case "internal_temp":
      return <Thermometer className="h-4 w-4" />;
    case "external_temp":
      return <Wind className="h-4 w-4" />;
    case "energy_meter":
      return <Zap className="h-4 w-4" />;
    case "gas_meter":
      return <Flame className="h-4 w-4" />;
  }
}

function getSensorTypeLabel(sensorType: SensorWithBuilding["sensorType"]) {
  switch (sensorType) {
    case "internal_temp":
      return "Temp. Interna";
    case "external_temp":
      return "Temp. Esterna";
    case "energy_meter":
      return "Contatore Energia";
    case "gas_meter":
      return "Contatore Gas";
  }
}

/** Default date range: last 30 days */
function getDefaultDateRange(): DateRange {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { from: start, to: end };
}

type SensorTypeKey = HistoryParams["sensorType"] & string;

const SENSOR_TYPE_CONFIG: Record<
  SensorTypeKey,
  {
    label: string;
    unit: string;
    color: string;
    icon: typeof Zap;
  }
> = {
  energy_meter: {
    label: "Energia",
    unit: "kWh",
    color: "var(--chart-1)",
    icon: Zap,
  },
  internal_temp: {
    label: "Temp. Interna",
    unit: "°C",
    color: "var(--chart-2)",
    icon: Thermometer,
  },
  external_temp: {
    label: "Temp. Esterna",
    unit: "°C",
    color: "var(--chart-3)",
    icon: Thermometer,
  },
  gas_meter: {
    label: "Gas",
    unit: "m³",
    color: "var(--chart-4)",
    icon: Flame,
  },
};

const SENSORS_PAGE_SIZE = 4;

function getPaginationItems(
  current: number,
  total: number,
): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const items: (number | "ellipsis")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) items.push("ellipsis");
  for (let p = start; p <= end; p++) items.push(p);
  if (end < total - 1) items.push("ellipsis");
  items.push(total);
  return items;
}

export function BuildingDetail({ buildingId }: BuildingDetailProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentPage, setCurrentPage] = useState(1);

  const [range, setRange] = useState<DateRange | undefined>(
    getDefaultDateRange,
  );
  const [selectedSensorType, setSelectedSensorType] =
    useState<SensorTypeKey>("energy_meter");

  const historyParams = useMemo(() => {
    const startDate = toIsoDate(range?.from);
    const endDate = toIsoDate(range?.to ? endOfDay(range.to) : undefined);
    if (!startDate || !endDate) return undefined;
    return {
      startDate,
      endDate,
      sensorType: selectedSensorType,
      interval: "hour" as const,
    };
  }, [range, selectedSensorType]);

  const efficiencyParams = useMemo(() => {
    const startDate = toIsoDate(range?.from);
    const endDate = toIsoDate(range?.to ? endOfDay(range.to) : undefined);
    if (!startDate || !endDate) return undefined;
    return { startDate, endDate };
  }, [range]);

  // API hooks
  const {
    data: buildingData,
    isLoading: buildingLoading,
    isError: buildingError,
  } = useBuilding(buildingId);
  const { data: realTimeData } = useBuildingRealTime(buildingId);
  const { data: sensorsData, isLoading: sensorsLoading } = useSensors(
    {
      buildingId,
      limit: String(SENSORS_PAGE_SIZE),
      offset: String((currentPage - 1) * SENSORS_PAGE_SIZE),
    },
    { refetchInterval: 60 * 1000, placeholderData: keepPreviousData },
  );
  const { data: allSensorsData } = useAllSensors(
    { buildingId },
    { refetchInterval: 60 * 1000 },
  );
  const { data: historyData, isLoading: historyLoading } = useBuildingHistory(
    buildingId,
    historyParams,
  );
  const { data: efficiencyData, isLoading: efficiencyLoading } =
    useBuildingEfficiency(buildingId, efficiencyParams);

  const building = buildingData?.building;
  const sensors = sensorsData?.sensors ?? [];
  const totalSensors = sensorsData?.pagination.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalSensors / SENSORS_PAGE_SIZE));
  const allSensors = allSensorsData?.sensors ?? [];
  const activeSensors = allSensors.filter(
    (s) => getMonitoringStatus(s) === "active",
  ).length;

  // Sensor CRUD state
  const [addSensorOpen, setAddSensorOpen] = useState(false);
  const [isEditingBuilding, setIsEditingBuilding] = useState(false);
  const [manuallyEditingSensorId, setManuallyEditingSensorId] = useState<string | null>(null);
  const [deletingSensor, setDeletingSensor] = useState<SensorWithBuilding | null>(null);
  const deleteSensor = useDeleteSensor();

  // The edit dialog can be opened manually (from the sensor actions menu) or
  // through a deep link (?sensorId=<id>). The target sensor is first looked up
  // in the current page, then in the background index (used to resolve deep
  // links pointing to sensors on other pages). Deriving (instead of effecting)
  // keeps URL and state in sync without effects.
  const sensorIdToEdit = searchParams.get("sensorId");
  const editingSensorId = manuallyEditingSensorId ?? sensorIdToEdit;
  const editingSensor =
    sensors.find((s) => s.id === editingSensorId) ??
    allSensors.find((s) => s.id === editingSensorId) ??
    null;

  // When a deep link points to a sensor on another page, jump to its page.
  // Uses the "adjust state during render" pattern (guarded) — no effect needed,
  // lint-safe (the rule forbids setState in effects, not in render).
  const sensorIndex = editingSensor
    ? allSensors.findIndex((s) => s.id === editingSensor.id)
    : -1;
  const sensorPage =
    sensorIndex >= 0
      ? Math.floor(sensorIndex / SENSORS_PAGE_SIZE) + 1
      : null;
  if (sensorPage && sensorPage !== currentPage) setCurrentPage(sensorPage);
  // Clamp currentPage when the page count shrinks (e.g. after a deletion).
  if (currentPage > totalPages) setCurrentPage(totalPages);

  const handleCloseEditDialog = () => {
    setManuallyEditingSensorId(null);
    if (sensorIdToEdit) {
      const next = new URLSearchParams(searchParams);
      next.delete("sensorId");
      setSearchParams(next, { replace: true });
    }
  };

  const handleDeleteSensor = () => {
    if (!deletingSensor) return;
    deleteSensor.mutate(deletingSensor.id, {
      onSuccess: () => {
        toast.success(
          `Sensore "${deletingSensor.location}" eliminato con successo`,
        );
        setDeletingSensor(null);
      },
      onError: (error) => {
        toast.error(error.message || "Errore nell'eliminazione del sensore");
      },
    });
  };

  // Prepare history chart data
  const chartData = useMemo(() => {
    if (!historyData?.data) return [];
    return historyData.data.map((point) => ({
      timestamp: new Date(point.timestamp).toLocaleString("it-IT", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
      value: point.value,
      sensorType: point.sensorType,
      unit: point.unit,
    }));
  }, [historyData]);

  // Loading state
  if (buildingLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center gap-2">
                  <Skeleton className="h-5 w-5" />
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Error / not found
  if (buildingError || !building) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Building2 className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="font-medium">Edificio non trovato</p>
        <Button
          variant="outline"
          className="mt-4 bg-transparent"
          onClick={() => navigate("/dashboard/buildings")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Torna alla ricerca
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back + Title */}
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
          <h1 className="text-2xl font-bold tracking-tight text-balance flex items-center gap-2">
            {building.name}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsEditingBuilding(true)}
            >
              <Pencil className="h-4 w-4" />
              <span className="sr-only">Modifica edificio</span>
            </Button>
          </h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {building.address}
            <Separator orientation="vertical" className="h-3.5" />
            <span>{getBuildingTypeName(building.buildingType)}</span>
          </div>
        </div>
        {getStatusBadge(building.status)}
      </div>

      {/* Info Cards Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex flex-col items-center justify-center pt-6 text-center">
            <Zap className="mb-2 h-5 w-5 text-chart-1" />
            <p className="text-2xl font-bold">
              {realTimeData?.data.energyConsumption.value != null
                ? `${realTimeData.data.energyConsumption.value}`
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {realTimeData?.data.energyConsumption.unit ?? "W"} corrente
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center justify-center pt-6 text-center">
            <Thermometer className="mb-2 h-5 w-5 text-chart-5" />
            <p className="text-2xl font-bold">
              {realTimeData?.data.internalTemperature.value != null
                ? `${realTimeData.data.internalTemperature.value}°`
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Temp. interna</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center justify-center pt-6 text-center">
            <Activity className="mb-2 h-5 w-5 text-chart-3" />
            <p className="text-2xl font-bold">{activeSensors}</p>
            <p className="text-xs text-muted-foreground">
              Sensori attivi / {totalSensors}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center justify-center pt-6 text-center">
            <Building2 className="mb-2 h-5 w-5 text-chart-2" />
            <p className="text-2xl font-bold">{building.surface}</p>
            <p className="text-xs text-muted-foreground">m&sup2; superficie</p>
          </CardContent>
        </Card>
      </div>

      {/* Date range picker */}
      <Card>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">Periodo di analisi:</span>
            <DateRangePicker value={range} onChange={setRange} />
          </div>
        </CardContent>
      </Card>

      {/* Main Grid: History Chart + Weather */}
      {/* Historical Data Chart with Tabs */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Dati Storici</CardTitle>
            <Tabs
              value={selectedSensorType}
              onValueChange={(v) => setSelectedSensorType(v as SensorTypeKey)}
            >
              <TabsList className="h-8">
                {(
                  Object.entries(SENSOR_TYPE_CONFIG) as [
                    SensorTypeKey,
                    (typeof SENSOR_TYPE_CONFIG)[SensorTypeKey],
                  ][]
                ).map(([key, cfg]) => {
                  const Icon = cfg.icon;
                  return (
                    <TabsTrigger
                      key={key}
                      value={key}
                      className="gap-1 text-xs px-2.5"
                    >
                      <Icon className="h-3 w-3" />
                      {cfg.label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-sm text-muted-foreground">
              <AlertCircle className="mb-2 h-8 w-8" />
              Nessun dato disponibile per "
              {SENSOR_TYPE_CONFIG[selectedSensorType].label}" nel periodo
              selezionato
            </div>
          ) : (
            <ChartContainer
              config={{
                value: {
                  label: `${SENSOR_TYPE_CONFIG[selectedSensorType].label} (${SENSOR_TYPE_CONFIG[selectedSensorType].unit})`,
                  color: SENSOR_TYPE_CONFIG[selectedSensorType].color,
                },
              }}
              className="h-72 w-full aspect-auto"
            >
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="timestamp"
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  tickFormatter={(v) =>
                    `${v} ${SENSOR_TYPE_CONFIG[selectedSensorType].unit}`
                  }
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) =>
                        `${value} ${SENSOR_TYPE_CONFIG[selectedSensorType].unit}`
                      }
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={SENSOR_TYPE_CONFIG[selectedSensorType].color}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Efficiency Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4" />
            Efficienza Energetica
          </CardTitle>
        </CardHeader>
        <CardContent>
          {efficiencyLoading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="mt-2 h-6 w-16" />
                </div>
              ))}
            </div>
          ) : efficiencyData ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  Efficienza Impianto (COP)
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {efficiencyData.metrics.averageCop != null
                    ? efficiencyData.metrics.averageCop.toFixed(2)
                    : "N/D"}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <TrendingDown className="h-3 w-3" />
                    Qualità Isolamento
                  </span>
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {efficiencyData.metrics.insulationQuality != null
                    ? `${efficiencyData.metrics.insulationQuality.toFixed(2)}`
                    : "N/D"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  W/(m²·K) -{" "}
                  {efficiencyData.metrics.estimatedHeatLossCoefficient != null
                    ? `Tot: ${efficiencyData.metrics.estimatedHeatLossCoefficient.toFixed(0)} W/K`
                    : ""}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Consumo Totale</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {efficiencyData.metrics.totalEnergyConsumed.toFixed(1)} kWh
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {efficiencyData.metrics.averageExternalTemperature != null
                    ? `Temp. esterna media: ${efficiencyData.metrics.averageExternalTemperature.toFixed(1)}°C`
                    : ""}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              <AlertCircle className="mr-2 h-4 w-4" />
              Dati di efficienza non disponibili per il periodo selezionato
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sensors & Building Details */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sensors */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Sensori Installati ({totalSensors})
            </CardTitle>
            <Button size="sm" onClick={() => setAddSensorOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Aggiungi
            </Button>
          </CardHeader>
          <CardContent>
            {sensorsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-md" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                    <Skeleton className="h-5 w-16" />
                  </div>
                ))}
              </div>
            ) : sensors.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center text-sm text-muted-foreground">
                <Activity className="mb-2 h-8 w-8" />
                <p>Nessun sensore installato</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setAddSensorOpen(true)}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Aggiungi il primo sensore
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {sensors.map((sensor) => {
                  const statusPresentation = getMonitoringStatusPresentation(
                    getMonitoringStatus(sensor),
                  );
                  const StatusIcon = statusPresentation.icon;
                  return (
                    <div
                      key={sensor.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-md bg-primary/10 p-2 text-primary">
                          {getSensorIcon(sensor.sensorType)}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{sensor.location}</p>
                          <p className="text-xs text-muted-foreground">
                            {getSensorTypeLabel(sensor.sensorType)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {sensor.lastReading && (
                          <div className="text-right">
                            <p className="text-sm font-semibold tabular-nums">
                              {sensor.lastReading.value}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {sensor.lastReading.unit}
                            </p>
                          </div>
                        )}
                        <Badge
                          variant="secondary"
                          className={`gap-1 ${statusPresentation.className}`}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {statusPresentation.label}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                            >
                              <MoreVertical className="h-4 w-4" />
                              <span className="sr-only">Azioni sensore</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setManuallyEditingSensorId(sensor.id)}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Modifica
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeletingSensor(sensor)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Elimina
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {totalPages > 1 && (
              <Pagination className="mt-4">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      aria-disabled={currentPage <= 1}
                      tabIndex={currentPage <= 1 ? -1 : undefined}
                      className={
                        currentPage <= 1
                          ? "pointer-events-none opacity-50"
                          : undefined
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        if (currentPage > 1) setCurrentPage(currentPage - 1);
                      }}
                    />
                  </PaginationItem>
                  {getPaginationItems(currentPage, totalPages).map(
                    (item, i) =>
                      item === "ellipsis" ? (
                        <PaginationItem key={`ellipsis-${i}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={item}>
                          <PaginationLink
                            href="#"
                            isActive={item === currentPage}
                            onClick={(e) => {
                              e.preventDefault();
                              setCurrentPage(item);
                            }}
                          >
                            {item}
                          </PaginationLink>
                        </PaginationItem>
                      ),
                  )}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      aria-disabled={currentPage >= totalPages}
                      tabIndex={currentPage >= totalPages ? -1 : undefined}
                      className={
                        currentPage >= totalPages
                          ? "pointer-events-none opacity-50"
                          : undefined
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        if (currentPage < totalPages)
                          setCurrentPage(currentPage + 1);
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </CardContent>
        </Card>

        {/* Building Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              Dettagli Edificio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  Anno Costruzione
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {building.constructionYear ?? "N/D"}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  Impianto Riscaldamento
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {building.heatingSystemType}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Zona Geografica</p>
                <p className="mt-1 text-sm font-semibold">
                  {building.geographicZone}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Stato</p>
                <p className="mt-1">{getStatusBadge(building.status)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sensor Dialogs */}
      {isEditingBuilding && (
        <EditBuildingDialog
          building={building}
          onClose={() => setIsEditingBuilding(false)}
        />
      )}
      <AddSensorDialog
        buildingId={buildingId}
        buildingName={building.name}
        open={addSensorOpen}
        onOpenChange={setAddSensorOpen}
      />

      {editingSensor && (
        <EditSensorDialog
          key={editingSensor.id}
          sensor={editingSensor}
          open={!!editingSensor}
          onOpenChange={(open: boolean) => {
            if (!open) handleCloseEditDialog();
          }}
        />
      )}

      <AlertDialog
        open={!!deletingSensor}
        onOpenChange={(open) => {
          if (!open) setDeletingSensor(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina Sensore</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare il sensore{" "}
              <span className="font-medium">"{deletingSensor?.location}"</span>?
              Questa azione eliminerà anche tutte le letture associate e non può
              essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSensor}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSensor.isPending ? "Eliminazione..." : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
