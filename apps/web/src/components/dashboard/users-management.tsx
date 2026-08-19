import { useState, useContext } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { useUsers, useUpdateUser, useDeleteUser } from "@/hooks/use-auth"
import { AuthContext } from "@/lib/auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  Loader2,
  AlertCircle,
  MoreVertical,
  ArrowRightLeft,
  Trash2,
  UserX,
  UserCheck,
  Ban,
} from "lucide-react"
import { AddUserDialog } from "./add-user-dialog"
import { format } from "date-fns"
import { getDateFnsLocale } from "@/lib/dates"
import { toast } from "sonner"
import type { AdminUser } from "@/hooks/use-auth"

export function UsersManagement() {
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null)
  const [userToToggle, setUserToToggle] = useState<AdminUser | null>(null)
  const { data: users, isLoading, error } = useUsers()
  const updateUser = useUpdateUser()
  const deleteUser = useDeleteUser()
  const { user: currentUser } = useContext(AuthContext)
  const { t } = useTranslation()

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

  const handleRoleChange = (user: AdminUser) => {
    const newRole = user.role === "admin" ? "operator" : "admin"
    const roleLabel = newRole === "admin" ? t("users.role.admin") : t("users.role.operator")

    updateUser.mutate(
      { id: user.id, role: newRole },
      {
        onSuccess: () => {
          toast.success(t("users.roleUpdated", { name: user.name ?? user.email, role: roleLabel }))
        },
        onError: (err) => {
          toast.error(err.message)
        },
      }
    )
  }

  const handleDeleteConfirm = () => {
    if (!userToDelete) return

    deleteUser.mutate(userToDelete.id, {
      onSuccess: () => {
        toast.success(t("users.deleted", { name: userToDelete.name ?? userToDelete.email }))
        setUserToDelete(null)
      },
      onError: (err) => {
        toast.error(err.message)
        setUserToDelete(null)
      },
    })
  }

  const handleStatusChange = () => {
    if (!userToToggle) return

    const nextDisabled = !userToToggle.isDisabled
    const actionLabel = nextDisabled ? t("users.disabled") : t("users.reenabled")

    updateUser.mutate(
      { id: userToToggle.id, isDisabled: nextDisabled },
      {
        onSuccess: () => {
          toast.success(t("users.statusChanged", { name: userToToggle.name ?? userToToggle.email, status: actionLabel }))
          setUserToToggle(null)
        },
        onError: (err) => {
          toast.error(err.message)
          setUserToToggle(null)
        },
      }
    )
  }

  const isSelf = (userId: string) => currentUser?.id === userId
  const dateFnsLocale = getDateFnsLocale()

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("users.title")}</CardTitle>
            <Button onClick={() => setShowAddDialog(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              {t("users.add")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {t("users.loading")}
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center gap-2 py-8 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span>{t("users.loadError", { message: error.message })}</span>
            </div>
          )}

          {!isLoading && !error && users?.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">
              {t("users.notFound")}
            </div>
          )}

          {!isLoading && !error && users && users.length > 0 && (
            <div className="space-y-3">
              {users.map((user) => (
                <Card key={user.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div
                          className={cn(
                            "flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground",
                            user.isDisabled && "bg-muted text-muted-foreground"
                          )}
                        >
                          {(user.name ?? user.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="space-y-2">
                          <div>
                            <h3 className={cn("font-semibold leading-none", user.isDisabled && "text-muted-foreground")}>
                              {user.name ?? user.email}
                            </h3>
                            <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {user.email}
                              </div>
                              {user.createdAt && (
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {t("users.registeredOn", {
                                    date: format(new Date(user.createdAt), "d MMM yyyy", { locale: dateFnsLocale }),
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getRoleBadge(user.role)}
                        {user.isDisabled && (
                          <Badge variant="outline" className="text-muted-foreground">
                            <Ban className="mr-1 h-3 w-3" />
                            {t("users.disabledBadge")}
                          </Badge>
                        )}
                        {!isSelf(user.id) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                                <span className="sr-only">{t("users.actions")}</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleRoleChange(user)}
                                disabled={updateUser.isPending}
                              >
                                <ArrowRightLeft className="mr-2 h-4 w-4" />
                                {user.role === "admin" ? t("users.makeOperator") : t("users.makeAdmin")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setUserToToggle(user)}
                                disabled={updateUser.isPending}
                              >
                                {user.isDisabled ? (
                                  <>
                                    <UserCheck className="mr-2 h-4 w-4" />
                                    {t("users.enableUser")}
                                  </>
                                ) : (
                                  <>
                                    <UserX className="mr-2 h-4 w-4" />
                                    {t("users.disableUser")}
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setUserToDelete(user)}
                                disabled={deleteUser.isPending}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t("users.deleteUser")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showAddDialog && <AddUserDialog onClose={() => setShowAddDialog(false)} />}

      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("users.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("users.deleteConfirmDescription", { name: userToDelete?.name ?? userToDelete?.email })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteUser.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteUser.isPending}
            >
              {deleteUser.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("common.deleting")}
                </>
              ) : (
                t("common.delete")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!userToToggle} onOpenChange={(open) => !open && setUserToToggle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {userToToggle?.isDisabled ? t("users.enableConfirmTitle") : t("users.disableConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {userToToggle?.isDisabled
                ? t("users.enableConfirmDescription", { name: userToToggle?.name ?? userToToggle?.email })
                : t("users.disableConfirmDescription", { name: userToToggle?.name ?? userToToggle?.email })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateUser.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant={userToToggle?.isDisabled ? undefined : "destructive"}
              onClick={handleStatusChange}
              disabled={updateUser.isPending}
            >
              {updateUser.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("common.saving")}
                </>
              ) : userToToggle?.isDisabled ? (
                t("users.enable")
              ) : (
                t("users.disable")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
