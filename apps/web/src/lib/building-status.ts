import type { TFunction } from "i18next"

export type BuildingStatus = "active" | "inactive" | "decommissioned"

export const BUILDING_STATUS_STYLES: Record<BuildingStatus, string> = {
  active: "bg-chart-3/15 text-chart-3",
  inactive: "",
  decommissioned: "bg-destructive/15 text-destructive",
}

export function getBuildingStatusLabel(
  status: BuildingStatus,
  t: TFunction,
): string {
  return t(`buildings.status.${status}`, { defaultValue: status })
}
