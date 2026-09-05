import { useState } from "react"
import type {Invite} from "@wattguard/shared"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  UserPlus,
  Shield,
  UserIcon,
  Mail,
  Calendar,
  CalendarCheck,
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle2,
  Ban,
  Hourglass,
} from "lucide-react"
import { AddUserDialog } from "@/components/users/add-user-dialog"
import { useInvites, useRevokeInvite } from "@/hooks/use-invites"
import { format } from "date-fns"
import { getDateFnsLocale } from "@/lib/dates"

function isCreatedByRecord(value: NonNullable<Invite["createdBy"]>): value is { email: string } {
  return value instanceof Object
}

function createdByEmail(createdBy: Invite["createdBy"]): string | null {
  if (createdBy == null) return null
  if (isCreatedByRecord(createdBy)) return createdBy.email
  return createdBy
}

export function InvitesManagement() {
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [inviteToRevoke, setInviteToRevoke] = useState<Invite | null>(null)
  const { data: invites, isLoading, error } = useInvites()
  const revokeInvite = useRevokeInvite()
  const { t } = useTranslation()

  const dateFnsLocale = getDateFnsLocale()

  const getRoleBadge = (role: string) => {
    if (role === "admin") {
      return (
        <Badge className="bg-primary text-primary-foreground">
          <Shield className="mr-1 h-3 w-3" />
          {t("users.role.admin")}
        </Badge>
      )
    }
    return (
      <Badge variant="secondary">
        <UserIcon className="mr-1 h-3 w-3" />
        {t("users.role.operator")}
      </Badge>
    )
  }

  const getStatusBadge = (status: Invite["status"]) => {
    switch (status) {
      case "pending":
        return (
          <Badge>
            <Clock className="mr-1 h-3 w-3" />
            {t("invites.status.pending")}
          </Badge>
        )
      case "accepted":
        return (
          <Badge variant="secondary">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            {t("invites.status.accepted")}
          </Badge>
        )
      case "revoked":
        return (
          <Badge variant="outline" className="text-muted-foreground">
            <Ban className="mr-1 h-3 w-3" />
            {t("invites.status.revoked")}
          </Badge>
        )
      case "expired":
        return (
          <Badge variant="outline" className="text-muted-foreground">
            <Hourglass className="mr-1 h-3 w-3" />
            {t("invites.status.expired")}
          </Badge>
        )
    }
  }

  const handleAddDialogClose = () => {
    setShowAddDialog(false)
  }

  const handleRevokeConfirm = () => {
    if (!inviteToRevoke) return
    revokeInvite.mutate(inviteToRevoke._id, {
      onSuccess: () => {
        setInviteToRevoke(null)
      },
      onError: () => {
        setInviteToRevoke(null)
      },
    })
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("invites.title")}</CardTitle>
            <Button onClick={() => { setShowAddDialog(true) }}>
              <UserPlus className="mr-2 h-4 w-4" />
              {t("invites.invite")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {t("invites.loading")}
            </div>
          )}

          {error && (
            <Empty className="border-0 py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon" className="text-destructive">
                  <AlertCircle className="h-6 w-6" />
                </EmptyMedia>
                <EmptyDescription className="text-destructive">
                  {t("invites.loadError", { message: error.message })}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {!isLoading && !error && invites?.length === 0 && (
            <Empty className="border-0 py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon" className="text-muted-foreground">
                  <Mail className="h-6 w-6" />
                </EmptyMedia>
                <EmptyDescription>{t("invites.empty")}</EmptyDescription>
                <EmptyDescription className="text-xs">{t("invites.emptyHint")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {!isLoading && !error && invites && invites.length > 0 && (
            <div className="space-y-3">
              {invites.map((invite) => {
                const inviter = createdByEmail(invite.createdBy)
                return (
                  <Card key={invite._id} className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground">
                            {invite.email.charAt(0).toUpperCase()}
                          </div>
                          <div className="space-y-2">
                            <div>
                              <h3 className="font-semibold leading-none">{invite.email}</h3>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                {getRoleBadge(invite.role)}
                                {getStatusBadge(invite.status)}
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                {invite.status === "accepted" && invite.acceptedAt ? (
                                  <div className="flex items-center gap-1">
                                    <CalendarCheck className="h-3 w-3" />
                                    {t("invites.acceptedOn", {
                                      date: format(new Date(invite.acceptedAt), "d MMM yyyy", {
                                        locale: dateFnsLocale,
                                      }),
                                    })}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {t("invites.expiresOn", {
                                      date: format(new Date(invite.expiresAt), "d MMM yyyy", {
                                        locale: dateFnsLocale,
                                      }),
                                    })}
                                  </div>
                                )}
                                {inviter && (
                                  <div className="flex items-center gap-1">
                                    <Mail className="h-3 w-3" />
                                    {t("invites.createdBy", { email: inviter })}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {invite.status === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive hover:text-destructive"
                              onClick={() => { setInviteToRevoke(invite) }}
                              disabled={revokeInvite.isPending}
                            >
                              <Ban className="mr-2 h-4 w-4" />
                              {t("invites.revoke")}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {showAddDialog && <AddUserDialog onClose={handleAddDialogClose} />}

      <AlertDialog open={!!inviteToRevoke} onOpenChange={(open) => { if (!open) setInviteToRevoke(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("invites.revokeConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("invites.revokeConfirmDescription", { email: inviteToRevoke?.email })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeInvite.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleRevokeConfirm}
              disabled={revokeInvite.isPending}
            >
              {revokeInvite.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("invites.revoking")}
                </>
              ) : (
                t("invites.revoke")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
