import { useTranslation } from "react-i18next"
import { UsersManagement } from "@/components/users"
import { InvitesManagement } from "@/components/invites"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { useInvites } from "@/hooks/use-invites"

export function UsersPage() {
  const { t } = useTranslation()
  const { data: invites } = useInvites()

  const pendingCount = invites?.filter((invite) => invite.status === "pending").length ?? 0

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("users.pageTitle")}</h1>
        <p className="text-muted-foreground">{t("users.pageSubtitle")}</p>
      </div>
      <Tabs defaultValue="users" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="users">{t("invites.tabs.users")}</TabsTrigger>
          <TabsTrigger value="invites">
            {t("invites.tabs.invites")}
            {pendingCount > 0 && (
              <Badge variant="default" className="ml-2">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-6">
          <UsersManagement />
        </TabsContent>
        <TabsContent value="invites" className="mt-6">
          <InvitesManagement />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default UsersPage
