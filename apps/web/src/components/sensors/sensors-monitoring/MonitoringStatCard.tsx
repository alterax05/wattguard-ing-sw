import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"

export function MonitoringStatCard({
  icon,
  label,
  value,
  description,
  className,
}: {
  icon: ReactNode
  label: string
  value: number | string
  description: string
  className?: string
}) {
  return (
    <Card className={cn("gap-3 py-4", className)}>
      <CardContent className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  )
}
