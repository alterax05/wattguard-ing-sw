import { useParams } from "react-router-dom"
import { BuildingDetail } from "@/components/buildings"

export function BuildingDetailPage() {
  const { id } = useParams<{ id: string }>()

  if (!id) return null

  return (
    <div className="space-y-6 p-8">
      <BuildingDetail buildingId={id} />
    </div>
  )
}

export default BuildingDetailPage;
