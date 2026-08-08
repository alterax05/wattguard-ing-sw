import { useSearchParams } from "react-router-dom"
import { BuildingsCompare } from "@/components/dashboard/buildings-compare"

export function BuildingsComparePage() {
  const [searchParams] = useSearchParams()
  const idsParam = searchParams.get("ids") ?? ""
  const buildingIds = idsParam.split(",").filter(Boolean)

  return (
    <div className="space-y-6 p-8">
      <BuildingsCompare buildingIds={buildingIds} />
    </div>
  )
}
