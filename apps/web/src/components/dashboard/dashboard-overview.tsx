import { useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Activity, Zap, Flame, BellRing } from "lucide-react"
import { EnergyChart } from "./energy-chart"
import { BuildingsList } from "./buildings-list"
import { AlertsList } from "./alerts-list"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAuth } from "@/lib/auth"
import { useDashboardStats } from "@/hooks/use-dashboard"

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-4 rounded" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-32" />
      </CardContent>
    </Card>
  )
}

export function DashboardOverview() {
  const { user } = useAuth()
  const { data: stats, isLoading } = useDashboardStats()
  const { t } = useTranslation()

  const metrics = [
    {
      title: t("dashboard.electricityConsumption"),
      value: stats?.consumption.electricity != null
        ? stats.consumption.electricity.toFixed(1)
        : "—",
      unit: t("common.kwh"),
      icon: Zap,
      color: "text-chart-1",
    },
    {
      title: t("dashboard.gasConsumption"),
      value: stats?.consumption.gas != null
        ? stats.consumption.gas.toFixed(1)
        : "—",
      unit: "m³",
      icon: Flame,
      color: "text-chart-5",
    },
    {
      title: t("dashboard.activeSensors"),
      value: isLoading ? "…" : String(stats?.sensors.active ?? "—"),
      unit: stats ? `/ ${stats.sensors.total}` : "",
      icon: Activity,
      color: "text-chart-3",
    },
    {
      title: t("dashboard.activeAlerts"),
      value: isLoading ? "…" : String(stats?.alerts.active ?? "—"),
      unit: "",
      icon: BellRing,
      color: "text-destructive",
    },
  ]

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("dashboard.title")}</h1>
        <p className="text-muted-foreground">
          {t("dashboard.welcome", { name: user?.name ?? user?.email ?? "" })}
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
          : metrics.map((metric) => {
              const Icon = metric.icon
              return (
                <Card key={metric.title}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {metric.title}
                    </CardTitle>
                    <Icon className={`h-4 w-4 ${metric.color}`} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {metric.value}
                      {metric.unit && (
                        <span className="ml-1 text-sm font-normal text-muted-foreground">
                          {metric.unit}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("dashboard.consumptionTrend30d")}</CardTitle>
            <CardDescription>{t("dashboard.consumptionTrendDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <EnergyChart />
          </CardContent>
        </Card>
      </div>

      {/* Buildings and Alerts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.monitoredBuildings")}</CardTitle>
            <CardDescription>{t("dashboard.monitoredBuildingsDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-80">
              <BuildingsList />
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t("dashboard.activeAlerts")}</CardTitle>
                <CardDescription>{t("dashboard.activeAlertsDescription")}</CardDescription>
              </div>
              {stats && stats.alerts.active > 0 && (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-xs font-semibold text-destructive-foreground">
                  {stats.alerts.active}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-80">
              <AlertsList limit={5} />
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
