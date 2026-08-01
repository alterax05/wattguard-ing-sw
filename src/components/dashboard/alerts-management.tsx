import { useAlerts, useAcknowledgeAlert, useResolveAlert, type Alert } from "@/hooks/use-alerts";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, AlertCircle, Info, CheckCircle, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

export function AlertsManagement() {
  const { data, isLoading, error } = useAlerts();
  const acknowledgeMutation = useAcknowledgeAlert();
  const resolveMutation = useResolveAlert();

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
      <Card className="border-destructive">
        <CardContent className="flex items-center justify-center py-6 text-destructive">
          <AlertCircle className="mr-2 h-5 w-5" />
          <p>Errore nel caricamento delle notifiche</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs defaultValue="active" className="w-full">
      <TabsList className="w-full">
        <TabsTrigger value="active">
          Attive
          {alertsByStatus.active.length > 0 && (
            <Badge variant={"destructive"} className="ml-2">
              {alertsByStatus.active.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="acknowledged">
          Prese in carico
          {alertsByStatus.acknowledged.length > 0 && (
            <Badge variant={"default"} className="ml-2">
              {alertsByStatus.acknowledged.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="resolved">
          Risolte
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
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="mb-2 h-12 w-12 text-chart-3" />
                <p className="text-lg font-medium">
                  Nessuna notifica {status === "active" ? "attiva" : status === "acknowledged" ? "presa in carico" : "risolta"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Tutto sotto controllo!
                </p>
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
                                {alert.type.replace("_", " ")}
                              </Badge>
                              <Badge
                                className={getSeverityColor(alert.severity)}
                                variant="secondary"
                              >
                                {alert.severity}
                              </Badge>
                            </div>
                            <h3 className="mt-2 font-semibold leading-tight">
                              {alert.message}
                            </h3>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{alert.buildingName}</span>
                          <span>•</span>
                          <span>
                            {formatDistanceToNow(new Date(alert.createdAt), {
                              addSuffix: true,
                              locale: it,
                            })}
                          </span>
                        </div>

                        {alert.acknowledgedBy && alert.acknowledgedAt && (
                          <div className="text-sm text-muted-foreground">
                            Presa in carico da {alert.acknowledgedBy} •{" "}
                            {formatDistanceToNow(
                              new Date(alert.acknowledgedAt),
                              {
                                addSuffix: true,
                                locale: it,
                              },
                            )}
                          </div>
                        )}
                        
                        {alert.resolvedBy && alert.resolvedAt && (
                          <div className="text-sm text-muted-foreground">
                            Risolta da {alert.resolvedBy} •{" "}
                            {formatDistanceToNow(
                              new Date(alert.resolvedAt),
                              {
                                addSuffix: true,
                                locale: it,
                              },
                            )}
                          </div>
                        )}

                        {status === "active" && (
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAcknowledge(alert.id)}
                              disabled={acknowledgeMutation.isPending || resolveMutation.isPending}
                            >
                              Prendi in carico
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleResolve(alert.id)}
                              disabled={acknowledgeMutation.isPending || resolveMutation.isPending}
                            >
                              Risolvi
                            </Button>
                          </div>
                        )}

                        {status === "acknowledged" && (
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              onClick={() => handleResolve(alert.id)}
                              disabled={resolveMutation.isPending}
                            >
                              Risolvi
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
