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
import { useCreateSensor, type SensorType } from "@/hooks/use-sensors"

const SENSOR_TYPE_OPTIONS: { value: SensorType; label: string }[] = [
  { value: "internal_temp", label: "Temperatura Interna" },
  { value: "external_temp", label: "Temperatura Esterna" },
  { value: "energy_meter", label: "Contatore Energia" },
  { value: "gas_meter", label: "Contatore Gas" },
]

interface AddSensorDialogProps {
  buildingId: string
  buildingName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddSensorDialog({ buildingId, buildingName, open, onOpenChange }: AddSensorDialogProps) {
  const createSensor = useCreateSensor()

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!sensorType) {
      toast.error("Seleziona il tipo di sensore")
      return
    }
    if (!location.trim()) {
      toast.error("Inserisci la posizione del sensore")
      return
    }

    const interval = parseInt(transmissionInterval, 10)
    if (isNaN(interval) || interval < 10 || interval > 3600) {
      toast.error("L'intervallo di trasmissione deve essere tra 10 e 3600 secondi")
      return
    }

    createSensor.mutate(
      {
        buildingId,
        sensorType,
        location: location.trim(),
        ...(serialNumber.trim() ? { serialNumber: serialNumber.trim() } : {}),
        transmissionInterval: interval,
        ...(minThreshold.trim() ? { minThreshold: parseFloat(minThreshold) } : {}),
        ...(maxThreshold.trim() ? { maxThreshold: parseFloat(maxThreshold) } : {}),
      },
      {
        onSuccess: () => {
          toast.success("Sensore creato con successo")
          resetForm()
          onOpenChange(false)
        },
        onError: (error) => {
          toast.error(error.message || "Errore nella creazione del sensore")
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Aggiungi Sensore</DialogTitle>
            <DialogDescription>
              Aggiungi un nuovo sensore a <span className="font-medium">{buildingName}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="sensorType">Tipo Sensore *</Label>
              <Select value={sensorType} onValueChange={(v) => setSensorType(v as SensorType)}>
                <SelectTrigger id="sensorType">
                  <SelectValue placeholder="Seleziona tipo..." />
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
              <Label htmlFor="location">Posizione nell'edificio *</Label>
              <Input
                id="location"
                placeholder="es. Piano 1, Sala Server"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="serialNumber">Numero Seriale</Label>
              <Input
                id="serialNumber"
                placeholder="es. SN-2024-001 (opzionale)"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="transmissionInterval">Intervallo Trasmissione (secondi)</Label>
              <Input
                id="transmissionInterval"
                type="number"
                min={10}
                max={3600}
                value={transmissionInterval}
                onChange={(e) => setTransmissionInterval(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Minimo 10s, massimo 3600s (default: 90s)</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="minThreshold">Soglia Minima (opzionale)</Label>
                <Input
                  id="minThreshold"
                  type="number"
                  step="0.01"
                  placeholder="es. 18.5"
                  value={minThreshold}
                  onChange={(e) => setMinThreshold(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="maxThreshold">Soglia Massima (opzionale)</Label>
                <Input
                  id="maxThreshold"
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
            <Button type="submit" disabled={createSensor.isPending}>
              {createSensor.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crea Sensore
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
