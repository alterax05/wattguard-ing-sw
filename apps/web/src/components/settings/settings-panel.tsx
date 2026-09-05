import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { errorMessageFromResponse } from "@/lib/errors"
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
      {Array.from({ length: 4 }).map((_, i) => (
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
  const { t } = useTranslation()

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
      toast.success(t("settings.saved"))
      reset(values) // clear dirty state
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.saveError"))
    }
  }

  const handleExportData = async () => {
    const toastId = toast.loading(t("settings.exportingData"))
    try {
      const date = new Date().toISOString().slice(0, 10)
      await downloadFromEndpoint(
        "/api/v1/readings",
        `wattguard-readings-${date}.json`,
      )
      toast.success(t("settings.dataExported"), { id: toastId })
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("settings.exportError"),
        { id: toastId },
      )
    }
  }

  const handleBackup = async () => {
    const toastId = toast.loading(t("settings.backingUp"))
    try {
      const date = new Date().toISOString().slice(0, 10)
      const res = await fetch(
        "/api/v1/backups",
        { method: "POST", credentials: "include" },
      )
      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res, "settings.backupError"))
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
      toast.success(t("settings.backupComplete"), { id: toastId })
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("settings.backupError"),
        { id: toastId },
      )
    }
  }

  if (isLoading) return <SettingsSkeleton />

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit((values) => { void onSubmit(values) })(e)
      }}
      className="space-y-6"
    >
      {/* ── Polling ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            <CardTitle>{t("settings.sensorsTitle")}</CardTitle>
          </div>
          <CardDescription>
            {t("settings.sensorsDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="polling.intervalSeconds">{t("settings.pollingInterval")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.pollingIntervalHint")}
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
              <span className="text-sm text-muted-foreground">{t("settings.seconds")}</span>
            </div>
          </div>

          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>{t("settings.autoPolling")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.autoPollingHint")}
              </p>
            </div>
            <Switch
              checked={autoPollingEnabled}
              onCheckedChange={(val) => {
                setValue("polling.autoPollingEnabled", val, { shouldDirty: true })
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Notifications ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <CardTitle>{t("settings.notificationsTitle")}</CardTitle>
          </div>
          <CardDescription>{t("settings.notificationsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>{t("settings.emailNotifications")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.emailNotificationsHint")}
              </p>
            </div>
            <Switch
              checked={emailEnabled}
              onCheckedChange={(val) => {
                setValue("notifications.emailEnabled", val, { shouldDirty: true })
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Database ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <CardTitle>{t("settings.databaseTitle")}</CardTitle>
          </div>
          <CardDescription>{t("settings.databaseDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>{t("settings.dataRetention")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.dataRetentionHint")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                className="w-20"
                min={1}
                {...register("database.dataRetentionDays", { valueAsNumber: true })}
              />
              <span className="text-sm text-muted-foreground">{t("settings.days")}</span>
            </div>
          </div>

          <Separator />

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => { void handleExportData() }}
            >
              <Download className="mr-2 h-4 w-4" />
              {t("settings.exportData")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => { void handleBackup() }}
            >
              <HardDrive className="mr-2 h-4 w-4" />
              {t("settings.backupDatabase")}
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
          {isSaving ? t("common.saving") : t("settings.save")}
        </Button>
      </div>
    </form>
  )
}
