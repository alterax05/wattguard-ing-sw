import { useTranslation } from "react-i18next"
import { AlertsManagement } from "@/components/alerts"

export function AlertsPage() {
  const { t } = useTranslation()

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("alerts.pageTitle")}</h1>
        <p className="text-muted-foreground">{t("alerts.pageSubtitle")}</p>
      </div>
      <AlertsManagement />
    </div>
  )
}

export default AlertsPage;
