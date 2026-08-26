import { useMemo, useState } from "react";
import { endOfDay } from "date-fns";
import { useTranslation } from "react-i18next";
import type { DateRange } from "react-day-picker";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toIsoDate, getIntlLocale } from "@/lib/dates";
import {
  useBuilding,
  useBuildingRealTime,
  useBuildingHistory,
  useDeleteBuilding,
} from "@/hooks/use-buildings";
import { useAuth } from "@/lib/auth";
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
  Activity,
  AlertCircle,
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
import { BuildingStatusBadge } from "./building-status-badge";
import { DateRangePicker } from "./date-range-picker";
import { toast } from "sonner";

import {
  getDefaultDateRange,
  getPaginationItems,
  getSensorIcon,
  SENSORS_PAGE_SIZE,
  SENSOR_TYPE_CONFIG,
  type SensorTypeKey,
} from "./building-detail/helpers"
import { BuildingHeader } from "./building-detail/BuildingHeader"
import { StatsGrid } from "./building-detail/StatsGrid"
import { EfficiencySection } from "./building-detail/EfficiencySection"

interface BuildingDetailProps {
  buildingId: string;
}

export function BuildingDetail({ buildingId }: BuildingDetailProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const navigate = useNavigate();
  const { t } = useTranslation();
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

  // API hooks
  const {
    data: buildingData,
    isLoading: buildingLoading,
    isError: buildingError,
  } = useBuilding(buildingId);
  const building = buildingData?.building;

  const { data: realTimeData } = useBuildingRealTime(buildingId);
  const { data: allSensorsData } = useAllSensors(
    { buildingId },
    { refetchInterval: 60 * 1000 },
  );
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

  // Building delete state
  const [confirmDeleteBuildingOpen, setConfirmDeleteBuildingOpen] = useState(false);
  const deleteBuilding = useDeleteBuilding();

  // Deep-link sensor handling — derived without effects, avoids setState-in-effect.
  const sensorIdToEdit = searchParams.get("sensorId");
  const editingSensorId = manuallyEditingSensorId ?? sensorIdToEdit;
  const editingSensor = allSensors.find((s) => s.id === editingSensorId) ?? null;

  const sensorIndex = editingSensor
    ? allSensors.findIndex((s) => s.id === editingSensor.id)
    : -1;
  const sensorPage =
    sensorIndex >= 0
      ? Math.floor(sensorIndex / SENSORS_PAGE_SIZE) + 1
      : null;
  const fetchPage = sensorPage ?? currentPage;

  const { data: sensorsData, isLoading: sensorsLoading } = useSensors(
    {
      buildingId,
      limit: String(SENSORS_PAGE_SIZE),
      offset: String((fetchPage - 1) * SENSORS_PAGE_SIZE),
    },
    { refetchInterval: 60 * 1000, placeholderData: keepPreviousData },
  );
  const { data: historyData, isLoading: historyLoading } = useBuildingHistory(
    buildingId,
    historyParams,
  );

  const sensors = sensorsData?.sensors ?? [];
  const totalSensors = sensorsData?.pagination.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalSensors / SENSORS_PAGE_SIZE));
  const displayPage = Math.min(fetchPage, totalPages);

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
          t("sensors.deleted", { location: deletingSensor.location }),
        );
        setDeletingSensor(null);
      },
      onError: (error) => {
        toast.error(error.message || t("sensors.deleteError"));
      },
    });
  };

  const handleDeleteBuilding = () => {
    deleteBuilding.mutate(buildingId, {
      onSuccess: () => {
        toast.success(t("buildings.deleted"));
        void navigate("/dashboard/buildings");
      },
      onError: (error) => {
        toast.error(error.message || t("buildings.deleteError"));
        setConfirmDeleteBuildingOpen(false);
      },
    });
  };

  const intlLocale = getIntlLocale();

  // Prepare history chart data
  const chartData = useMemo(() => {
    if (!historyData?.data) return [];
    return historyData.data.map((point) => ({
      timestamp: new Date(point.timestamp).toLocaleString(intlLocale, {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
      value: point.value,
      sensorType: point.sensorType,
      unit: point.unit,
    }));
  }, [historyData, intlLocale]);

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
        <p className="font-medium">{t("errors.building_not_found")}</p>
        <Button
          variant="outline"
          className="mt-4 bg-transparent"
          onClick={() => { void navigate("/dashboard/buildings") }}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("buildings.backToSearch")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BuildingHeader
        building={building}
        isAdmin={isAdmin}
        onBack={() => { void navigate("/dashboard/buildings") }}
        onEdit={() => { setIsEditingBuilding(true) }}
        onDelete={() => { setConfirmDeleteBuildingOpen(true) }}
      />

      <StatsGrid
        building={building}
        realTimeData={realTimeData}
        activeSensors={activeSensors}
        totalSensors={totalSensors}
      />

      {/* Date range picker */}
      <Card>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">{t("buildings.analysisPeriod")}</span>
            <DateRangePicker value={range} onChange={setRange} />
          </div>
        </CardContent>
      </Card>

      {/* Main Grid: History Chart + Weather */}
      {/* Historical Data Chart with Tabs */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">{t("buildings.historicalData")}</CardTitle>
            <Tabs
              value={selectedSensorType}
              onValueChange={(v) => {
                // SAFETY: the Tabs only render the four sensor types defined in SENSOR_TYPE_CONFIG.
                setSelectedSensorType(v as SensorTypeKey)
              }}
            >
              <TabsList className="h-8">
                {(
                  // SAFETY: Object.entries widens the keys; SENSOR_TYPE_CONFIG declares exactly the SensorTypeKey entries.
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
                      {t(cfg.labelKey)}
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
              {t("buildings.noDataForPeriod", {
                label: t(SENSOR_TYPE_CONFIG[selectedSensorType].labelKey),
              })}
            </div>
          ) : (
            <ChartContainer
              config={{
                value: {
                  label: `${t(SENSOR_TYPE_CONFIG[selectedSensorType].labelKey)} (${SENSOR_TYPE_CONFIG[selectedSensorType].unit})`,
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
                        `${String(value)} ${SENSOR_TYPE_CONFIG[selectedSensorType].unit}`
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

      <EfficiencySection building={building} range={range} />

      {/* Sensors & Building Details */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sensors */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              {t("buildings.installedSensors", { count: totalSensors })}
            </CardTitle>
            <Button size="sm" onClick={() => { setAddSensorOpen(true) }}>
              <Plus className="mr-1 h-4 w-4" />
              {t("common.add")}
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
                <p>{t("buildings.noSensors")}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => { setAddSensorOpen(true) }}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {t("buildings.addFirstSensor")}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {sensors.map((sensor) => {
                  const statusPresentation = getMonitoringStatusPresentation(
                    getMonitoringStatus(sensor),
                    t,
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
                            {t(`sensors.type.${sensor.sensorType}`, { defaultValue: sensor.sensorType })}
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
                              <span className="sr-only">{t("sensors.actions")}</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => { setManuallyEditingSensorId(sensor.id) }}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              {t("common.edit")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => { setDeletingSensor(sensor) }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t("common.delete")}
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
                      aria-disabled={displayPage <= 1}
                      tabIndex={displayPage <= 1 ? -1 : undefined}
                      className={
                        displayPage <= 1
                          ? "pointer-events-none opacity-50"
                          : undefined
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        if (displayPage > 1) setCurrentPage(displayPage - 1);
                      }}
                    />
                  </PaginationItem>
                  {getPaginationItems(displayPage, totalPages).map(
                    (item, i) =>
                      item === "ellipsis" ? (
                        <PaginationItem key={`ellipsis-${i}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={item}>
                          <PaginationLink
                            href="#"
                            variant={item === displayPage ? "outline" : "ghost"}
                            aria-current={item === displayPage ? "page" : undefined}
                            data-active={item === displayPage}
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
                      aria-disabled={displayPage >= totalPages}
                      tabIndex={displayPage >= totalPages ? -1 : undefined}
                      className={
                        displayPage >= totalPages
                          ? "pointer-events-none opacity-50"
                          : undefined
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        if (displayPage < totalPages)
                          setCurrentPage(displayPage + 1);
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
              {t("buildings.details")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  {t("buildings.constructionYear")}
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {building.constructionYear ?? t("common.na")}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  {t("buildings.heatingSystem")}
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {building.heatingSystemType}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{t("buildings.geographicZone")}</p>
                <p className="mt-1 text-sm font-semibold">
                  {building.geographicZone}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{t("common.status")}</p>
                <p className="mt-1"><BuildingStatusBadge status={building.status} className="text-sm" /></p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sensor Dialogs */}
      {isEditingBuilding && (
        <EditBuildingDialog
          building={building}
          onClose={() => { setIsEditingBuilding(false) }}
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
            <AlertDialogTitle>{t("sensors.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("sensors.deleteConfirmDescription", {
                location: deletingSensor?.location ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSensor}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSensor.isPending ? t("common.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmDeleteBuildingOpen}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteBuildingOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("buildings.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("buildings.deleteConfirmDescription", { name: building.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBuilding}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteBuilding.isPending ? t("common.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
