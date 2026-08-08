import type React from "react"

import { useState } from "react"
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
  const [formData, setFormData] = useState({
    email: "",
    role: "operator" as "admin" | "operator",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    createInvite.mutate(
      { email: formData.email, role: formData.role },
      {
        onSuccess: () => {
          toast.success("Invito inviato con successo", {
            description: `Un'email di invito è stata inviata a ${formData.email}`,
          })
          onClose()
        },
        onError: (err) => {
          toast.error("Errore nell'invio dell'invito", {
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
          <DialogTitle>Invita Nuovo Utente</DialogTitle>
          <DialogDescription>
            Inserisci l'email e il ruolo del nuovo utente. Riceverà un'email con il link per completare la registrazione.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="utente@esempio.com"
                className="pl-9"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                disabled={createInvite.isPending}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Ruolo</Label>
            <Select
              value={formData.role}
              onValueChange={(value: "admin" | "operator") => setFormData({ ...formData, role: value })}
              disabled={createInvite.isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="operator">Operatore Tecnico</SelectItem>
                <SelectItem value="admin">Amministratore</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={createInvite.isPending}>
              Annulla
            </Button>
            <Button type="submit" disabled={createInvite.isPending}>
              {createInvite.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Invio in corso...
                </>
              ) : (
                "Invia Invito"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
