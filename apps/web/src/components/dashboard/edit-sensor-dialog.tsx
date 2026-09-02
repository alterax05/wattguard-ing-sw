import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  useUpdateSensor,
  type SensorWithBuilding,
  type SensorType,
  type SensorStatus,
  type UpdateSensorRequest,
} from "@/hooks/use-sensors"

const SENSOR_TYPES: SensorType[] = [
  "internal_temp",
  "external_temp",
  "energy_meter",
  "gas_meter",
]

const SENSOR_STATUSES: SensorStatus[] = [
  "active",
  "inactive",
  "maintenance",
  "error",
]

interface EditSensorDialogProps {
  sensor: SensorWithBuilding
  open: boolean
  onOpenChange: (open: boolean) => void
}

type UpdateSensorPayload = UpdateSensorRequest & {
  id: string
}

export function EditSensorDialog({ sensor, open, onOpenChange }: EditSensorDialogProps) {
  const updateSensor = useUpdateSensor()
  const { t } = useTranslation()

  const [sensorType, setSensorType] = useState<SensorType>(sensor.sensorType)
  const [location, setLocation] = useState(sensor.location)
  const [serialNumber, setSerialNumber] = useState(sensor.serialNumber ?? "")
  const [status, setStatus] = useState<SensorStatus>(sensor.status)
  const [transmissionInterval, setTransmissionInterval] = useState(
    String(sensor.transmissionInterval)
  )
  const [minThreshold, setMinThreshold] = useState(sensor.minThreshold !== undefined ? String(sensor.minThreshold) : "")
  const [maxThreshold, setMaxThreshold] = useState(sensor.maxThreshold !== undefined ? String(sensor.maxThreshold) : "")

  const handleSubmit = (e: React.SubmitEvent) => {
    e.preventDefault()

    if (!location.trim()) {
      toast.error(t("sensors.validation.locationRequired"))
      return
    }

    const interval = parseInt(transmissionInterval, 10)
    if (isNaN(interval) || interval < 10 || interval > 3600) {
      toast.error(t("sensors.validation.intervalRange"))
      return
    }

    const payload: UpdateSensorPayload = {
      id: sensor.id,
      sensorType,
      location: location.trim(),
      status,
      transmissionInterval: interval,
    }
    if (serialNumber.trim()) {
      payload.serialNumber = serialNumber.trim()
    }
    payload.minThreshold = minThreshold.trim() ? parseFloat(minThreshold) : null
    payload.maxThreshold = maxThreshold.trim() ? parseFloat(maxThreshold) : null

    updateSensor.mutate(
      payload,
      {
        onSuccess: () => {
          toast.success(t("sensors.updated"))
          onOpenChange(false)
        },
        onError: (error) => {
          toast.error(error.message || t("sensors.updateError"))
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogCloseButton />
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("sensors.editTitle")}</DialogTitle>
            <DialogDescription>
              {t("sensors.editDescription", { location: sensor.location })}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-sensorType">{t("sensors.typeLabel")}</Label>
              <Select value={sensorType} onValueChange={(v) => {
                // SAFETY: the Select only offers the four known sensor types.
                setSensorType(v as SensorType)
              }}>
                <SelectTrigger id="edit-sensorType">
                  <SelectValue />
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

            <div className="grid gap-2">
              <Label htmlFor="edit-location">{t("sensors.locationLabel")}</Label>
              <Input
                id="edit-location"
                placeholder={t("sensors.locationPlaceholder")}
                value={location}
                onChange={(e) => { setLocation(e.target.value) }}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-serialNumber">{t("sensors.serialNumber")}</Label>
              <Input
                id="edit-serialNumber"
                placeholder={t("sensors.serialNumberPlaceholder")}
                value={serialNumber}
                onChange={(e) => { setSerialNumber(e.target.value) }}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-status">{t("common.status")}</Label>
              <Select value={status} onValueChange={(v) => {
                // SAFETY: the Select only offers the four known sensor statuses.
                setStatus(v as SensorStatus)
              }}>
                <SelectTrigger id="edit-status">
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

            <div className="grid gap-2">
              <Label htmlFor="edit-transmissionInterval">{t("sensors.transmissionInterval")}</Label>
              <Input
                id="edit-transmissionInterval"
                type="number"
                min={10}
                max={3600}
                value={transmissionInterval}
                onChange={(e) => { setTransmissionInterval(e.target.value) }}
              />
              <p className="text-xs text-muted-foreground">{t("sensors.intervalHintShort")}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-minThreshold">{t("sensors.minThreshold")}</Label>
                <Input
                  id="edit-minThreshold"
                  type="number"
                  step="0.01"
                  placeholder={t("sensors.thresholdPlaceholder")}
                  value={minThreshold}
                  onChange={(e) => { setMinThreshold(e.target.value) }}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-maxThreshold">{t("sensors.maxThreshold")}</Label>
                <Input
                  id="edit-maxThreshold"
                  type="number"
                  step="0.01"
                  placeholder={t("sensors.thresholdPlaceholder")}
                  value={maxThreshold}
                  onChange={(e) => { setMaxThreshold(e.target.value) }}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { onOpenChange(false) }}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={updateSensor.isPending}>
              {updateSensor.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("sensors.saveChanges")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
