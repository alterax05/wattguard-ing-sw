import type React from "react"

import { useState, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
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
import { toast } from "sonner"
import { useCreateBuilding, useBuildingTypes } from "@/hooks/use-buildings"
import { Loader2, Search, MapPin } from "lucide-react"
import L from "leaflet"
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet"

const TRENTO_CENTER: [number, number] = [46.0667, 11.1167]
const DEFAULT_ZOOM = 14

interface AddBuildingDialogProps {
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

  // SAFETY: the Nominatim search endpoint returns a JSON array of places with lat/lon strings on 200.
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

export function AddBuildingDialog({ onClose }: AddBuildingDialogProps) {
  const createBuilding = useCreateBuilding()
  const { data: buildingTypesData, isLoading: typesLoading } =
    useBuildingTypes()
  const { t } = useTranslation()

  const [formData, setFormData] = useState({
    name: "",
    address: "",
    surface: "",
    ceilingHeight: "3.0",
    buildingType: "",
    heatingSystemType: "",
    constructionYear: "",
    geographicZone: "",
    latitude: "",
    longitude: "",
  })

  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null)
  const [geocoding, setGeocoding] = useState(false)

  const markerPosition: [number, number] | null =
    formData.latitude && formData.longitude
      ? [parseFloat(formData.latitude), parseFloat(formData.longitude)]
      : null

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleGeocode = useCallback(async () => {
    if (!formData.address.trim()) {
      toast.error(t("buildings.form.geocodeNoAddress"))
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
        toast.success(t("buildings.form.coordinatesFound"))
      } else {
        toast.error(t("buildings.form.addressNotFound"), {
          description: t("buildings.form.addressNotFoundHint"),
        })
      }
    } catch {
      toast.error(t("buildings.form.geocodeError"))
    } finally {
      setGeocoding(false)
    }
  }, [formData.address, t])

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setFormData((prev) => ({
      ...prev,
      latitude: lat.toFixed(6),
      longitude: lng.toFixed(6),
    }))
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const surface = parseFloat(formData.surface)
    const ceilingHeight = parseFloat(formData.ceilingHeight)
    const lat = parseFloat(formData.latitude)
    const lng = parseFloat(formData.longitude)

    if (isNaN(surface) || surface < 0) {
      toast.error(t("buildings.form.surfaceInvalid"))
      return
    }

    if (isNaN(ceilingHeight) || ceilingHeight < 0.5) {
      toast.error(t("buildings.form.ceilingHeightInvalid"))
      return
    }

    if (isNaN(lat) || isNaN(lng)) {
      toast.error(t("buildings.form.coordinatesInvalid"))
      return
    }

    createBuilding.mutate(
      {
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
      },
      {
        onSuccess: () => {
          toast.success(t("buildings.created"))
          onClose()
        },
        onError: (err) => {
          toast.error(t("buildings.createError"), {
            description: err.message,
          })
        },
      }
    )
  }

  const isPending = createBuilding.isPending

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogCloseButton />
        <DialogHeader>
          <DialogTitle>{t("buildings.addTitle")}</DialogTitle>
          <DialogDescription>
            {t("buildings.addDescription")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nome */}
          <div className="space-y-2">
            <Label htmlFor="building-name">{t("buildings.form.name")}</Label>
            <Input
              id="building-name"
              placeholder={t("buildings.form.namePlaceholder")}
              value={formData.name}
              onChange={(e) => { updateField("name", e.target.value) }}
              disabled={isPending}
              required
            />
          </div>

          {/* Indirizzo + Geocoding */}
          <div className="space-y-2">
            <Label htmlFor="building-address">{t("buildings.form.address")}</Label>
            <div className="flex gap-2">
              <Input
                id="building-address"
                placeholder={t("buildings.form.addressPlaceholder")}
                value={formData.address}
                onChange={(e) => { updateField("address", e.target.value) }}
                disabled={isPending}
                required
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => { void handleGeocode() }}
                disabled={isPending || geocoding || !formData.address.trim()}
                title={t("buildings.form.geocodeButton")}
              >
                {geocoding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("buildings.form.geocodeHint")}
            </p>
          </div>

          {/* Surface & Ceiling Height */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="building-surface">{t("buildings.form.surface")}</Label>
              <Input
                id="building-surface"
                type="number"
                min="0"
                step="any"
                placeholder={t("buildings.form.surfacePlaceholder")}
                value={formData.surface}
                onChange={(e) => { updateField("surface", e.target.value) }}
                disabled={isPending}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="building-ceiling">{t("buildings.form.ceilingHeight")}</Label>
              <Input
                id="building-ceiling"
                type="number"
                min="0.5"
                step="0.1"
                placeholder={t("buildings.form.ceilingHeightPlaceholder")}
                value={formData.ceilingHeight}
                onChange={(e) => { updateField("ceilingHeight", e.target.value) }}
                disabled={isPending}
                required
              />
            </div>
          </div>

          {/* Construction Year */}
          <div className="space-y-2">
            <Label htmlFor="building-year">{t("buildings.form.constructionYear")}</Label>
            <Input
              id="building-year"
              type="number"
              min="1000"
              max={new Date().getFullYear() + 10}
              placeholder={t("buildings.form.constructionYearPlaceholder")}
              value={formData.constructionYear}
              onChange={(e) => { updateField("constructionYear", e.target.value) }}
              disabled={isPending}
            />
          </div>

          {/* Tipo edificio */}
          <div className="space-y-2">
            <Label htmlFor="building-type">{t("buildings.form.type")}</Label>
            <Select
              value={formData.buildingType}
              onValueChange={(value) => { updateField("buildingType", value) }}
              disabled={isPending || typesLoading}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    typesLoading
                      ? t("buildings.form.typesLoading")
                      : t("buildings.form.typePlaceholder")
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

          {/* Two columns: Riscaldamento + Zona */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="building-heating">{t("buildings.form.heatingSystem")}</Label>
              <Input
                id="building-heating"
                placeholder={t("buildings.form.heatingSystemPlaceholder")}
                value={formData.heatingSystemType}
                onChange={(e) => {
                  updateField("heatingSystemType", e.target.value)
                }}
                disabled={isPending}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="building-zone">{t("buildings.form.geographicZone")}</Label>
              <Input
                id="building-zone"
                placeholder={t("buildings.form.geographicZonePlaceholder")}
                value={formData.geographicZone}
                onChange={(e) => { updateField("geographicZone", e.target.value) }}
                disabled={isPending}
                required
              />
            </div>
          </div>

          {/* Coordinates */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              {t("buildings.form.location")}
            </Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="building-lat" className="text-xs text-muted-foreground">
                  {t("buildings.form.latitude")}
                </Label>
                <Input
                  id="building-lat"
                  type="number"
                  step="any"
                  placeholder={t("buildings.form.latitudePlaceholder")}
                  value={formData.latitude}
                  onChange={(e) => { updateField("latitude", e.target.value) }}
                  disabled={isPending}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="building-lng" className="text-xs text-muted-foreground">
                  {t("buildings.form.longitude")}
                </Label>
                <Input
                  id="building-lng"
                  type="number"
                  step="any"
                  placeholder={t("buildings.form.longitudePlaceholder")}
                  value={formData.longitude}
                  onChange={(e) => { updateField("longitude", e.target.value) }}
                  disabled={isPending}
                  required
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("buildings.form.mapHint")}
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
                center={TRENTO_CENTER}
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
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isPending || !formData.buildingType}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("buildings.creating")}
                </>
              ) : (
                t("buildings.create")
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
