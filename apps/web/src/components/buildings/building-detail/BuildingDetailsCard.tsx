import { useTranslation } from "react-i18next"
import { Building2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BuildingStatusBadge } from "../building-status-badge"
import type { BuildingDetail } from "@/hooks/use-buildings"
import { useOptionalBuildingDetailContext } from "./BuildingDetailContext"

export interface BuildingDetailsCardProps {
  building?: BuildingDetail
}

export function BuildingDetailsCard(props: BuildingDetailsCardProps = {}) {
  const { t } = useTranslation()
  const ctx = useOptionalBuildingDetailContext()
  const building = props.building ?? ctx?.state.building

  if (!building) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4" />
          {t("buildings.details")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">
              {t("buildings.constructionYear")}
            </p>
            <p className="mt-1 text-lg font-semibold">
              {building.constructionYear ?? t("common.na")}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">
              {t("buildings.heatingSystem")}
            </p>
            <p className="mt-1 text-sm font-semibold">
              {building.heatingSystemType}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{t("buildings.geographicZone")}</p>
            <p className="mt-1 text-sm font-semibold">
              {building.geographicZone}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{t("common.status")}</p>
            <p className="mt-1"><BuildingStatusBadge status={building.status} className="text-sm" /></p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
