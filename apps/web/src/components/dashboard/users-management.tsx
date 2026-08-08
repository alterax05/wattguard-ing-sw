import { useState, useContext } from "react"
import { useUsers, useUpdateUserRole, useDeleteUser } from "@/hooks/use-auth"
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
} from "lucide-react"
import { AddUserDialog } from "./add-user-dialog"
import { format } from "date-fns"
import { it } from "date-fns/locale"
import { toast } from "sonner"
import type { AdminUser } from "@/hooks/use-auth"

export function UsersManagement() {
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null)
  const { data: users, isLoading, error } = useUsers()
  const updateRole = useUpdateUserRole()
  const deleteUser = useDeleteUser()
  const { user: currentUser } = useContext(AuthContext)

  const getRoleBadge = (role: string) => {
    if (role === "admin") {
      return (
        <Badge className="bg-primary text-primary-foreground">
          <Shield className="mr-1 h-3 w-3" />
          Amministratore
        </Badge>
      )
    }
    return (
      <Badge variant="secondary">
        <UserIcon className="mr-1 h-3 w-3" />
        Operatore
      </Badge>
    )
  }

  const handleRoleChange = (user: AdminUser) => {
    const newRole = user.role === "admin" ? "operator" : "admin"
    const roleLabel = newRole === "admin" ? "Amministratore" : "Operatore"

    updateRole.mutate(
      { id: user.id, role: newRole },
      {
        onSuccess: () => {
          toast.success(`Ruolo di ${user.name ?? user.email} aggiornato a ${roleLabel}`)
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
        toast.success(`Utente ${userToDelete.name ?? userToDelete.email} eliminato`)
        setUserToDelete(null)
      },
      onError: (err) => {
        toast.error(err.message)
        setUserToDelete(null)
      },
    })
  }

  const isSelf = (userId: string) => currentUser?.id === userId

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Utenti del Sistema</CardTitle>
            <Button onClick={() => setShowAddDialog(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Aggiungi Utente
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Caricamento utenti...
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center gap-2 py-8 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span>Errore nel caricamento degli utenti: {error.message}</span>
            </div>
          )}

          {!isLoading && !error && users?.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">
              Nessun utente trovato.
            </div>
          )}

          {!isLoading && !error && users && users.length > 0 && (
            <div className="space-y-3">
              {users.map((user) => (
                <Card key={user.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
                          {(user.name ?? user.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="space-y-2">
                          <div>
                            <h3 className="font-semibold leading-none">{user.name ?? user.email}</h3>
                            <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {user.email}
                              </div>
                              {user.createdAt && (
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Registrato {format(new Date(user.createdAt), "d MMM yyyy", { locale: it })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getRoleBadge(user.role)}
                        {!isSelf(user.id) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                                <span className="sr-only">Azioni utente</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleRoleChange(user)}
                                disabled={updateRole.isPending}
                              >
                                <ArrowRightLeft className="mr-2 h-4 w-4" />
                                {user.role === "admin" ? "Rendi Operatore" : "Rendi Amministratore"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setUserToDelete(user)}
                                disabled={deleteUser.isPending}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Elimina Utente
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
            <AlertDialogTitle>Conferma Eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare l&apos;utente{" "}
              <strong>{userToDelete?.name ?? userToDelete?.email}</strong>? Questa azione non
              può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteUser.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteUser.isPending}
            >
              {deleteUser.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Eliminazione...
                </>
              ) : (
                "Elimina"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
