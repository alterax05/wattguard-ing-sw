import type React from "react"

import { useState, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
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
import { getBuildingStatusLabel } from "@/lib/building-status"


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
  const { t } = useTranslation()

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
          toast.success(t("buildings.updated"))
          onClose()
        },
        onError: (err) => {
          toast.error(t("buildings.updateError"), {
            description: err.message,
          })
        },
      }
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

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
          <DialogTitle>{t("buildings.editTitle")}</DialogTitle>
          <DialogDescription>
            {t("buildings.editDescription")}
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
              onChange={(e) => updateField("name", e.target.value)}
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
                onChange={(e) => updateField("surface", e.target.value)}
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
                onChange={(e) => updateField("ceilingHeight", e.target.value)}
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
              onChange={(e) => updateField("constructionYear", e.target.value)}
              disabled={isPending}
            />
          </div>

          {/* Tipo edificio + Stato */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="building-type">{t("buildings.form.type")}</Label>
              <Select
                value={formData.buildingType}
                onValueChange={(value) => updateField("buildingType", value)}
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

            <div className="space-y-2">
              <Label htmlFor="building-status">{t("common.status")}</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => updateField("status", value)}
                disabled={isPending}
              >
                <SelectTrigger id="building-status">
                  <SelectValue placeholder={t("buildings.form.statusPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{getBuildingStatusLabel("active", t)}</SelectItem>
                  <SelectItem value="inactive">{getBuildingStatusLabel("inactive", t)}</SelectItem>
                  <SelectItem value="decommissioned">{getBuildingStatusLabel("decommissioned", t)}</SelectItem>
                </SelectContent>
              </Select>
              {formData.status === "decommissioned" && (
                <p className="text-xs text-destructive">
                  {t("buildings.form.decommissionWarning")}
                </p>
              )}
            </div>
          </div>

          {/* Two columns: Riscaldamento + Zona */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="building-heating">{t("buildings.form.heatingSystem")}</Label>
              <Input
                id="building-heating"
                placeholder={t("buildings.form.heatingSystemPlaceholder")}
                value={formData.heatingSystemType}
                onChange={(e) =>
                  updateField("heatingSystemType", e.target.value)
                }
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
                  onChange={(e) => updateField("latitude", e.target.value)}
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
                  onChange={(e) => updateField("longitude", e.target.value)}
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
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isPending || !formData.buildingType}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("buildings.saving")}
                </>
              ) : (
                t("buildings.saveChanges")
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
            <AlertDialogTitle>{t("buildings.decommissionConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("buildings.decommissionConfirmDescription", { name: building.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                setConfirmDecommission(false)
                performUpdate()
              }}
              disabled={isPending}
            >
              {t("buildings.decommissionConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
