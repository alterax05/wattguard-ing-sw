import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  BUILDING_STATUS_STYLES,
  getBuildingStatusLabel,
  type BuildingStatus,
} from "@/lib/building-status"

interface BuildingStatusBadgeProps {
  status: BuildingStatus
  icon?: ReactNode
  className?: string
}

export function BuildingStatusBadge({ status, icon, className }: BuildingStatusBadgeProps) {
  return (
    <Badge variant="secondary" className={cn(BUILDING_STATUS_STYLES[status], className)}>
      {icon}
      {getBuildingStatusLabel(status)}
    </Badge>
  )
}
