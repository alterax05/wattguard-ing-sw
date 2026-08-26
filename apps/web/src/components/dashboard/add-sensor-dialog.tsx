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
import { useCreateSensor, type SensorType } from "@/hooks/use-sensors"

const SENSOR_TYPES: SensorType[] = [
  "internal_temp",
  "external_temp",
  "energy_meter",
  "gas_meter",
]

interface AddSensorDialogProps {
  buildingId: string
  buildingName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface CreateSensorPayload {
  buildingId: string
  sensorType: SensorType
  location: string
  serialNumber?: string
  transmissionInterval?: number
  minThreshold?: number
  maxThreshold?: number
}

export function AddSensorDialog({ buildingId, buildingName, open, onOpenChange }: AddSensorDialogProps) {
  const createSensor = useCreateSensor()
  const { t } = useTranslation()

  const [sensorType, setSensorType] = useState<SensorType | "">("")
  const [location, setLocation] = useState("")
  const [serialNumber, setSerialNumber] = useState("")
  const [transmissionInterval, setTransmissionInterval] = useState("90")
  const [minThreshold, setMinThreshold] = useState("")
  const [maxThreshold, setMaxThreshold] = useState("")

  const resetForm = () => {
    setSensorType("")
    setLocation("")
    setSerialNumber("")
    setTransmissionInterval("90")
    setMinThreshold("")
    setMaxThreshold("")
  }

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!sensorType) {
      toast.error(t("sensors.validation.selectType"))
      return
    }
    if (!location.trim()) {
      toast.error(t("sensors.validation.locationRequired"))
      return
    }

    const interval = parseInt(transmissionInterval, 10)
    if (isNaN(interval) || interval < 10 || interval > 3600) {
      toast.error(t("sensors.validation.intervalRange"))
      return
    }

    const payload: CreateSensorPayload = {
      buildingId,
      sensorType,
      location: location.trim(),
    }
    if (serialNumber.trim()) {
      payload.serialNumber = serialNumber.trim()
    }
    payload.transmissionInterval = interval
    if (minThreshold.trim()) {
      payload.minThreshold = parseFloat(minThreshold)
    }
    if (maxThreshold.trim()) {
      payload.maxThreshold = parseFloat(maxThreshold)
    }

    createSensor.mutate(
      payload,
      {
        onSuccess: () => {
          toast.success(t("sensors.created"))
          resetForm()
          onOpenChange(false)
        },
        onError: (error) => {
          toast.error(error.message || t("sensors.createError"))
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
            <DialogTitle>{t("sensors.addTitle")}</DialogTitle>
            <DialogDescription>
              {t("sensors.addDescription", { building: buildingName })}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="sensorType">{t("sensors.typeLabel")} *</Label>
              <Select value={sensorType} onValueChange={(v) => {
                // SAFETY: the Select only offers the four known sensor types.
                setSensorType(v as SensorType)
              }}>
                <SelectTrigger id="sensorType">
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

            <div className="grid gap-2">
              <Label htmlFor="location">{t("sensors.locationLabel")}</Label>
              <Input
                id="location"
                placeholder={t("sensors.locationPlaceholder")}
                value={location}
                onChange={(e) => { setLocation(e.target.value) }}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="serialNumber">{t("sensors.serialNumber")}</Label>
              <Input
                id="serialNumber"
                placeholder={t("sensors.serialNumberPlaceholder")}
                value={serialNumber}
                onChange={(e) => { setSerialNumber(e.target.value) }}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="transmissionInterval">{t("sensors.transmissionInterval")}</Label>
              <Input
                id="transmissionInterval"
                type="number"
                min={10}
                max={3600}
                value={transmissionInterval}
                onChange={(e) => { setTransmissionInterval(e.target.value) }}
              />
              <p className="text-xs text-muted-foreground">{t("sensors.intervalHint")}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="minThreshold">{t("sensors.minThreshold")}</Label>
                <Input
                  id="minThreshold"
                  type="number"
                  step="0.01"
                  placeholder={t("sensors.thresholdPlaceholder")}
                  value={minThreshold}
                  onChange={(e) => { setMinThreshold(e.target.value) }}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="maxThreshold">{t("sensors.maxThreshold")}</Label>
                <Input
                  id="maxThreshold"
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
            <Button type="submit" disabled={createSensor.isPending}>
              {createSensor.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("sensors.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
