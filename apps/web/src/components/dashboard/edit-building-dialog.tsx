import type React from "react"

import { useState, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import { toast } from "sonner"
import { useUpdateBuilding, useBuildingTypes, type BuildingDetail } from "@/hooks/use-buildings"
import { Loader2, Search, MapPin } from "lucide-react"
import L from "leaflet"
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet"


const DEFAULT_ZOOM = 14

interface EditBuildingDialogProps {
  building: BuildingDetail
  onClose: () => void
}

// ── Nominatim geocoding ────────────────────────────────────────────────────

async function geocodeAddress(
  address: string
): Promise<{ lat: number; lon: number } | null> {
  const params = new URLSearchParams({
    q: address,
    format: "json",
    limit: "1",
  })

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    {
      headers: { "User-Agent": "WattGuard/1.0" },
    }
  )

  if (!res.ok) return null

  const results = (await res.json()) as { lat: string; lon: string }[]
  const first = results[0]
  if (!first) return null

  return {
    lat: parseFloat(first.lat),
    lon: parseFloat(first.lon),
  }
}

// ── Map helper components ──────────────────────────────────────────────────

function MapPanTo({ center }: { center: [number, number] | null }) {
  const map = useMap()

  useEffect(() => {
    if (center) {
      map.setView(center, Math.max(map.getZoom(), 16))
    }
  }, [center, map])

  return null
}

function MapClickHandler({
  onClick,
}: {
  onClick: (lat: number, lng: number) => void
}) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

const markerIcon = L.divIcon({
  html: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="12" fill="#0F5132" stroke="white" stroke-width="2"/>
    <circle cx="16" cy="16" r="4" fill="white"/>
  </svg>`,
  className: "",
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})

// ── Dialog component ───────────────────────────────────────────────────────

export function EditBuildingDialog({ building, onClose }: EditBuildingDialogProps) {
  const updateBuilding = useUpdateBuilding()
  const { data: buildingTypesData, isLoading: typesLoading } =
    useBuildingTypes()

  const [formData, setFormData] = useState({
    name: building.name,
    address: building.address,
    surface: building.surface.toString(),
    ceilingHeight: building.ceilingHeight ? building.ceilingHeight.toString() : "3.0",
    buildingType: typeof building.buildingType === 'string' ? building.buildingType : building.buildingType.id,
    heatingSystemType: building.heatingSystemType,
    constructionYear: building.constructionYear ? building.constructionYear.toString() : "",
    geographicZone: building.geographicZone,
    status: building.status,
    latitude: building.location.coordinates[1].toString(),
    longitude: building.location.coordinates[0].toString(),
  })

  const [mapCenter, setMapCenter] = useState<[number, number]>([
    building.location.coordinates[1],
    building.location.coordinates[0]
  ])
  const [geocoding, setGeocoding] = useState(false)
  const [confirmDecommission, setConfirmDecommission] = useState(false)

  const markerPosition: [number, number] | null =
    formData.latitude && formData.longitude
      ? [parseFloat(formData.latitude), parseFloat(formData.longitude)]
      : null

  const surface = parseFloat(formData.surface)
  const ceilingHeight = parseFloat(formData.ceilingHeight)
  const lat = parseFloat(formData.latitude)
  const lng = parseFloat(formData.longitude)

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleGeocode = useCallback(async () => {
    if (!formData.address.trim()) {
      toast.error("Inserisci un indirizzo prima di cercare le coordinate")
      return
    }

    setGeocoding(true)
    try {
      const result = await geocodeAddress(formData.address)
      if (result) {
        setFormData((prev) => ({
          ...prev,
          latitude: result.lat.toFixed(6),
          longitude: result.lon.toFixed(6),
        }))
        setMapCenter([result.lat, result.lon])
        toast.success("Coordinate trovate")
      } else {
        toast.error("Indirizzo non trovato", {
          description:
            "Prova a inserire un indirizzo più specifico o posiziona il marker sulla mappa",
        })
      }
    } catch {
      toast.error("Errore nella ricerca delle coordinate")
    } finally {
      setGeocoding(false)
    }
  }, [formData.address])

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setFormData((prev) => ({
      ...prev,
      latitude: lat.toFixed(6),
      longitude: lng.toFixed(6),
    }))
  }, [])

  const performUpdate = () => {
    updateBuilding.mutate(
      {
        id: building.id,
        name: formData.name,
        address: formData.address,
        surface,
        ceilingHeight,
        location: {
          type: "Point",
          coordinates: [lng, lat], // GeoJSON: [longitude, latitude]
        },
        buildingType: formData.buildingType,
        heatingSystemType: formData.heatingSystemType,
        constructionYear: formData.constructionYear
          ? parseInt(formData.constructionYear)
          : undefined,
        geographicZone: formData.geographicZone,
        status: formData.status,
      },
      {
        onSuccess: () => {
          toast.success("Edificio aggiornato con successo")
          onClose()
        },
        onError: (err) => {
          toast.error("Errore nell'aggiornamento dell'edificio", {
            description: err.message,
          })
        },
      }
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (isNaN(surface) || surface < 0) {
      toast.error("La superficie deve essere un numero positivo")
      return
    }

    if (isNaN(ceilingHeight) || ceilingHeight < 0.5) {
      toast.error("L'altezza soffitto deve essere almeno 0.5m")
      return
    }

    if (isNaN(lat) || isNaN(lng)) {
      toast.error("Inserisci coordinate valide o cerca l'indirizzo")
      return
    }

    if (formData.status === "decommissioned" && building.status !== "decommissioned") {
      setConfirmDecommission(true)
      return
    }

    performUpdate()
  }

  const isPending = updateBuilding.isPending

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Modifica Edificio</DialogTitle>
          <DialogDescription>
            Modifica i dettagli dell'edificio esistente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nome */}
          <div className="space-y-2">
            <Label htmlFor="building-name">Nome *</Label>
            <Input
              id="building-name"
              placeholder="es. Scuola Elementare Dante"
              value={formData.name}
              onChange={(e) => updateField("name", e.target.value)}
              disabled={isPending}
              required
            />
          </div>

          {/* Indirizzo + Geocoding */}
          <div className="space-y-2">
            <Label htmlFor="building-address">Indirizzo *</Label>
            <div className="flex gap-2">
              <Input
                id="building-address"
                placeholder="es. Via Roma 1, Trento"
                value={formData.address}
                onChange={(e) => updateField("address", e.target.value)}
                disabled={isPending}
                required
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleGeocode}
                disabled={isPending || geocoding || !formData.address.trim()}
                title="Cerca coordinate dall'indirizzo"
              >
                {geocoding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Inserisci l'indirizzo e premi il pulsante di ricerca per trovare
              le coordinate automaticamente
            </p>
          </div>

          {/* Surface & Ceiling Height */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="building-surface">Superficie (m&sup2;) *</Label>
              <Input
                id="building-surface"
                type="number"
                min="0"
                step="any"
                placeholder="es. 1500"
                value={formData.surface}
                onChange={(e) => updateField("surface", e.target.value)}
                disabled={isPending}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="building-ceiling">Altezza Soffitto (m) *</Label>
              <Input
                id="building-ceiling"
                type="number"
                min="0.5"
                step="0.1"
                placeholder="es. 3.0"
                value={formData.ceilingHeight}
                onChange={(e) => updateField("ceilingHeight", e.target.value)}
                disabled={isPending}
                required
              />
            </div>
          </div>

          {/* Construction Year */}
          <div className="space-y-2">
            <Label htmlFor="building-year">Anno di costruzione</Label>
            <Input
              id="building-year"
              type="number"
              min="1000"
              max={new Date().getFullYear() + 10}
              placeholder="es. 1985"
              value={formData.constructionYear}
              onChange={(e) => updateField("constructionYear", e.target.value)}
              disabled={isPending}
            />
          </div>

          {/* Tipo edificio + Stato */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="building-type">Tipo edificio *</Label>
              <Select
                value={formData.buildingType}
                onValueChange={(value) => updateField("buildingType", value)}
                disabled={isPending || typesLoading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      typesLoading
                        ? "Caricamento tipologie..."
                        : "Seleziona tipo edificio"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {buildingTypesData?.buildingTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="building-status">Stato</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => updateField("status", value)}
                disabled={isPending}
              >
                <SelectTrigger id="building-status">
                  <SelectValue placeholder="Seleziona stato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Attivo</SelectItem>
                  <SelectItem value="inactive">Inattivo</SelectItem>
                  <SelectItem value="decommissioned">Dismesso</SelectItem>
                </SelectContent>
              </Select>
              {formData.status === "decommissioned" && (
                <p className="text-xs text-destructive">
                  Attenzione: la dismissione è un'azione definitiva e richiede
                  conferma al salvataggio.
                </p>
              )}
            </div>
          </div>

          {/* Two columns: Riscaldamento + Zona */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="building-heating">Tipo riscaldamento *</Label>
              <Input
                id="building-heating"
                placeholder="es. Centralizzato a gas"
                value={formData.heatingSystemType}
                onChange={(e) =>
                  updateField("heatingSystemType", e.target.value)
                }
                disabled={isPending}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="building-zone">Zona geografica *</Label>
              <Input
                id="building-zone"
                placeholder="es. Centro"
                value={formData.geographicZone}
                onChange={(e) => updateField("geographicZone", e.target.value)}
                disabled={isPending}
                required
              />
            </div>
          </div>

          {/* Coordinates */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              Posizione *
            </Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="building-lat" className="text-xs text-muted-foreground">
                  Latitudine
                </Label>
                <Input
                  id="building-lat"
                  type="number"
                  step="any"
                  placeholder="es. 46.0667"
                  value={formData.latitude}
                  onChange={(e) => updateField("latitude", e.target.value)}
                  disabled={isPending}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="building-lng" className="text-xs text-muted-foreground">
                  Longitudine
                </Label>
                <Input
                  id="building-lng"
                  type="number"
                  step="any"
                  placeholder="es. 11.1167"
                  value={formData.longitude}
                  onChange={(e) => updateField("longitude", e.target.value)}
                  disabled={isPending}
                  required
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Clicca sulla mappa per posizionare il marker oppure inserisci le
              coordinate manualmente
            </p>
          </div>

          {/* Interactive Map */}
          <div className="space-y-2">
            <div className="overflow-hidden rounded-md border">
              <link
                rel="stylesheet"
                href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
                crossOrigin=""
              />
              <MapContainer
                center={mapCenter}
                zoom={DEFAULT_ZOOM}
                zoomControl={true}
                className="h-64 w-full"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  maxZoom={19}
                />
                <MapPanTo center={mapCenter} />
                <MapClickHandler onClick={handleMapClick} />
                {markerPosition && (
                  <Marker position={markerPosition} icon={markerIcon} />
                )}
              </MapContainer>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              Annulla
            </Button>
            <Button
              type="submit"
              disabled={isPending || !formData.buildingType}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvataggio in corso...
                </>
              ) : (
                "Salva Modifiche"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>

      <AlertDialog
        open={confirmDecommission}
        onOpenChange={setConfirmDecommission}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma dismissione</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per marcare "{building.name}" come{" "}
              <span className="font-semibold">Dismesso</span>. Questa è
              un'operazione definitiva: l'edificio non sarà più considerato
              operativo nelle analisi e nei report.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                setConfirmDecommission(false)
                performUpdate()
              }}
              disabled={isPending}
            >
              Conferma dismissione
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
