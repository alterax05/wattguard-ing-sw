import { useTranslation } from "react-i18next"
import { Activity, Plus, MoreVertical, Pencil, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { getMonitoringStatus, getMonitoringStatusPresentation } from "@/lib/sensor-status"
import { getSensorIcon, getPaginationItems } from "./helpers"
import type { Sensor } from "@/hooks/use-sensors"

export interface SensorsSectionProps {
  sensors: Sensor[]
  sensorsLoading: boolean
  totalSensors: number
  totalPages: number
  displayPage: number
  onPageChange: (page: number) => void
  onAddSensor: () => void
  onEditSensor: (id: string) => void
  onDeleteSensor: (sensor: Sensor) => void
}

export function SensorsSection({
  sensors,
  sensorsLoading,
  totalSensors,
  totalPages,
  displayPage,
  onPageChange,
  onAddSensor,
  onEditSensor,
  onDeleteSensor,
}: SensorsSectionProps) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" />
          {t("buildings.installedSensors", { count: totalSensors })}
        </CardTitle>
        <Button size="sm" onClick={onAddSensor}>
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
          <Empty className="py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Activity className="h-6 w-6" />
              </EmptyMedia>
              <EmptyDescription>{t("buildings.noSensors")}</EmptyDescription>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={onAddSensor}
              >
                <Plus className="mr-1 h-4 w-4" />
                {t("buildings.addFirstSensor")}
              </Button>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-3">
            {sensors.map((sensor) => {
              const statusPresentation = getMonitoringStatusPresentation(
                getMonitoringStatus(sensor),
                t,
              )
              const StatusIcon = statusPresentation.icon
              return (
                <div
                  key={sensor._id}
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
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                          <span className="sr-only">{t("sensors.actions")}</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { onEditSensor(sensor._id) }}>
                          <Pencil className="mr-2 h-4 w-4" />
                          {t("common.edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => { onDeleteSensor(sensor) }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t("common.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )
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
                  className={displayPage <= 1 ? "pointer-events-none opacity-50" : undefined}
                  onClick={(e) => {
                    e.preventDefault()
                    if (displayPage > 1) onPageChange(displayPage - 1)
                  }}
                />
              </PaginationItem>
              {getPaginationItems(displayPage, totalPages).map((item, i) =>
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
                        e.preventDefault()
                        onPageChange(item)
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
                  className={displayPage >= totalPages ? "pointer-events-none opacity-50" : undefined}
                  onClick={(e) => {
                    e.preventDefault()
                    if (displayPage < totalPages) onPageChange(displayPage + 1)
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </CardContent>
    </Card>
  )
}
