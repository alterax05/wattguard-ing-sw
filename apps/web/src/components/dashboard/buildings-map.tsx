import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useBuildings, type BuildingSummary } from "@/hooks/use-buildings";
import { Card, CardContent } from "@/components/ui/card";
import {
  Building2,
  Activity,
  MapPin,
  X,
  AlertCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { BuildingStatusBadge } from "./building-status-badge";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  Marker,
  Tooltip,
  useMap,
} from "react-leaflet";

const TRENTO_CENTER: [number, number] = [46.0667, 11.1167];

function getBuildingTypeName(bt: BuildingSummary["buildingType"]): string {
  if (typeof bt === "string") return bt;
  return bt.name;
}

function createBuildingIcon(isActive: boolean, isSelected: boolean) {
  const size = isSelected ? 36 : 28;
  const bg = isActive ? "#0F5132" : "#6b7280";

  const svg = `
    <svg width="${size + 10}" height="${size + 10}" viewBox="0 0 ${size + 10} ${size + 10}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${(size + 10) / 2}" cy="${(size + 10) / 2}" r="${size / 2}" fill="${bg}" stroke="white" strokeWidth="2"/>
      <svg x="${(size + 10) / 2 - 8}" y="${(size + 10) / 2 - 8}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 10h.01" />
        <path d="M12 14h.01" />
        <path d="M12 6h.01" />
        <path d="M16 10h.01" />
        <path d="M16 14h.01" />
        <path d="M16 6h.01" />
        <path d="M8 10h.01" />
        <path d="M8 14h.01" />
        <path d="M8 6h.01" />
        <path d="M9 22v-3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
        <rect x="4" y="2" width="16" height="20" rx="2" />
      </svg>
    </svg>
  `;

  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [size + 10, size + 10],
    iconAnchor: [(size + 10) / 2, (size + 10) / 2],
  });
}

function MapController({ center }: { center: [number, number] | null }) {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.panTo(center);
    }
  }, [center, map]);

  return null;
}

export function BuildingsMap() {
  const { data, isLoading, isError } = useBuildings();
  const { t } = useTranslation();
  const [selectedBuilding, setSelectedBuilding] =
    useState<BuildingSummary | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="space-y-4 text-center">
          <Skeleton className="mx-auto h-12 w-12 rounded-full" />
          <Skeleton className="mx-auto h-4 w-48" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-destructive" />
          <p className="font-medium text-destructive">{t("map.loadError")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("map.loadErrorDescription")}
          </p>
        </div>
      </div>
    );
  }

  const buildings = data.buildings;

  return (
    <div className="relative h-full w-full">
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        crossOrigin=""
      />

      <MapContainer
        center={TRENTO_CENTER}
        zoom={14}
        zoomControl={true}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        <MapController
          center={
            selectedBuilding
              ? [
                  selectedBuilding.location.coordinates[1],
                  selectedBuilding.location.coordinates[0],
                ]
              : null
          }
        />

        {buildings.map((building) => {
          const isActive = building.status === "active";
          const isSelected = selectedBuilding?.id === building.id;
          const icon = createBuildingIcon(isActive, isSelected);

          return (
            <Marker
              key={building.id}
              position={[
                building.location.coordinates[1],
                building.location.coordinates[0],
              ]}
              icon={icon}
              eventHandlers={{
                click: () => {
                  setSelectedBuilding(building);
                },
              }}
            >
              <Tooltip
                direction="bottom"
                offset={[0, 10]}
                className="building-tooltip"
              >
                {building.name}
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Selected building info panel */}
      {selectedBuilding && (
        <Card className="absolute right-4 top-4 z-[1000] w-80 shadow-lg">
          <CardContent>
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-start gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
                  <Building2 className="h-4 w-4 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">
                    {selectedBuilding.name}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {getBuildingTypeName(selectedBuilding.buildingType)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBuilding(null)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {selectedBuilding.address}
            </div>

            <div className="mb-2">
              <p className="text-xs text-muted-foreground">{t("map.surface")}</p>
              <p className="text-xs font-medium">
                {selectedBuilding.surface} {t("common.squareMeters")}
              </p>
            </div>

            <div className="mb-3 flex items-center gap-2">
              <BuildingStatusBadge
                status={selectedBuilding.status}
                icon={<Activity className="mr-1 h-3 w-3" />}
                className="text-xs"
              />
            </div>

            <div className="mb-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {t("map.heatingSystem")}
              </span>{" "}
              {selectedBuilding.heatingSystemType}
            </div>
            <div className="mb-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{t("map.zone")}</span>{" "}
              {selectedBuilding.geographicZone}
            </div>

            <Link
              to={`/dashboard/buildings/${selectedBuilding.id}`}
              className="block w-full rounded-md bg-primary px-3 py-2 text-center text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t("map.viewDetails")}
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
