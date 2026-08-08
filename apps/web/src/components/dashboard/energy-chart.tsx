import { useMemo } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { useDashboardHistory } from "@/hooks/use-dashboard"

export function EnergyChart() {
  // Last 30 days
  const { startDate, endDate } = useMemo(() => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 29)
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    }
  }, [])

  const { data, isLoading, isError } = useDashboardHistory({ startDate, endDate, interval: "day" })

  if (isLoading) {
    return <Skeleton className="h-80 w-full" />
  }

  if (isError || !data) {
    return (
      <div className="flex h-80 items-center justify-center">
        <p className="text-sm text-muted-foreground">Errore nel caricamento dei dati storici</p>
      </div>
    )
  }

  if (data.data.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center">
        <p className="text-sm text-muted-foreground">Nessun dato disponibile per gli ultimi 30 giorni</p>
      </div>
    )
  }

  return (
    <ChartContainer
      config={{
        electricity: {
          label: "Elettricità (kWh)",
          color: "var(--chart-1)",
        },
        gas: {
          label: "Gas (m³)",
          color: "var(--chart-5)",
        },
      }}
      className="h-80 w-full"
    >
      <AreaChart data={data.data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} className="text-xs" />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} className="text-xs" />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area
          type="monotone"
          dataKey="electricity"
          stackId="1"
          stroke="var(--chart-1)"
          fill="var(--chart-1)"
          fillOpacity={0.6}
          connectNulls
        />
        <Area
          type="monotone"
          dataKey="gas"
          stackId="2"
          stroke="var(--chart-5)"
          fill="var(--chart-5)"
          fillOpacity={0.6}
          connectNulls
        />
      </AreaChart>
    </ChartContainer>
  )
}
