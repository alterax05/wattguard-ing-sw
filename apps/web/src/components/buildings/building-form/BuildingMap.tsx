import { useEffect } from "react"
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet"
import { buildingMarkerIcon } from "./marker-icon"
import { DEFAULT_ZOOM } from "./geocode"

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

interface BuildingMapProps {
  position: [number, number] | null
  center: [number, number] | null
  defaultCenter?: [number, number]
  onPositionChange: (lat: number, lng: number) => void
}

// Compound map component: handles pan, click and marker internally.
// Consumers compose it by providing position/center and change handler.
export function BuildingMap({
  position,
  center,
  defaultCenter,
  onPositionChange,
}: BuildingMapProps) {
  const mapCenter = center ?? defaultCenter ?? null

  return (
    <div className="overflow-hidden rounded-md border">
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        crossOrigin=""
      />
      <MapContainer
        center={defaultCenter ?? (position ?? [46.0667, 11.1167])}
        zoom={DEFAULT_ZOOM}
        zoomControl={true}
        className="h-64 w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        {mapCenter && <MapPanTo center={mapCenter} />}
        <MapClickHandler onClick={onPositionChange} />
        {position && <Marker position={position} icon={buildingMarkerIcon} />}
      </MapContainer>
    </div>
  )
}
