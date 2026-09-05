import type { TFunction } from "i18next"
import type { BuildingStatus } from "@wattguard/shared"

export const BUILDING_STATUS_STYLES = {
  active: "bg-chart-3/15 text-chart-3",
  inactive: "",
  decommissioned: "bg-destructive/15 text-destructive",
} satisfies Record<BuildingStatus, string>

export function getBuildingStatusLabel(
  status: BuildingStatus,
  t: TFunction,
): string {
  return t(`buildings.status.${status}`, { defaultValue: status })
}
