import { useTranslation } from "react-i18next"
import { UsersManagement } from "@/components/dashboard/users-management"

export function UsersPage() {
  const { t } = useTranslation()

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("users.pageTitle")}</h1>
        <p className="text-muted-foreground">{t("users.pageSubtitle")}</p>
      </div>
      <UsersManagement />
    </div>
  )
}

export default UsersPage;
