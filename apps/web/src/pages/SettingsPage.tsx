import { useTranslation } from "react-i18next"
import { SettingsPanel } from "@/components/settings"

export function SettingsPage() {
  const { t } = useTranslation()

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("settings.title")}</h1>
        <p className="text-muted-foreground">{t("settings.subtitle")}</p>
      </div>
      <SettingsPanel />
    </div>
  )
}

export default SettingsPage;
