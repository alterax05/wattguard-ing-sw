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
import { usePollingInterval } from "@/hooks/use-settings";
import { useAuth } from "@/lib/auth";
import {
  useAllSensors,
  useDeleteSensor,
  useSensors,
  type SensorWithBuilding,
} from "@/hooks/use-sensors";
import { keepPreviousData } from "@tanstack/react-query";
import { getMonitoringStatus } from "@/lib/sensor-status";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
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
import { ArrowLeft, Building2 } from "lucide-react";
import { AddSensorDialog, EditSensorDialog } from "@/components/sensors";
import { EditBuildingDialog } from "./edit-building-dialog";
import { toast } from "sonner";

import {
  getDefaultDateRange,
  SENSORS_PAGE_SIZE,
  type SensorTypeKey,
} from "./building-detail/helpers"
import { BuildingHeader } from "./building-detail/BuildingHeader"
import { StatsGrid } from "./building-detail/StatsGrid"
import { EfficiencySection } from "./building-detail/EfficiencySection"
import { HistorySection } from "./building-detail/HistorySection"
import { SensorsSection } from "./building-detail/SensorsSection"
import { BuildingDetailsCard } from "./building-detail/BuildingDetailsCard"

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

  const pollingInterval = usePollingInterval();
  const { data: realTimeData } = useBuildingRealTime(buildingId);
  const { data: allSensorsData } = useAllSensors(
    { buildingId },
    { refetchInterval: pollingInterval },
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
    { refetchInterval: pollingInterval, placeholderData: keepPreviousData },
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
      <Empty className="py-24">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Building2 className="h-8 w-8" />
          </EmptyMedia>
          <EmptyTitle>{t("errors.building_not_found")}</EmptyTitle>
          <Button
            variant="outline"
            className="mt-4 bg-transparent"
            onClick={() => { void navigate("/dashboard/buildings") }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("buildings.backToSearch")}
          </Button>
        </EmptyHeader>
      </Empty>
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
      <HistorySection
        range={range}
        onRangeChange={setRange}
        selectedSensorType={selectedSensorType}
        onSelectedSensorTypeChange={setSelectedSensorType}
        historyLoading={historyLoading}
        chartData={chartData}
      />
      <EfficiencySection
        building={building}
        range={range}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <SensorsSection
          sensors={sensors}
          sensorsLoading={sensorsLoading}
          totalSensors={totalSensors}
          totalPages={totalPages}
          displayPage={displayPage}
          onPageChange={setCurrentPage}
          onAddSensor={() => { setAddSensorOpen(true) }}
          onEditSensor={(id) => { setManuallyEditingSensorId(id) }}
          onDeleteSensor={(sensor) => { setDeletingSensor(sensor) }}
        />
        <BuildingDetailsCard building={building} />
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
