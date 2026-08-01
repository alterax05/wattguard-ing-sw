import { useAlerts } from "@/hooks/use-alerts"
import { AlertTriangle, AlertCircle, Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDistanceToNow } from "date-fns"
import { it } from "date-fns/locale"

interface AlertsListProps {
  limit?: number
}

export function AlertsList({ limit = 10 }: AlertsListProps) {
  const { data, isLoading, isError } = useAlerts({ status: "active" })

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
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <AlertCircle className="mb-2 h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">Errore nel caricamento delle notifiche</p>
      </div>
    )
  }

  const alerts = (data?.alerts ?? []).slice(0, limit)

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Info className="mb-2 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Nessuna notifica attiva</p>
      </div>
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
            <p className="text-sm font-medium leading-none">{alert.message}</p>
            <p className="text-xs text-muted-foreground">
              {alert.buildingName} •{" "}
              {formatDistanceToNow(new Date(alert.createdAt), {
                addSuffix: true,
                locale: it,
              })}
            </p>
          </div>
          <Badge variant="outline" className="capitalize">
            {alert.type.replace(/_/g, " ")}
          </Badge>
        </div>
      ))}
    </div>
  )
}
