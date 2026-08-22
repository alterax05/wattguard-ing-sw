import type React from "react"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { useCreateInvite } from "@/hooks/use-auth"
import { Mail, Loader2 } from "lucide-react"

interface AddUserDialogProps {
  onClose: () => void
}

export function AddUserDialog({ onClose }: AddUserDialogProps) {
  const createInvite = useCreateInvite()
  const { t } = useTranslation()
  const [formData, setFormData] = useState<{
    email: string
    role: "admin" | "operator"
  }>({
    email: "",
    role: "operator",
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    createInvite.mutate(
      { email: formData.email, role: formData.role },
      {
        onSuccess: () => {
          toast.success(t("users.inviteSent"), {
            description: t("users.inviteSentDescription", { email: formData.email }),
          })
          onClose()
        },
        onError: (err) => {
          toast.error(t("users.inviteError"), {
            description: err.message,
          })
        },
      }
    )
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("users.inviteTitle")}</DialogTitle>
          <DialogDescription>
            {t("users.inviteDescription")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder={t("users.emailPlaceholder")}
                className="pl-9"
                value={formData.email}
                onChange={(e) => { setFormData({ ...formData, email: e.target.value }) }}
                disabled={createInvite.isPending}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">{t("users.roleLabel")}</Label>
            <Select
              value={formData.role}
              onValueChange={(value: "admin" | "operator") => { setFormData({ ...formData, role: value }) }}
              disabled={createInvite.isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="operator">{t("users.role.operator")}</SelectItem>
                <SelectItem value="admin">{t("users.role.admin")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={createInvite.isPending}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={createInvite.isPending}>
              {createInvite.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("users.inviting")}
                </>
              ) : (
                t("users.sendInvite")
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
