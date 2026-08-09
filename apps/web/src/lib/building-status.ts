export type BuildingStatus = "active" | "inactive" | "decommissioned"

export const BUILDING_STATUS_LABELS: Record<BuildingStatus, string> = {
  active: "Attivo",
  inactive: "Inattivo",
  decommissioned: "Dismesso",
}

export const BUILDING_STATUS_STYLES: Record<BuildingStatus, string> = {
  active: "bg-chart-3/15 text-chart-3",
  inactive: "",
  decommissioned: "bg-destructive/15 text-destructive",
}

export function getBuildingStatusLabel(status: BuildingStatus): string {
  return BUILDING_STATUS_LABELS[status]
}
