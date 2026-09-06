import { useState } from "react"
import type {CreateSensorRequest} from "@wattguard/shared"
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
import { useCreateSensor } from "@/hooks/use-sensors"
import { SensorForm, type SensorFormValues } from "./sensor-form/SensorForm"

interface AddSensorDialogProps {
  buildingId: string
  buildingName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const INITIAL_VALUES: SensorFormValues = {
  sensorType: "",
  location: "",
  serialNumber: "",
  transmissionInterval: "90",
  minThreshold: "",
  maxThreshold: "",
}

export function AddSensorDialog({
  buildingId,
  buildingName,
  open,
  onOpenChange,
}: AddSensorDialogProps) {
  const createSensor = useCreateSensor()
  const { t } = useTranslation()
  const [values, setValues] = useState<SensorFormValues>(INITIAL_VALUES)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!values.sensorType) {
      toast.error(t("sensors.validation.selectType"))
      return
    }
    if (!values.location.trim()) {
      toast.error(t("sensors.validation.locationRequired"))
      return
    }

    const interval = parseInt(values.transmissionInterval, 10)
    if (isNaN(interval) || interval < 10 || interval > 3600) {
      toast.error(t("sensors.validation.intervalRange"))
      return
    }

    const payload: CreateSensorRequest = {
      building: buildingId,
      sensorType: values.sensorType,
      location: values.location.trim(),
    }
    if (values.serialNumber.trim()) {
      payload.serialNumber = values.serialNumber.trim()
    }
    payload.transmissionInterval = interval
    if (values.minThreshold.trim()) {
      payload.minThreshold = parseFloat(values.minThreshold)
    }
    if (values.maxThreshold.trim()) {
      payload.maxThreshold = parseFloat(values.maxThreshold)
    }

    createSensor.mutate(payload, {
      onSuccess: () => {
        toast.success(t("sensors.created"))
        setValues(INITIAL_VALUES)
        onOpenChange(false)
      },
      onError: (error) => {
        toast.error(error.message || t("sensors.createError"))
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogCloseButton />
        <DialogHeader>
          <DialogTitle>{t("sensors.addTitle")}</DialogTitle>
          <DialogDescription>
            {t("sensors.addDescription", { building: buildingName })}
          </DialogDescription>
        </DialogHeader>

        <SensorForm.Root
          values={values}
          onChange={setValues}
          onSubmit={handleSubmit}
          isPending={createSensor.isPending}
          idPrefix="add-sensor"
        >
          <SensorForm.TypeField required />
          <SensorForm.LocationField />
          <SensorForm.SerialNumberField />
          <SensorForm.IntervalField hint="long" />
          <SensorForm.ThresholdFields />
          <SensorForm.Actions
            onCancel={() => { onOpenChange(false) }}
            submitLabel={t("sensors.create")}
          />
        </SensorForm.Root>
      </DialogContent>
    </Dialog>
  )
}
