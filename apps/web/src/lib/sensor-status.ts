import type { TFunction } from "i18next"
import { AlertCircle, CheckCircle2, WifiOff, Wrench, type LucideIcon } from "lucide-react"
import type { SensorStatus } from "@/hooks/use-sensors"

export type MonitoringStatus = "active" | "offline" | "maintenance" | "error"

export interface MonitoringStatusPresentation {
  label: string
  icon: LucideIcon
  className: string
}

/**
 * Maps the raw sensor status to the monitoring status shown across the
 * dashboard. A sensor that is "inactive", or "active" but flagged offline
 * by the API (no readings beyond 2× its transmission interval), is shown
 * as "offline".
 */
export function getMonitoringStatus(sensor: {
  status: SensorStatus
  isOffline?: boolean
}): MonitoringStatus {
  if (sensor.status === "inactive" || (sensor.status === "active" && sensor.isOffline)) {
    return "offline"
  }

  return sensor.status
}

export function getMonitoringStatusPresentation(
  status: MonitoringStatus,
  t: TFunction,
): MonitoringStatusPresentation {
  switch (status) {
    case "active":
      return {
        label: t("sensors.status.active"),
        icon: CheckCircle2,
        className: "bg-chart-3 text-white",
      }
    case "offline":
      return {
        label: t("sensors.status.offline"),
        icon: WifiOff,
        className: "bg-muted text-muted-foreground",
      }
    case "maintenance":
      return {
        label: t("sensors.status.maintenance"),
        icon: Wrench,
        className: "bg-chart-4 text-foreground",
      }
    case "error":
      return {
        label: t("sensors.status.error"),
        icon: AlertCircle,
        className: "bg-destructive text-destructive-foreground",
      }
  }
}
