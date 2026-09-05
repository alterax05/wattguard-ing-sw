import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { AlertCircle, Gauge } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SensorTableRow } from "./SensorTableRow"
import type { Sensor } from "@wattguard/shared"

export function SensorTableRoot({
  title,
  description,
  children,
  className,
}: {
  title?: string
  description?: string
  children: ReactNode
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title ?? t("sensors.listTitle")}</CardTitle>
        <CardDescription>{description ?? t("sensors.listDescription")}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function SensorTableSkeleton({ rowCount = 6 }: { rowCount?: number }) {
  const { t } = useTranslation()
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("sensors.typeLabel")}</TableHead>
          <TableHead>{t("sensors.location")}</TableHead>
          <TableHead>{t("sensors.operationalStatus")}</TableHead>
          <TableHead>{t("sensors.lastReading")}</TableHead>
          <TableHead>{t("sensors.lastUpdate")}</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rowCount }, (_, index) => (
          <TableRow key={index}>
            <TableCell><Skeleton className="h-6 w-36" /></TableCell>
            <TableCell><Skeleton className="h-10 w-56" /></TableCell>
            <TableCell><Skeleton className="h-6 w-20" /></TableCell>
            <TableCell><Skeleton className="h-8 w-20" /></TableCell>
            <TableCell><Skeleton className="h-8 w-36" /></TableCell>
            <TableCell><Skeleton className="ml-auto h-4 w-4" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function SensorTableError({
  message,
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="p-6">
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>{t("sensors.loadError")}</AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <p>{message ?? t("sensors.genericLoadError")}</p>
          {onRetry && (
            <Button className="w-fit" variant="outline" onClick={onRetry}>
              {t("common.retry")}
            </Button>
          )}
        </AlertDescription>
      </Alert>
    </div>
  )
}

export function SensorTableEmpty() {
  const { t } = useTranslation()
  return (
    <Empty className="rounded-none border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon"><Gauge /></EmptyMedia>
        <EmptyTitle>{t("sensors.notFound")}</EmptyTitle>
        <EmptyDescription>{t("sensors.notFoundDescription")}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

export function SensorTableRows({
  sensors,
  onSelect,
}: {
  sensors: Sensor[]
  onSelect: (sensor: Sensor) => void
}) {
  const { t } = useTranslation()
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("sensors.typeLabel")}</TableHead>
          <TableHead>{t("sensors.location")}</TableHead>
          <TableHead>{t("sensors.operationalStatus")}</TableHead>
          <TableHead>{t("sensors.lastReading")}</TableHead>
          <TableHead>{t("sensors.lastUpdate")}</TableHead>
          <TableHead className="w-10"><span className="sr-only">{t("common.details")}</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sensors.map((sensor) => (
          <SensorTableRow key={sensor._id} sensor={sensor} onSelect={onSelect} />
        ))}
      </TableBody>
    </Table>
  )
}

export interface SensorTableProps {
  sensors: Sensor[]
  isLoading: boolean
  errorMessage?: string
  onRetry: () => void
  onSelect: (sensor: Sensor) => void
}

export const SensorTable = Object.assign(
  function SensorTable({
    sensors,
    isLoading,
    errorMessage,
    onRetry,
    onSelect,
  }: SensorTableProps) {
    return (
      <SensorTableRoot>
        {isLoading ? (
          <SensorTableSkeleton />
        ) : errorMessage ? (
          <SensorTableError message={errorMessage} onRetry={onRetry} />
        ) : sensors.length === 0 ? (
          <SensorTableEmpty />
        ) : (
          <SensorTableRows sensors={sensors} onSelect={onSelect} />
        )}
      </SensorTableRoot>
    )
  },
  {
    Root: SensorTableRoot,
    Skeleton: SensorTableSkeleton,
    Error: SensorTableError,
    Empty: SensorTableEmpty,
    Rows: SensorTableRows,
  },
)
