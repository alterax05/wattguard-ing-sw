import { useTranslation } from "react-i18next"
import { BuildingsMap } from "@/components/dashboard/buildings-map"

export function MapPage() {
  const { t } = useTranslation()

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-card p-6">
        <h1 className="text-2xl font-bold">{t("map.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("map.subtitle")}
        </p>
      </div>
      <div className="flex-1">
        <BuildingsMap />
      </div>
    </div>
  )
}

export default MapPage;
