import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  BUILDING_STATUS_STYLES,
  getBuildingStatusLabel,
} from "@/lib/building-status"
import type { BuildingStatus } from "@wattguard/shared"

interface BuildingStatusBadgeProps {
  status: BuildingStatus
  icon?: ReactNode
  className?: string
}

export function BuildingStatusBadge({ status, icon, className }: BuildingStatusBadgeProps) {
  const { t } = useTranslation()

  return (
    <Badge variant="secondary" className={cn(BUILDING_STATUS_STYLES[status], className)}>
      {icon}
      {getBuildingStatusLabel(status, t)}
    </Badge>
  )
}
