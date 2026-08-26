import { useTranslation } from "react-i18next"
import { ChevronRight, Clock3, MapPin } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { TableCell, TableRow } from "@/components/ui/table"
import { getMonitoringStatus, getMonitoringStatusPresentation } from "@/lib/sensor-status"
import { getIntlLocale } from "@/lib/dates"
import { cn } from "@/lib/utils"
import { getSensorIcon, getSensorUnit, getLastUpdate } from "./helpers"
import type { SensorWithBuilding } from "@/hooks/use-sensors"
import type { KeyboardEvent } from "react"

export function SensorTableRow({
  sensor,
  onSelect,
}: {
  sensor: SensorWithBuilding
  onSelect: (sensor: SensorWithBuilding) => void
}) {
  const { t } = useTranslation()
  const status = getMonitoringStatus(sensor)
  const statusPresentation = getMonitoringStatusPresentation(status, t)
  const lastUpdate = getLastUpdate(sensor.lastReading?.timestamp)
  const StatusIcon = statusPresentation.icon
  const intlLocale = getIntlLocale()

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
      aria-label={t("sensors.openDetails", { location: sensor.location })}
      onClick={() => { onSelect(sensor) }}
      onKeyDown={handleKeyDown}
    >
      <TableCell>
        <div className="flex min-w-[170px] items-center gap-2">
          <div className="rounded-md bg-primary/10 p-2 text-primary">{getSensorIcon(sensor.sensorType)}</div>
          <span className="font-medium">{t(`sensors.type.${sensor.sensorType}`, { defaultValue: sensor.sensorType })}</span>
        </div>
      </TableCell>
      <TableCell className="min-w-[260px] whitespace-normal">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">{sensor.location}</p>
            <p className="text-xs text-muted-foreground">
              {sensor.building?.name ?? t("sensors.buildingUnavailable")}
            </p>
            {sensor.building?.address && (
              <p className="text-xs text-muted-foreground">{sensor.building.address}</p>
            )}
            {sensor.serialNumber && (
              <p className="mt-1 text-xs text-muted-foreground">{t("sensors.serial", { serial: sensor.serialNumber })}</p>
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
              ? sensor.lastReading.value.toLocaleString(intlLocale, { maximumFractionDigits: 2 })
              : t("common.na")}
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
          <span className="text-sm text-muted-foreground">{t("sensors.noDataReceived")}</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
      </TableCell>
    </TableRow>
  )
}
