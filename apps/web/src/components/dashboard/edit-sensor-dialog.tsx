import { useState } from "react"
import {
  Dialog,
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
  type SensorType,
  type SensorStatus,
  type SensorWithBuilding,
} from "@/hooks/use-sensors"

const SENSOR_TYPE_OPTIONS: { value: SensorType; label: string }[] = [
  { value: "internal_temp", label: "Temperatura Interna" },
  { value: "external_temp", label: "Temperatura Esterna" },
  { value: "energy_meter", label: "Contatore Energia" },
  { value: "gas_meter", label: "Contatore Gas" },
]

const SENSOR_STATUS_OPTIONS: { value: SensorStatus; label: string }[] = [
  { value: "active", label: "Attivo" },
  { value: "inactive", label: "Inattivo" },
  { value: "maintenance", label: "Manutenzione" },
  { value: "error", label: "Errore" },
]

interface EditSensorDialogProps {
  sensor: SensorWithBuilding
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditSensorDialog({ sensor, open, onOpenChange }: EditSensorDialogProps) {
  const updateSensor = useUpdateSensor()

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
      toast.error("Inserisci la posizione del sensore")
      return
    }

    const interval = parseInt(transmissionInterval, 10)
    if (isNaN(interval) || interval < 10 || interval > 3600) {
      toast.error("L'intervallo di trasmissione deve essere tra 10 e 3600 secondi")
      return
    }

    updateSensor.mutate(
      {
        id: sensor.id,
        sensorType,
        location: location.trim(),
        ...(serialNumber.trim() ? { serialNumber: serialNumber.trim() } : {}),
        status,
        transmissionInterval: interval,
        ...(minThreshold.trim() ? { minThreshold: parseFloat(minThreshold) } : { minThreshold: null }),
        ...(maxThreshold.trim() ? { maxThreshold: parseFloat(maxThreshold) } : { maxThreshold: null }),
      },
      {
        onSuccess: () => {
          toast.success("Sensore aggiornato con successo")
          onOpenChange(false)
        },
        onError: (error) => {
          toast.error(error.message || "Errore nell'aggiornamento del sensore")
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Modifica Sensore</DialogTitle>
            <DialogDescription>
              Modifica le impostazioni del sensore <span className="font-medium">{sensor.location}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-sensorType">Tipo Sensore</Label>
              <Select value={sensorType} onValueChange={(v) => setSensorType(v as SensorType)}>
                <SelectTrigger id="edit-sensorType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SENSOR_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-location">Posizione nell'edificio *</Label>
              <Input
                id="edit-location"
                placeholder="es. Piano 1, Sala Server"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-serialNumber">Numero Seriale</Label>
              <Input
                id="edit-serialNumber"
                placeholder="es. SN-2024-001 (opzionale)"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-status">Stato</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as SensorStatus)}>
                <SelectTrigger id="edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SENSOR_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-transmissionInterval">Intervallo Trasmissione (secondi)</Label>
              <Input
                id="edit-transmissionInterval"
                type="number"
                min={10}
                max={3600}
                value={transmissionInterval}
                onChange={(e) => setTransmissionInterval(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Minimo 10s, massimo 3600s</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-minThreshold">Soglia Minima (opzionale)</Label>
                <Input
                  id="edit-minThreshold"
                  type="number"
                  step="0.01"
                  placeholder="es. 18.5"
                  value={minThreshold}
                  onChange={(e) => setMinThreshold(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-maxThreshold">Soglia Massima (opzionale)</Label>
                <Input
                  id="edit-maxThreshold"
                  type="number"
                  step="0.01"
                  placeholder="es. 26.0"
                  value={maxThreshold}
                  onChange={(e) => setMaxThreshold(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={updateSensor.isPending}>
              {updateSensor.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salva Modifiche
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
