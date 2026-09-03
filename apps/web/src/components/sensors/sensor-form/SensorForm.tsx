import React, { useId } from "react"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DialogFooter } from "@/components/ui/dialog"
import type { SensorStatus, SensorType } from "@/hooks/use-sensors"

export const SENSOR_TYPES: SensorType[] = [
  "internal_temp",
  "external_temp",
  "energy_meter",
  "gas_meter",
]

export const SENSOR_STATUSES: SensorStatus[] = [
  "active",
  "inactive",
  "maintenance",
  "error",
]

export interface SensorFormValues {
  sensorType: SensorType | ""
  location: string
  serialNumber: string
  status?: SensorStatus
  transmissionInterval: string
  minThreshold: string
  maxThreshold: string
}

export interface SensorFormContextValue {
  state: {
    values: SensorFormValues
  }
  actions: {
    setValue: <K extends keyof SensorFormValues>(key: K, value: SensorFormValues[K]) => void
  }
  meta: {
    isPending: boolean
    idPrefix: string
  }
}

const SensorFormContext = React.createContext<SensorFormContextValue | null>(null)

export function useSensorFormContext() {
  const ctx = React.use(SensorFormContext)
  if (!ctx) {
    throw new Error("SensorForm.* subcomponents must be rendered within SensorForm.Root")
  }
  return ctx
}

export interface SensorFormRootProps {
  values: SensorFormValues
  onChange: (updater: (prev: SensorFormValues) => SensorFormValues) => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  isPending: boolean
  idPrefix?: string
  children: React.ReactNode
}

export function SensorFormRoot({
  values,
  onChange,
  onSubmit,
  isPending,
  idPrefix: customIdPrefix,
  children,
}: SensorFormRootProps) {
  const generatedId = useId()
  const idPrefix = customIdPrefix ?? generatedId

  const setValue = <K extends keyof SensorFormValues>(key: K, value: SensorFormValues[K]) => {
    onChange((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <SensorFormContext
      value={{
        state: { values },
        actions: { setValue },
        meta: { isPending, idPrefix },
      }}
    >
      <form onSubmit={onSubmit}>
        <div className="grid gap-4 py-4">{children}</div>
      </form>
    </SensorFormContext>
  )
}

export function SensorFormTypeField({ required = false }: { required?: boolean }) {
  const { t } = useTranslation()
  const { state, actions, meta } = useSensorFormContext()
  const id = `${meta.idPrefix}-sensorType`

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {t("sensors.typeLabel")}
        {required && " *"}
      </Label>
      <Select
        value={state.values.sensorType}
        onValueChange={(v) => {
          // SAFETY: SENSOR_TYPES are typed literals; the Select options mirror them exactly.
          actions.setValue("sensorType", v as SensorType)
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder={t("sensors.selectTypePlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          {SENSOR_TYPES.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`sensors.type.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function SensorFormStatusField() {
  const { t } = useTranslation()
  const { state, actions, meta } = useSensorFormContext()
  const id = `${meta.idPrefix}-status`

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{t("common.status")}</Label>
      <Select
        value={state.values.status ?? "active"}
        onValueChange={(v) => {
          // SAFETY: SENSOR_STATUSES are typed literals; the Select options mirror them exactly.
          actions.setValue("status", v as SensorStatus)
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SENSOR_STATUSES.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`sensors.status.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function SensorFormLocationField() {
  const { t } = useTranslation()
  const { state, actions, meta } = useSensorFormContext()
  const id = `${meta.idPrefix}-location`

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{t("sensors.locationLabel")}</Label>
      <Input
        id={id}
        placeholder={t("sensors.locationPlaceholder")}
        value={state.values.location}
        onChange={(e) => { actions.setValue("location", e.target.value) }}
      />
    </div>
  )
}

export function SensorFormSerialNumberField() {
  const { t } = useTranslation()
  const { state, actions, meta } = useSensorFormContext()
  const id = `${meta.idPrefix}-serialNumber`

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{t("sensors.serialNumber")}</Label>
      <Input
        id={id}
        placeholder={t("sensors.serialNumberPlaceholder")}
        value={state.values.serialNumber}
        onChange={(e) => { actions.setValue("serialNumber", e.target.value) }}
      />
    </div>
  )
}

export function SensorFormIntervalField({ hint = "long" }: { hint?: "long" | "short" }) {
  const { t } = useTranslation()
  const { state, actions, meta } = useSensorFormContext()
  const id = `${meta.idPrefix}-transmissionInterval`

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{t("sensors.transmissionInterval")}</Label>
      <Input
        id={id}
        type="number"
        min={10}
        max={3600}
        value={state.values.transmissionInterval}
        onChange={(e) => { actions.setValue("transmissionInterval", e.target.value) }}
      />
      <p className="text-xs text-muted-foreground">
        {hint === "short" ? t("sensors.intervalHintShort") : t("sensors.intervalHint")}
      </p>
    </div>
  )
}

export function SensorFormThresholdFields() {
  const { t } = useTranslation()
  const { state, actions, meta } = useSensorFormContext()
  const minId = `${meta.idPrefix}-minThreshold`
  const maxId = `${meta.idPrefix}-maxThreshold`

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="grid gap-2">
        <Label htmlFor={minId}>{t("sensors.minThreshold")}</Label>
        <Input
          id={minId}
          type="number"
          step="0.01"
          placeholder={t("sensors.thresholdPlaceholder")}
          value={state.values.minThreshold}
          onChange={(e) => { actions.setValue("minThreshold", e.target.value) }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={maxId}>{t("sensors.maxThreshold")}</Label>
        <Input
          id={maxId}
          type="number"
          step="0.01"
          placeholder={t("sensors.thresholdPlaceholder")}
          value={state.values.maxThreshold}
          onChange={(e) => { actions.setValue("maxThreshold", e.target.value) }}
        />
      </div>
    </div>
  )
}

export function SensorFormActions({
  onCancel,
  submitLabel,
}: {
  onCancel: () => void
  submitLabel: string
}) {
  const { t } = useTranslation()
  const { meta } = useSensorFormContext()

  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel}>
        {t("common.cancel")}
      </Button>
      <Button type="submit" disabled={meta.isPending}>
        {meta.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </DialogFooter>
  )
}

export const SensorForm = {
  Root: SensorFormRoot,
  TypeField: SensorFormTypeField,
  StatusField: SensorFormStatusField,
  LocationField: SensorFormLocationField,
  SerialNumberField: SensorFormSerialNumberField,
  IntervalField: SensorFormIntervalField,
  ThresholdFields: SensorFormThresholdFields,
  Actions: SensorFormActions,
}
