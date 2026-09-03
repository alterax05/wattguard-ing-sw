import { useSearchParams } from "react-router-dom"
import { BuildingsCompare } from "@/components/buildings"
import { MAX_COMPARE_BUILDINGS } from "@/lib/constants"

export function BuildingsComparePage() {
  const [searchParams] = useSearchParams()
  const idsParam = searchParams.get("ids") ?? ""
  const buildingIds = idsParam.split(",").filter(Boolean).slice(0, MAX_COMPARE_BUILDINGS)

  return (
    <div className="space-y-6 p-8">
      <BuildingsCompare buildingIds={buildingIds} />
    </div>
  )
}

export default BuildingsComparePage;
