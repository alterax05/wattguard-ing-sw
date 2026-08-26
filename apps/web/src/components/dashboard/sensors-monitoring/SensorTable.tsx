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
import type { SensorWithBuilding } from "@/hooks/use-sensors"

export function SensorTable({
  sensors,
  isLoading,
  errorMessage,
  onRetry,
  onSelect,
}: {
  sensors: SensorWithBuilding[]
  isLoading: boolean
  errorMessage?: string
  onRetry: () => void
  onSelect: (sensor: SensorWithBuilding) => void
}) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("sensors.listTitle")}</CardTitle>
        <CardDescription>
          {t("sensors.listDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("sensors.typeLabel")}</TableHead>
                <TableHead>{t("sensors.location")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead>{t("sensors.lastReading")}</TableHead>
                <TableHead>{t("sensors.lastUpdate")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 6 }, (_, index) => (
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
        ) : errorMessage ? (
          <div className="p-6">
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>{t("sensors.loadError")}</AlertTitle>
              <AlertDescription className="flex flex-col gap-3">
                <p>{errorMessage}</p>
                <Button className="w-fit" variant="outline" onClick={onRetry}>
                  {t("common.retry")}
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : sensors.length === 0 ? (
          <Empty className="rounded-none border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Gauge /></EmptyMedia>
              <EmptyTitle>{t("sensors.notFound")}</EmptyTitle>
              <EmptyDescription>
                {t("sensors.notFoundDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
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
                <SensorTableRow key={sensor.id} sensor={sensor} onSelect={onSelect} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
