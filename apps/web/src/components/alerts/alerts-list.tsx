import { useTranslation } from "react-i18next"
import { useAlerts } from "@/hooks/use-alerts"
import { AlertTriangle, AlertCircle, Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty"
import { formatDistanceToNow } from "date-fns"
import { getDateFnsLocale } from "@/lib/dates"
import { composeAlertMessage, getAlertBuildingName, getAlertTypeLabel } from "@/lib/alerts"

interface AlertsListProps {
  limit?: number
}

export function AlertsList({ limit = 10 }: AlertsListProps) {
  const { data, isLoading, isError } = useAlerts({ status: "active" })
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: Math.min(limit, 3) }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 rounded-lg border p-3">
            <Skeleton className="mt-0.5 h-8 w-8 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <Empty className="py-8">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="text-destructive">
            <AlertCircle className="h-6 w-6" />
          </EmptyMedia>
          <EmptyDescription>{t("alerts.loadError")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const alerts = (data?.alerts ?? []).slice(0, limit)

  if (alerts.length === 0) {
    return (
      <Empty className="py-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Info className="h-6 w-6" />
          </EmptyMedia>
          <EmptyDescription>{t("alerts.noActive")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
      case "high":
        return <AlertTriangle className="h-4 w-4" />
      default:
        return <AlertCircle className="h-4 w-4" />
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-destructive text-destructive-foreground"
      case "high":
        return "bg-chart-5 text-white"
      case "medium":
        return "bg-chart-4 text-white"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  const dateFnsLocale = getDateFnsLocale()

  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
        >
          <div className={`mt-0.5 rounded-lg p-2 ${getSeverityColor(alert.severity)}`}>
            {getSeverityIcon(alert.severity)}
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium leading-none">{composeAlertMessage(alert, t)}</p>
            <p className="text-xs text-muted-foreground">
              {getAlertBuildingName(alert)} •{" "}
              {formatDistanceToNow(new Date(alert.createdAt), {
                addSuffix: true,
                locale: dateFnsLocale,
              })}
            </p>
          </div>
          <Badge variant="outline" className="capitalize">
            {getAlertTypeLabel(alert.type, t)}
          </Badge>
        </div>
      ))}
    </div>
  )
}
