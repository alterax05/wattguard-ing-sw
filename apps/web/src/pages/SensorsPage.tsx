import { useTranslation } from "react-i18next"
import { SensorsMonitoring } from "@/components/dashboard/sensors-monitoring"

export function SensorsPage() {
  const { t } = useTranslation()

  return (
    <div className="space-y-6 p-4 sm:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("sensors.pageTitle")}</h1>
        <p className="text-muted-foreground">
          {t("sensors.pageSubtitle")}
        </p>
      </div>
      <SensorsMonitoring />
    </div>
  )
}

export default SensorsPage;
