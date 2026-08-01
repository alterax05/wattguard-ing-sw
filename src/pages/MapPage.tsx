import { BuildingsMap } from "@/components/dashboard/buildings-map"

export function MapPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-card p-6">
        <h1 className="text-2xl font-bold">Mappa Edifici Pubblici</h1>
        <p className="text-sm text-muted-foreground">
          Visualizza la posizione e lo stato degli edifici monitorati a Trento
        </p>
      </div>
      <div className="flex-1">
        <BuildingsMap />
      </div>
    </div>
  )
}
