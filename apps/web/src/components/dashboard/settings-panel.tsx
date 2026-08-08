import { useEffect } from "react"
import { useForm, useWatch } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Bell, Clock, Database, Download, HardDrive } from "lucide-react"
import { toast } from "sonner"
import { useSettings, useUpdateSettings } from "@/hooks/use-settings"
import type { SystemConfig } from "@/hooks/use-settings"
import { downloadFromEndpoint } from "@/lib/download"

// ── Form shape ────────────────────────────────────────────────────────────────

type SettingsFormValues = {
  polling: {
    intervalSeconds: number
    autoPollingEnabled: boolean
  }
  notifications: {
    emailEnabled: boolean
  }
  database: {
    dataRetentionDays: number
  }
}

function toFormValues(config: SystemConfig): SettingsFormValues {
  return {
    polling: {
      intervalSeconds: config.polling.intervalSeconds,
      autoPollingEnabled: config.polling.autoPollingEnabled,
    },
    notifications: {
      emailEnabled: config.notifications.emailEnabled,
    },
    database: {
      dataRetentionDays: config.database.dataRetentionDays,
    },
  }
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      {[...Array(4)].map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64 mt-1" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SettingsPanel() {
  const { data: config, isLoading } = useSettings()
  const { mutateAsync: updateSettings, isPending: isSaving } = useUpdateSettings()

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { isDirty },
  } = useForm<SettingsFormValues>({
    defaultValues: {
      polling: { intervalSeconds: 90, autoPollingEnabled: true },
      notifications: { emailEnabled: true },
      database: { dataRetentionDays: 365 },
    },
  })

  // Populate form once data loads
  useEffect(() => {
    if (config) {
      reset(toFormValues(config))
    }
  }, [config, reset])

  // Watched switch values (react-hook-form doesn't intercept Switch onChange natively)
  const autoPollingEnabled = useWatch({ control, name: "polling.autoPollingEnabled" })
  const emailEnabled = useWatch({ control, name: "notifications.emailEnabled" })

  const onSubmit = async (values: SettingsFormValues) => {
    try {
      await updateSettings(values)
      toast.success("Impostazioni salvate con successo")
      reset(values) // clear dirty state
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nel salvataggio")
    }
  }

  const handleExportData = async () => {
    const toastId = toast.loading("Preparazione esportazione dati…")
    try {
      const date = new Date().toISOString().slice(0, 10)
      await downloadFromEndpoint(
        "/api/settings/export",
        `wattguard-readings-${date}.json`,
      )
      toast.success("Esportazione dati completata", { id: toastId })
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Errore durante l'esportazione",
        { id: toastId },
      )
    }
  }

  const handleBackup = async () => {
    const toastId = toast.loading("Backup database in corso…")
    try {
      const date = new Date().toISOString().slice(0, 10)
      const res = await fetch(
        "/api/settings/backup",
        { method: "POST", credentials: "include" },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const msg = (data as Record<string, unknown>).error
        throw new Error(typeof msg === "string" ? msg : "Errore durante il backup")
      }
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = href
      a.download = `wattguard-backup-${date}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(href)
      toast.success("Backup database completato", { id: toastId })
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Errore durante il backup",
        { id: toastId },
      )
    }
  }

  if (isLoading) return <SettingsSkeleton />

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* ── Polling ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            <CardTitle>Sensori</CardTitle>
          </div>
          <CardDescription>
            Configura la frequenza di aggiornamento della dashboard in tempo reale
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="polling.intervalSeconds">Intervallo di polling</Label>
              <p className="text-sm text-muted-foreground">
                Frequenza di aggiornamento automatico della dashboard
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="polling.intervalSeconds"
                type="number"
                className="w-20"
                min={10}
                max={3600}
                {...register("polling.intervalSeconds", {
                  valueAsNumber: true,
                  min: 10,
                  max: 3600,
                })}
              />
              <span className="text-sm text-muted-foreground">secondi</span>
            </div>
          </div>

          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Polling automatico</Label>
              <p className="text-sm text-muted-foreground">
                Abilita l&apos;aggiornamento automatico della dashboard
              </p>
            </div>
            <Switch
              checked={autoPollingEnabled}
              onCheckedChange={(val) =>
                setValue("polling.autoPollingEnabled", val, { shouldDirty: true })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Notifications ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <CardTitle>Notifiche</CardTitle>
          </div>
          <CardDescription>Gestisci le preferenze di notifica</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Notifiche email</Label>
              <p className="text-sm text-muted-foreground">
                Invia email per notifiche critiche
              </p>
            </div>
            <Switch
              checked={emailEnabled}
              onCheckedChange={(val) =>
                setValue("notifications.emailEnabled", val, { shouldDirty: true })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Database ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <CardTitle>Database</CardTitle>
          </div>
          <CardDescription>Gestisci i dati storici e le performance</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Retention dati storici</Label>
              <p className="text-sm text-muted-foreground">
                Periodo di conservazione delle letture dei sensori
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                className="w-20"
                min={1}
                {...register("database.dataRetentionDays", { valueAsNumber: true })}
              />
              <span className="text-sm text-muted-foreground">giorni</span>
            </div>
          </div>

          <Separator />

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleExportData}
            >
              <Download className="mr-2 h-4 w-4" />
              Esporta Dati
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleBackup}
            >
              <HardDrive className="mr-2 h-4 w-4" />
              Backup Database
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Save button ──────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <Button
          type="submit"
          size="lg"
          disabled={!isDirty || isSaving}
        >
          {isSaving ? "Salvataggio…" : "Salva Impostazioni"}
        </Button>
      </div>
    </form>
  )
}
