import { useAlerts, useAcknowledgeAlert, useResolveAlert } from "@/hooks/use-alerts";
import type {Alert} from "@wattguard/shared"
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, AlertCircle, Info, CheckCircle, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getDateFnsLocale } from "@/lib/dates";
import { composeAlertMessage, getAlertSeverityLabel, getAlertTypeLabel } from "@/lib/alerts";

const STATUS_LABEL_KEYS = {
  active: "alerts.statusActive",
  acknowledged: "alerts.statusAcknowledged",
  resolved: "alerts.statusResolved",
} satisfies Record<Alert["status"], string>;

export function AlertsManagement() {
  const { data, isLoading, error } = useAlerts();
  const acknowledgeMutation = useAcknowledgeAlert();
  const resolveMutation = useResolveAlert();
  const { t } = useTranslation();

  const alerts = data?.alerts || [];

  const alertsByStatus = {
    active: alerts.filter((a) => a.status === "active"),
    acknowledged: alerts.filter((a) => a.status === "acknowledged"),
    resolved: alerts.filter((a) => a.status === "resolved"),
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return <AlertTriangle className="h-5 w-5" />;
      case "high":
        return <AlertTriangle className="h-5 w-5" />;
      case "medium":
        return <AlertCircle className="h-5 w-5" />;
      default:
        return <Info className="h-5 w-5" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-destructive text-destructive-foreground";
      case "high":
        return "bg-chart-5 text-white";
      case "medium":
        return "bg-chart-4 text-white";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const handleAcknowledge = (alertId: string) => {
    acknowledgeMutation.mutate(alertId);
  };

  const handleResolve = (alertId: string) => {
    resolveMutation.mutate(alertId);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Empty className="border border-destructive/50 py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="text-destructive">
            <AlertCircle className="h-6 w-6" />
          </EmptyMedia>
          <EmptyDescription className="text-destructive">{t("alerts.loadError")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const dateFnsLocale = getDateFnsLocale();

  return (
    <Tabs defaultValue="active" className="w-full">
      <TabsList className="w-full">
        <TabsTrigger value="active">
          {t("alerts.statusActive")}
          {alertsByStatus.active.length > 0 && (
            <Badge variant={"destructive"} className="ml-2">
              {alertsByStatus.active.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="acknowledged">
          {t("alerts.statusAcknowledged")}
          {alertsByStatus.acknowledged.length > 0 && (
            <Badge variant={"default"} className="ml-2">
              {alertsByStatus.acknowledged.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="resolved">
          {t("alerts.statusResolved")}
          {alertsByStatus.resolved.length > 0 && (
            <Badge variant={"secondary"} className="ml-2">
              {alertsByStatus.resolved.length}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>

      {Object.entries(alertsByStatus).map(([status, statusAlerts]) => (
        <TabsContent key={status} value={status} className="mt-6">
          {statusAlerts.length === 0 ? (
            <Card>
              <CardContent className="py-4">
                <Empty className="border-0 py-8">
                  <EmptyHeader>
                    <EmptyMedia variant="icon" className="text-chart-3">
                      <CheckCircle className="h-6 w-6" />
                    </EmptyMedia>
                    <EmptyTitle>
                      {t("alerts.emptyTitle", {
                        // SAFETY: status is a key of alertsByStatus, which holds exactly the three alert statuses.
                        status: t(STATUS_LABEL_KEYS[status as Alert["status"]]),
                      })}
                    </EmptyTitle>
                    <EmptyDescription>{t("alerts.allClear")}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {statusAlerts.map((alert: Alert) => (
                <Card key={alert.id} className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="flex items-start gap-4 p-4">
                      <div
                        className={`rounded-lg p-3 ${getSeverityColor(alert.severity)}`}
                      >
                        {getSeverityIcon(alert.severity)}
                      </div>

                      <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="capitalize">
                                {getAlertTypeLabel(alert.type, t)}
                              </Badge>
                              <Badge
                                className={getSeverityColor(alert.severity)}
                                variant="secondary"
                              >
                                {getAlertSeverityLabel(alert.severity, t)}
                              </Badge>
                            </div>
                            <h3 className="mt-2 font-semibold leading-tight">
                              {composeAlertMessage(alert, t)}
                            </h3>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{alert.buildingName}</span>
                          <span>•</span>
                          <span>
                            {formatDistanceToNow(new Date(alert.createdAt), {
                              addSuffix: true,
                              locale: dateFnsLocale,
                            })}
                          </span>
                        </div>

                        {alert.acknowledgedBy && alert.acknowledgedAt && (
                          <div className="text-sm text-muted-foreground">
                            {t("alerts.acknowledgedBy", {
                              name: alert.acknowledgedBy,
                              time: formatDistanceToNow(
                                new Date(alert.acknowledgedAt),
                                {
                                  addSuffix: true,
                                  locale: dateFnsLocale,
                                },
                              ),
                            })}
                          </div>
                        )}

                        {alert.resolvedBy && alert.resolvedAt && (
                          <div className="text-sm text-muted-foreground">
                            {t("alerts.resolvedBy", {
                              name: alert.resolvedBy,
                              time: formatDistanceToNow(
                                new Date(alert.resolvedAt),
                                {
                                  addSuffix: true,
                                  locale: dateFnsLocale,
                                },
                              ),
                            })}
                          </div>
                        )}

                        {status === "active" && (
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { handleAcknowledge(alert.id) }}
                              disabled={acknowledgeMutation.isPending || resolveMutation.isPending}
                            >
                              {t("alerts.acknowledge")}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => { handleResolve(alert.id) }}
                              disabled={acknowledgeMutation.isPending || resolveMutation.isPending}
                            >
                              {t("alerts.resolve")}
                            </Button>
                          </div>
                        )}

                        {status === "acknowledged" && (
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              onClick={() => { handleResolve(alert.id) }}
                              disabled={resolveMutation.isPending}
                            >
                              {t("alerts.resolve")}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
