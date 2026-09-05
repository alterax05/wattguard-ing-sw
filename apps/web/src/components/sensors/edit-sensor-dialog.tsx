import { useState } from "react"
import type {Sensor, UpdateSensorRequest, WithId} from "@wattguard/shared"
import { useTranslation } from "react-i18next"
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import {
  useUpdateSensor,
} from "@/hooks/use-sensors"
import { SensorForm, type SensorFormValues } from "./sensor-form/SensorForm"

interface EditSensorDialogProps {
  sensor: Sensor
  open: boolean
  onOpenChange: (open: boolean) => void
}

type UpdateSensorPayload = WithId<UpdateSensorRequest>

export function EditSensorDialog({ sensor, open, onOpenChange }: EditSensorDialogProps) {
  const updateSensor = useUpdateSensor()
  const { t } = useTranslation()

  const [values, setValues] = useState<SensorFormValues>({
    sensorType: sensor.sensorType,
    location: sensor.location,
    serialNumber: sensor.serialNumber ?? "",
    status: sensor.status,
    transmissionInterval: String(sensor.transmissionInterval),
    minThreshold: sensor.minThreshold !== undefined ? String(sensor.minThreshold) : "",
    maxThreshold: sensor.maxThreshold !== undefined ? String(sensor.maxThreshold) : "",
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!values.location.trim()) {
      toast.error(t("sensors.validation.locationRequired"))
      return
    }

    const interval = parseInt(values.transmissionInterval, 10)
    if (isNaN(interval) || interval < 10 || interval > 3600) {
      toast.error(t("sensors.validation.intervalRange"))
      return
    }

    const payload: UpdateSensorPayload = {
      id: sensor._id,
      sensorType: values.sensorType || sensor.sensorType,
      location: values.location.trim(),
      status: values.status ?? sensor.status,
      transmissionInterval: interval,
    }
    if (values.serialNumber.trim()) {
      payload.serialNumber = values.serialNumber.trim()
    }
    payload.minThreshold = values.minThreshold.trim() ? parseFloat(values.minThreshold) : null
    payload.maxThreshold = values.maxThreshold.trim() ? parseFloat(values.maxThreshold) : null

    updateSensor.mutate(payload, {
      onSuccess: () => {
        toast.success(t("sensors.updated"))
        onOpenChange(false)
      },
      onError: (error) => {
        toast.error(error.message || t("sensors.updateError"))
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogCloseButton />
        <DialogHeader>
          <DialogTitle>{t("sensors.editTitle")}</DialogTitle>
          <DialogDescription>
            {t("sensors.editDescription", { location: sensor.location })}
          </DialogDescription>
        </DialogHeader>

        <SensorForm.Root
          values={values}
          onChange={setValues}
          onSubmit={handleSubmit}
          isPending={updateSensor.isPending}
          idPrefix="edit-sensor"
        >
          <SensorForm.TypeField />
          <SensorForm.LocationField />
          <SensorForm.SerialNumberField />
          <SensorForm.StatusField />
          <SensorForm.IntervalField hint="short" />
          <SensorForm.ThresholdFields />
          <SensorForm.Actions
            onCancel={() => { onOpenChange(false) }}
            submitLabel={t("sensors.saveChanges")}
          />
        </SensorForm.Root>
      </DialogContent>
    </Dialog>
  )
}
